// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/memory — MemoryStore 存储引擎
// ─────────────────────────────────────────────────────────────────

import type {
  ClassifiedItem,
  MemoryEntry,
  WriteResult,
  XiamiWriteInput,
  XiamiSearchInput,
  IStorageBackend,
  ILocalDB,
} from '@mutimemoagent/core';
import { chunkArray } from '@mutimemoagent/core';
import { createEntry, updateEntry } from './entry.js';

// ═══════════════════════════════════════════════════════════════
// MemoryStore
// ═══════════════════════════════════════════════════════════════

export class MemoryStore {
  private client: IStorageBackend;
  private db: ILocalDB;

  constructor(client: IStorageBackend, db: ILocalDB) {
    this.client = client;
    this.db = db;
  }

  // ── 单条写入流水线 ──
  async write(item: ClassifiedItem): Promise<{ entry: MemoryEntry; cloud_synced: boolean; error?: string }> {
    const entry = createEntry({
      agent_id: item.target_agent,
      content: item.content,
      memory_type: item.type,
      structured_data: item.structured_data,
      confidence: item.confidence,
      source: item.source as MemoryEntry['metadata']['source'],
      tags: item.tags,
    });

    // 1. 本地持久化
    this.db.insert(entry);

    // 2. 推送到 Xiami
    const xiamiInput: XiamiWriteInput = {
      agent_id: item.target_agent,
      content: entry.content,
      memory_type: entry.memory_type,
      metadata: {
        local_id: entry.id,
        confidence: entry.metadata.confidence,
        tags: entry.metadata.tags,
        source: entry.metadata.source,
        structured_data: entry.structured_data,
        lifecycle: entry.lifecycle,
        evolution_version: entry.evolution.version,
      },
      embeddings: entry.embeddings,
    };

    try {
      const result = await this.client.write(xiamiInput);
      // 更新本地记录，记录远程 ID
      const updated = updateEntry(entry, {
        reason: `Pushed to Xiami (remote_id=${result.id})`,
      });
      updated.metadata.tags.push('xiami_synced');
      this.db.insert(updated);
      return { entry: updated, cloud_synced: true };
    } catch (err: any) {
      console.error(`[MemoryStore] Xiami write failed: ${err.message}`);
      // Still write to local, but mark as sync-pending
      entry.metadata.tags.push('sync-pending');
      return { entry, cloud_synced: false, error: err.message };
    }
  }

  // ── 批量写入 ──
  async writeBatch(items: ClassifiedItem[]): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    const chunks = chunkArray(items, 100);

    for (const chunk of chunks) {
      // 创建设条目
      const entries = chunk.map(item =>
        createEntry({
          agent_id: item.target_agent,
          content: item.content,
          memory_type: item.type,
          structured_data: item.structured_data,
          confidence: item.confidence,
          source: item.source as MemoryEntry['metadata']['source'],
          tags: item.tags,
        })
      );

      // 本地批量写入
      for (const entry of entries) {
        this.db.insert(entry);
      }

      // 逐条推送 Xiami（批量 API 由客户端决定）
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const item = chunk[i];
        try {
          const xiamiInput: XiamiWriteInput = {
            agent_id: item.target_agent,
            content: entry.content,
            memory_type: entry.memory_type,
            metadata: {
              local_id: entry.id,
              confidence: entry.metadata.confidence,
              tags: entry.metadata.tags,
              source: entry.metadata.source,
            },
          };
          const result = await this.client.write(xiamiInput);
          const updated = updateEntry(entry, {
            reason: `Pushed to Xiami (remote_id=${result.id})`,
          });
          updated.metadata.tags.push('xiami_synced');
          this.db.insert(updated);
          results.push(updated);
        } catch {
          results.push(entry);
        }
      }
    }

    return results;
  }

  // ── 读取 ──
  async read(id: string): Promise<MemoryEntry | null> {
    // 本地优先
    const local = this.db.getById(id);
    if (local) {
      // 更新访问计数
      local.lifecycle.access_count += 1;
      local.lifecycle.last_accessed_at = Date.now();
      this.db.insert(local);
      return local;
    }

    // 回退到 Xiami (no direct read-by-id on persist XiamiClient, skip for now)
    return null;
  }

  // ── 更新 ──
  async update(id: string, patch: Partial<MemoryEntry>): Promise<MemoryEntry> {
    const existing = this.db.getById(id);
    if (!existing) {
      throw new Error(`MemoryEntry not found: ${id}`);
    }

    const updated = updateEntry(existing, patch);
    this.db.insert(updated);

    // 同步推送到 Xiami
    try {
      const xiamiInput: XiamiWriteInput = {
        agent_id: updated.agent_id,
        content: updated.content,
        memory_type: updated.memory_type,
        metadata: {
          local_id: updated.id,
          confidence: updated.metadata.confidence,
          tags: updated.metadata.tags,
          source: updated.metadata.source,
          lifecycle: updated.lifecycle,
          evolution_version: updated.evolution.version,
        },
      };
      await this.client.write(xiamiInput);
    } catch (err) {
      console.error(`[MemoryStore] Xiami update sync failed for ${id}:`, err);
    }

    return updated;
  }

  // ── 删除 ──
  async delete(id: string): Promise<void> {
    const entry = this.db.getById(id);
    if (!entry) return;

    // 删除本地
    this.db.deleteById(id);

    // 尝试推送删除到 Xiami (no delete API on persist, skip for now)
    return;
  }
}

// Re-export XiamiClient and LocalDB types for backward compatibility
export type XiamiClient = IStorageBackend;
export type LocalDB = ILocalDB;
