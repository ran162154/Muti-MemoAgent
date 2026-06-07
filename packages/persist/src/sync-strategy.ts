// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/persist — Sync Strategies
// ─────────────────────────────────────────────────────────────────

import type { MemoryEntry, XiamiWriteInput } from '@mutimemoagent/core';
import { XiamiClient } from './xiami-client.js';
import { LocalDB } from './local-db.js';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function entryToWriteInput(entry: MemoryEntry): XiamiWriteInput {
  return {
    agent_id: entry.agent_id,
    content: entry.content,
    memory_type: entry.memory_type,
    metadata: {
      ...entry.metadata,
      structured_data: entry.structured_data,
      lifecycle: entry.lifecycle,
      relations: entry.relations,
      evolution: entry.evolution,
    },
    embeddings: entry.embeddings,
  };
}

// ─────────────────────────────────────────────────────────────────
// SyncManager
// ─────────────────────────────────────────────────────────────────

export class SyncManager {
  private readonly client: XiamiClient;
  private readonly db: LocalDB;

  constructor(client: XiamiClient, db: LocalDB) {
    this.client = client;
    this.db = db;
  }

  // ── Full Sync (push) ───────────────────────────────────────

  /**
   * Push all local entries to the Xiami cloud, batching writes
   * in groups of up to 100. Returns the total number of entries
   * successfully synced.
   *
   * Falls back to individual writes if a batch write fails,
   * so a partial failure does not lose the entire batch.
   */
  async fullSync(agentId: string): Promise<number> {
    const stats = this.db.getStats();
    if (stats.count === 0) return 0;

    // Fetch all entries via a broad FTS search
    const results = this.db.search('', stats.count);
    let synced = 0;

    for (let i = 0; i < results.length; i += 100) {
      const batch = results.slice(i, i + 100);
      synced += await this.pushBatch(batch);
    }

    return synced;
  }

  // ── Incremental Sync (push) ───────────────────────────────

  /**
   * Push only entries that have been indexed or updated since
   * `since` (Unix epoch ms) to the Xiami cloud.
   * Returns the number of entries pushed.
   */
  async incrementalSync(
    agentId: string,
    since: number,
  ): Promise<number> {
    const entries = this.db.getEntriesIndexedSince(since);
    if (entries.length === 0) return 0;

    let synced = 0;
    for (let i = 0; i < entries.length; i += 100) {
      const batch = entries.slice(i, i + 100);
      synced += await this.pushBatch(batch);
    }

    return synced;
  }

  // ── Pull from Cloud ──────────────────────────────────────

  /**
   * Pull all entries for the given agent from Xiami into the
   * local SQLite cache using the cloud search endpoint.
   * Returns the number of entries pulled.
   */
  async pullFromCloud(agentId: string): Promise<number> {
    const cloudEntries = await this.client.search({
      agent_id: agentId,
      limit: 9999, // server-side cap may apply
    });

    if (cloudEntries.length === 0) return 0;

    for (const entry of cloudEntries) {
      this.db.insert(entry);
    }

    return cloudEntries.length;
  }

  // ── Internal ────────────────────────────────────────────

  /**
   * Push a batch of entries to Xiami, falling back to individual
   * writes on failure. Returns the number successfully pushed.
   */
  private async pushBatch(entries: MemoryEntry[]): Promise<number> {
    const inputs = entries.map(entryToWriteInput);
    let synced = 0;

    try {
      await this.client.writeBatch(inputs);
      synced = inputs.length;
    } catch (err) {
      console.error(
        `[SyncManager] batch write failed (batch=${inputs.length}):`,
        err,
      );
      // Fall back to individual writes for resilience
      for (const input of inputs) {
        try {
          await this.client.write(input);
          synced++;
        } catch (singleErr) {
          console.error(
            `[SyncManager] single write failed for agent=${input.agent_id}:`,
            singleErr,
          );
        }
      }
    }

    return synced;
  }
}
