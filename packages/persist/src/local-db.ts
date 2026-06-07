// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/persist — SQLite Local Cache (better-sqlite3)
// ─────────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';
import type { MemoryEntry, MemoryType, LifecycleStage } from '@mutimemoagent/core';

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function now(): number {
  return Date.now();
}

function checksumOf(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ─────────────────────────────────────────────────────────────────
// LocalDB
// ─────────────────────────────────────────────────────────────────

export class LocalDB {
  private db: Database.Database | null = null;

  // ── Initialization ──────────────────────────────────────────

  /**
   * Open (or create) the SQLite database at `dbPath` and ensure
   * all tables, indexes, and the FTS5 virtual table exist.
   */
  initialize(dbPath: string): void {
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent reads
    this.db.pragma('journal_mode = WAL');

    // ── Schema ──────────────────────────────────────────────
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id                    TEXT PRIMARY KEY NOT NULL,
        agent_id              TEXT NOT NULL,
        content               TEXT NOT NULL,
        memory_type           TEXT NOT NULL,
        structured_data       TEXT DEFAULT NULL,

        -- lifecycle
        lifecycle_stage       TEXT NOT NULL DEFAULT 'working',
        created_at            INTEGER NOT NULL,
        last_accessed_at      INTEGER NOT NULL,
        access_count          INTEGER NOT NULL DEFAULT 0,
        consolidation_count   INTEGER NOT NULL DEFAULT 0,
        ttl_ms                INTEGER DEFAULT NULL,

        -- relations
        parent_id             TEXT DEFAULT NULL,
        child_ids             TEXT DEFAULT '[]',
        merged_from           TEXT DEFAULT '[]',
        duplicate_of          TEXT DEFAULT NULL,
        conflicts_with        TEXT DEFAULT '[]',

        -- evolution
        version               INTEGER NOT NULL DEFAULT 1,
        changelog             TEXT DEFAULT '[]',
        fitness_score         REAL NOT NULL DEFAULT 0.5,
        evolution_round       INTEGER NOT NULL DEFAULT 0,
        last_mutated_at       INTEGER DEFAULT NULL,

        -- metadata
        confidence            REAL NOT NULL DEFAULT 0.5,
        source                TEXT NOT NULL DEFAULT 'agent',
        tags                  TEXT DEFAULT '[]',
        language              TEXT DEFAULT NULL,
        file_refs             TEXT DEFAULT '[]',
        agent_refs            TEXT DEFAULT '[]',
        importance_score      REAL NOT NULL DEFAULT 0.0,

        -- local cache
        checksum              TEXT NOT NULL,
        indexed_at            INTEGER NOT NULL,
        fts5_rowid            INTEGER DEFAULT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_agent
        ON memory_entries(agent_id);
      CREATE INDEX IF NOT EXISTS idx_memory_type
        ON memory_entries(memory_type);
      CREATE INDEX IF NOT EXISTS idx_memory_created
        ON memory_entries(created_at);
      CREATE INDEX IF NOT EXISTS idx_memory_accessed
        ON memory_entries(last_accessed_at);
      CREATE INDEX IF NOT EXISTS idx_memory_ttl
        ON memory_entries(ttl_ms);
      CREATE INDEX IF NOT EXISTS idx_memory_checksum
        ON memory_entries(checksum);
    `);

    // ── FTS5 virtual table ──────────────────────────────────
    // Content-sync so it stays consistent with memory_entries
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts
        USING fts5(
          id UNINDEXED,
          content,
          agent_id UNINDEXED,
          memory_type UNINDEXED,
          tags,
          content=memory_entries,
          content_rowid=rowid
        );
    `);

    // ── Vector store table ──────────────────────────────────
    // Stores raw embedding data alongside a rowid link.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vector_store (
        id          TEXT PRIMARY KEY NOT NULL,
        entry_id    TEXT NOT NULL,
        dimension   INTEGER NOT NULL,
        vector_blob BLOB NOT NULL,
        FOREIGN KEY (entry_id) REFERENCES memory_entries(id)
      );
      CREATE INDEX IF NOT EXISTS idx_vector_entry
        ON vector_store(entry_id);
    `);

    // ── Schema version ──────────────────────────────────────
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );
    `);
    const row = this.db
      .prepare('SELECT version FROM schema_version LIMIT 1')
      .get() as { version: number } | undefined;
    if (!row) {
      this.db
        .prepare('INSERT INTO schema_version (version) VALUES (?)')
        .run(SCHEMA_VERSION);
    }

    // ── Triggers to keep FTS in sync ────────────────────────
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memory_fts_insert
        AFTER INSERT ON memory_entries BEGIN
          INSERT INTO memory_fts(rowid, id, content, agent_id, memory_type, tags)
          VALUES (new.rowid, new.id, new.content, new.agent_id, new.memory_type, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memory_fts_delete
        AFTER DELETE ON memory_entries BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, id, content, agent_id, memory_type, tags)
          VALUES ('delete', old.rowid, old.id, old.content, old.agent_id, old.memory_type, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memory_fts_update
        AFTER UPDATE ON memory_entries BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, id, content, agent_id, memory_type, tags)
          VALUES ('delete', old.rowid, old.id, old.content, old.agent_id, old.memory_type, old.tags);
          INSERT INTO memory_fts(rowid, id, content, agent_id, memory_type, tags)
          VALUES (new.rowid, new.id, new.content, new.agent_id, new.memory_type, new.tags);
      END;
    `);
  }

  // ── Guard ─────────────────────────────────────────────────

  private ensureOpen(): Database.Database {
    if (!this.db) {
      throw new Error('LocalDB not initialized. Call initialize(dbPath) first.');
    }
    return this.db;
  }

  // ── CRUD ─────────────────────────────────────────────────

  /**
   * Insert or replace (UPSERT) a MemoryEntry into the local cache.
   * Computes the checksum and indexed_at from the entry content.
   */
  insert(entry: MemoryEntry): void {
    const d = this.ensureOpen();

    const cs = checksumOf(entry.content);
    const indexedNow = now();

    const stmt = d.prepare(`
      INSERT INTO memory_entries (
        id, agent_id, content, memory_type, structured_data,
        lifecycle_stage, created_at, last_accessed_at, access_count,
        consolidation_count, ttl_ms,
        parent_id, child_ids, merged_from, duplicate_of, conflicts_with,
        version, changelog, fitness_score, evolution_round, last_mutated_at,
        confidence, source, tags, language, file_refs, agent_refs, importance_score,
        checksum, indexed_at
      ) VALUES (
        @id, @agent_id, @content, @memory_type, @structured_data,
        @lifecycle_stage, @created_at, @last_accessed_at, @access_count,
        @consolidation_count, @ttl_ms,
        @parent_id, @child_ids, @merged_from, @duplicate_of, @conflicts_with,
        @version, @changelog, @fitness_score, @evolution_round, @last_mutated_at,
        @confidence, @source, @tags, @language, @file_refs, @agent_refs, @importance_score,
        @checksum, @indexed_at
      )
      ON CONFLICT(id) DO UPDATE SET
        content            = excluded.content,
        memory_type        = excluded.memory_type,
        structured_data    = excluded.structured_data,
        lifecycle_stage    = excluded.lifecycle_stage,
        last_accessed_at   = excluded.last_accessed_at,
        access_count       = excluded.access_count,
        consolidation_count= excluded.consolidation_count,
        ttl_ms             = excluded.ttl_ms,
        parent_id          = excluded.parent_id,
        child_ids          = excluded.child_ids,
        merged_from        = excluded.merged_from,
        duplicate_of       = excluded.duplicate_of,
        conflicts_with     = excluded.conflicts_with,
        version            = excluded.version,
        changelog          = excluded.changelog,
        fitness_score      = excluded.fitness_score,
        evolution_round    = excluded.evolution_round,
        last_mutated_at    = excluded.last_mutated_at,
        confidence         = excluded.confidence,
        source             = excluded.source,
        tags               = excluded.tags,
        language           = excluded.language,
        file_refs          = excluded.file_refs,
        agent_refs         = excluded.agent_refs,
        importance_score   = excluded.importance_score,
        checksum           = excluded.checksum,
        indexed_at         = excluded.indexed_at
    `);

    stmt.run({
      id: entry.id,
      agent_id: entry.agent_id,
      content: entry.content,
      memory_type: entry.memory_type,
      structured_data: entry.structured_data
        ? JSON.stringify(entry.structured_data)
        : null,
      lifecycle_stage: entry.lifecycle.stage,
      created_at: entry.lifecycle.created_at,
      last_accessed_at: entry.lifecycle.last_accessed_at,
      access_count: entry.lifecycle.access_count,
      consolidation_count: entry.lifecycle.consolidation_count,
      ttl_ms: entry.lifecycle.ttl_ms ?? null,
      parent_id: entry.relations.parent_id ?? null,
      child_ids: JSON.stringify(entry.relations.child_ids),
      merged_from: JSON.stringify(entry.relations.merged_from),
      duplicate_of: entry.relations.duplicate_of ?? null,
      conflicts_with: JSON.stringify(entry.relations.conflicts_with),
      version: entry.evolution.version,
      changelog: JSON.stringify(entry.evolution.changelog),
      fitness_score: entry.evolution.fitness_score,
      evolution_round: entry.evolution.evolution_round,
      last_mutated_at: entry.evolution.last_mutated_at ?? null,
      confidence: entry.metadata.confidence,
      source: entry.metadata.source,
      tags: JSON.stringify(entry.metadata.tags),
      language: entry.metadata.language ?? null,
      file_refs: JSON.stringify(entry.metadata.file_refs ?? []),
      agent_refs: JSON.stringify(entry.metadata.agent_refs ?? []),
      importance_score: entry.metadata.importance_score,
      checksum: cs,
      indexed_at: indexedNow,
    });
  }

  /**
   * Full-text search across content and tags using FTS5.
   * Returns hydrated MemoryEntry objects.
   */
  search(query: string, limit = 20): MemoryEntry[] {
    const d = this.ensureOpen();

    // Sanitise simple queries for FTS5 syntax
    const sanitised = query.replace(/['"]/g, '');

    const rows = d
      .prepare(
        `SELECT e.* FROM memory_entries e
         INNER JOIN memory_fts f ON e.rowid = f.rowid
         WHERE memory_fts MATCH @query
         ORDER BY rank
         LIMIT @limit`,
      )
      .all({ query: sanitised, limit }) as Array<Record<string, unknown>>;

    return rows.map((r) => this.rowToEntry(r));
  }

  /**
   * Retrieve a single entry by its UUID.
   */
  getById(id: string): MemoryEntry | null {
    const d = this.ensureOpen();
    const row = d
      .prepare('SELECT * FROM memory_entries WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToEntry(row) : null;
  }

  /**
   * Delete a memory entry and its FTS / vector store records.
   */
  deleteById(id: string): void {
    const d = this.ensureOpen();
    d.prepare('DELETE FROM vector_store WHERE entry_id = ?').run(id);
    d.prepare('DELETE FROM memory_entries WHERE id = ?').run(id);
  }

  /**
   * Record an access event: increment access_count and touch
   * last_accessed_at.
   */
  updateAccess(id: string): void {
    const d = this.ensureOpen();
    d.prepare(
      `UPDATE memory_entries
       SET access_count = access_count + 1,
           last_accessed_at = ?
       WHERE id = ?`,
    ).run(now(), id);
  }

  /**
   * Return entries whose TTL has expired (ttl_ms is non-null and
   * the entry has outlived its TTL from created_at).
   *
   * @param threshold - number of milliseconds before now to use as
   *                    the expiry reference point.
   */
  getExpiredEntries(threshold: number): MemoryEntry[] {
    const d = this.ensureOpen();
    const cutoff = now() - threshold;
    const rows = d
      .prepare(
        `SELECT * FROM memory_entries
         WHERE ttl_ms IS NOT NULL
           AND (created_at + ttl_ms) < ?
         ORDER BY (created_at + ttl_ms) ASC`,
      )
      .all(cutoff) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToEntry(r));
  }

  /**
   * Return entries indexed since a given timestamp (inclusive).
   * Used by incremental sync to find recently-added entries.
   */
  getEntriesIndexedSince(since: number): MemoryEntry[] {
    const d = this.ensureOpen();
    const rows = d
      .prepare(
        `SELECT * FROM memory_entries
         WHERE indexed_at >= ?
         ORDER BY indexed_at ASC`,
      )
      .all(since) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToEntry(r));
  }

  /**
   * Return summary statistics about the local cache.
   */
  getStats(): { count: number; size_bytes: number } {
    const d = this.ensureOpen();
    const countRow = d
      .prepare('SELECT COUNT(*) AS count FROM memory_entries')
      .get() as { count: number };
    const pageCount = d.pragma('page_count') as Array<{ page_count: number }>;
    const pageSize = d.pragma('page_size') as Array<{ page_size: number }>;
    const page_count_val = Array.isArray(pageCount)
      ? Number(pageCount[0]?.page_count ?? 0)
      : 0;
    const page_size_val = Array.isArray(pageSize)
      ? Number(pageSize[0]?.page_size ?? 4096)
      : 4096;

    return {
      count: countRow.count,
      size_bytes: page_count_val * page_size_val,
    };
  }

  // ── Row deserialiser ────────────────────────────────────────

  private rowToEntry(row: Record<string, unknown>): MemoryEntry {
    const parseJson = <T = unknown>(val: unknown, fallback: T): T => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val) as T;
        } catch {
          return fallback;
        }
      }
      return fallback;
    };

    return {
      id: row.id as string,
      agent_id: row.agent_id as string,
      content: row.content as string,
      memory_type: row.memory_type as MemoryType,
      structured_data: row.structured_data
        ? parseJson<Record<string, unknown>>(row.structured_data, {})
        : undefined,
      embeddings: undefined,

      lifecycle: {
        stage: row.lifecycle_stage as LifecycleStage,
        created_at: Number(row.created_at),
        last_accessed_at: Number(row.last_accessed_at),
        access_count: Number(row.access_count),
        consolidation_count: Number(row.consolidation_count),
        ttl_ms: row.ttl_ms ? Number(row.ttl_ms) : undefined,
      },

      relations: {
        parent_id: (row.parent_id as string) ?? undefined,
        child_ids: parseJson<string[]>(row.child_ids, []),
        merged_from: parseJson<string[]>(row.merged_from, []),
        duplicate_of: (row.duplicate_of as string) ?? undefined,
        conflicts_with: parseJson<string[]>(row.conflicts_with, []),
      },

      evolution: {
        version: Number(row.version),
        changelog: parseJson(row.changelog, []),
        fitness_score: Number(row.fitness_score),
        evolution_round: Number(row.evolution_round),
        last_mutated_at: row.last_mutated_at
          ? Number(row.last_mutated_at)
          : undefined,
      },

      metadata: {
        confidence: Number(row.confidence),
        source: row.source as MemoryEntry['metadata']['source'],
        tags: parseJson<string[]>(row.tags, []),
        language: (row.language as string) ?? undefined,
        file_refs: parseJson<string[]>(row.file_refs, []),
        agent_refs: parseJson<string[]>(row.agent_refs, []),
        importance_score: Number(row.importance_score),
      },

      local_cache: {
        checksum: row.checksum as string,
        indexed_at: Number(row.indexed_at),
        fts5_rowid: row.fts5_rowid ? Number(row.fts5_rowid) : undefined,
      },
    };
  }

  /**
   * Close the database connection cleanly.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
