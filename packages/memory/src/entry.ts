// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/memory — MemoryEntry 工厂函数
// ─────────────────────────────────────────────────────────────────

import type {
  MemoryEntry,
  MemoryType,
  LifecycleStage,
  ChangeRecord,
} from '@mutimemoagent/core';
import { checksum, generateId, now } from '@mutimemoagent/core';
import { ImportanceScorer } from './importance.js';

// ═══════════════════════════════════════════════════════════════
// 创建参数
// ═══════════════════════════════════════════════════════════════

export interface CreateEntryParams {
  agent_id: string;
  content: string;
  memory_type: MemoryType;
  structured_data?: Record<string, unknown>;
  embeddings?: number[];
  /** 初始生命周期阶段 (默认 working) */
  stage?: LifecycleStage;
  /** 关联节点 */
  parent_id?: string;
  child_ids?: string[];
  merged_from?: string[];
  /** 如果提供，按 1 起步；否则从 0 开始 */
  version?: number;
  /** 元数据 */
  confidence?: number;
  source?: 'dialogue' | 'code' | 'manual' | 'inferred' | 'agent';
  tags?: string[];
  language?: string;
  file_refs?: string[];
  agent_refs?: string[];
  /** 可选初始进化分值 */
  fitness_score?: number;
  /** TTL 毫秒 */
  ttl_ms?: number;
}

// ═══════════════════════════════════════════════════════════════
// 创建条目
// ═══════════════════════════════════════════════════════════════

export function createEntry(params: CreateEntryParams): MemoryEntry {
  const id = generateId();
  const timestamp = now();
  const ver = params.version ?? 1;

  const entry: MemoryEntry = {
    id,
    agent_id: params.agent_id,
    content: params.content,
    memory_type: params.memory_type,
    structured_data: params.structured_data,
    embeddings: params.embeddings,
    lifecycle: {
      stage: params.stage ?? 'working',
      created_at: timestamp,
      last_accessed_at: timestamp,
      access_count: 0,
      consolidation_count: 0,
      ttl_ms: params.ttl_ms,
    },
    relations: {
      parent_id: params.parent_id,
      child_ids: params.child_ids ?? [],
      merged_from: params.merged_from ?? [],
      duplicate_of: undefined,
      conflicts_with: [],
    },
    evolution: {
      version: ver,
      changelog: [
        {
          timestamp,
          type: 'create',
          reason: 'Initial creation',
          agent_id: params.agent_id,
        },
      ],
      fitness_score: params.fitness_score ?? 0.5,
      evolution_round: 0,
      last_mutated_at: undefined,
    },
    metadata: {
      confidence: params.confidence ?? 0.8,
      source: params.source ?? 'manual',
      tags: params.tags ?? [],
      language: params.language,
      file_refs: params.file_refs,
      agent_refs: params.agent_refs,
      importance_score: 0.5, // will be overridden below
    },
    local_cache: {
      checksum: checksum(params.content),
      indexed_at: timestamp,
    },
  };

  // Auto-score importance using ImportanceScorer
  const scorer = new ImportanceScorer();
  entry.metadata.importance_score = scorer.score(entry);

  return entry;
}

// ═══════════════════════════════════════════════════════════════
// 条目补丁 — 部分更新 + 版本递增 + 变更记录
// ═══════════════════════════════════════════════════════════════

export interface EntryPatch {
  content?: string;
  memory_type?: MemoryType;
  structured_data?: Record<string, unknown>;
  embeddings?: number[];
  /** 生命周期变更 */
  stage?: LifecycleStage;
  /** 关系变更 */
  parent_id?: string;
  child_ids?: string[];
  merged_from?: string[];
  duplicate_of?: string;
  conflicts_with?: string[];
  /** 元数据变更 */
  confidence?: number;
  source?: 'dialogue' | 'code' | 'manual' | 'inferred' | 'agent';
  tags?: string[];
  language?: string;
  file_refs?: string[];
  agent_refs?: string[];
  importance_score?: number;
  /** 进化 */
  fitness_score?: number;
  ttl_ms?: number;
  /** 变更原因（必填，否则不记录 changelog） */
  reason?: string;
}

export function updateEntry(entry: MemoryEntry, patch: EntryPatch): MemoryEntry {
  const timestamp = now();
  const updated: MemoryEntry = JSON.parse(JSON.stringify(entry));

  // ── 浅层字段 ──
  if (patch.content !== undefined) {
    updated.content = patch.content;
    if (updated.local_cache) {
      updated.local_cache.checksum = checksum(patch.content);
    }
  }
  if (patch.memory_type !== undefined) updated.memory_type = patch.memory_type;
  if (patch.structured_data !== undefined) updated.structured_data = patch.structured_data;
  if (patch.embeddings !== undefined) updated.embeddings = patch.embeddings;

  // ── lifecycle ──
  if (patch.stage !== undefined) updated.lifecycle.stage = patch.stage;
  if (patch.ttl_ms !== undefined) updated.lifecycle.ttl_ms = patch.ttl_ms;

  // ── relations ──
  if (patch.parent_id !== undefined) updated.relations.parent_id = patch.parent_id;
  if (patch.child_ids !== undefined) updated.relations.child_ids = patch.child_ids;
  if (patch.merged_from !== undefined) updated.relations.merged_from = patch.merged_from;
  if (patch.duplicate_of !== undefined) updated.relations.duplicate_of = patch.duplicate_of;
  if (patch.conflicts_with !== undefined) updated.relations.conflicts_with = patch.conflicts_with;

  // ── metadata ──
  if (patch.confidence !== undefined) updated.metadata.confidence = patch.confidence;
  if (patch.source !== undefined) updated.metadata.source = patch.source;
  if (patch.tags !== undefined) updated.metadata.tags = patch.tags;
  if (patch.language !== undefined) updated.metadata.language = patch.language;
  if (patch.file_refs !== undefined) updated.metadata.file_refs = patch.file_refs;
  if (patch.agent_refs !== undefined) updated.metadata.agent_refs = patch.agent_refs;
  if (patch.importance_score !== undefined) updated.metadata.importance_score = patch.importance_score;

  // ── evolution ──
  if (patch.fitness_score !== undefined) updated.evolution.fitness_score = patch.fitness_score;

  // ── 版本递增 + changelog ──
  updated.evolution.version += 1;
  updated.evolution.last_mutated_at = timestamp;

  if (patch.reason || patch.content) {
    const record: ChangeRecord = {
      timestamp,
      type: 'update',
      previous_content: patch.content !== undefined ? entry.content : undefined,
      reason: patch.reason ?? 'Updated via patch',
      agent_id: entry.agent_id,
    };
    updated.evolution.changelog.push(record);
  }

  return updated;
}

// ═══════════════════════════════════════════════════════════════
// 合并多条条目
// ═══════════════════════════════════════════════════════════════

export function mergeEntries(entries: MemoryEntry[]): MemoryEntry {
  if (entries.length === 0) {
    throw new Error('mergeEntries requires at least one entry');
  }
  if (entries.length === 1) return entries[0];

  const timestamp = now();
  const primary = JSON.parse(JSON.stringify(entries[0])) as MemoryEntry;
  const rest = entries.slice(1);

  // ── 合并 content ──
  const allContents = entries.map(e => e.content);
  primary.content = allContents.join('\n---\n');
  primary.memory_type = 'merge_result';

  // ── 合并 tags ──
  const tagSet = new Set(primary.metadata.tags);
  for (const e of rest) {
    for (const t of e.metadata.tags) tagSet.add(t);
  }
  primary.metadata.tags = [...tagSet];

  // ── 合并 agent_refs ──
  const agentSet = new Set(primary.metadata.agent_refs ?? []);
  for (const e of rest) {
    if (e.metadata.agent_refs) {
      for (const a of e.metadata.agent_refs) agentSet.add(a);
    }
  }
  primary.metadata.agent_refs = [...agentSet];

  // ── 保留最高 confidence ──
  for (const e of rest) {
    if (e.metadata.confidence > primary.metadata.confidence) {
      primary.metadata.confidence = e.metadata.confidence;
    }
  }

  // ── 聚合 access_count / age ──
  for (const e of rest) {
    primary.lifecycle.access_count += e.lifecycle.access_count;
  }
  primary.lifecycle.stage = 'consolidating';
  primary.lifecycle.last_accessed_at = timestamp;
  primary.lifecycle.consolidation_count += 1;

  // ── 记录合并来源 ──
  primary.relations.merged_from = entries.map(e => e.id);
  primary.relations.child_ids = [];

  // ── 进化 ──
  primary.evolution.version += 1;
  primary.evolution.last_mutated_at = timestamp;
  primary.evolution.fitness_score =
    entries.reduce((s, e) => s + e.evolution.fitness_score, 0) / entries.length;

  primary.evolution.changelog.push({
    timestamp,
    type: 'merge',
    reason: `Merged ${entries.length} entries: [${entries.map(e => e.id).join(', ')}]`,
    agent_id: primary.agent_id,
  });

  // ── local_cache ──
  if (primary.local_cache) {
    primary.local_cache.checksum = checksum(primary.content);
    primary.local_cache.indexed_at = timestamp;
  }

  return primary;
}

// ═══════════════════════════════════════════════════════════════
// 拆分条目
// ═══════════════════════════════════════════════════════════════

export type SplitFunction = (entry: MemoryEntry) => MemoryEntry[];

export function splitEntry(entry: MemoryEntry, splitFn: SplitFunction): MemoryEntry[] {
  const timestamp = now();
  const children = splitFn(entry);

  if (children.length < 2) {
    // 没有实际拆分，返回原始条目
    return [entry];
  }

  // 为每个子条目生成独立 ID，保留父条目引用
  const result: MemoryEntry[] = children.map((child, i) => {
    const newEntry = JSON.parse(JSON.stringify(child)) as MemoryEntry;
    newEntry.id = generateId();
    newEntry.relations.parent_id = entry.id;
    newEntry.lifecycle.created_at = timestamp;
    newEntry.lifecycle.last_accessed_at = timestamp;
    newEntry.lifecycle.access_count = 0;
    newEntry.evolution.version = 1;
    newEntry.evolution.changelog = [
      {
        timestamp,
        type: 'split',
        reason: `Split from ${entry.id} (part ${i + 1}/${children.length})`,
        agent_id: entry.agent_id,
      },
    ];
    if (newEntry.local_cache) {
      newEntry.local_cache.checksum = checksum(newEntry.content);
      newEntry.local_cache.indexed_at = timestamp;
    }
    return newEntry;
  });

  // 更新父条目记录子条目
  const parent = JSON.parse(JSON.stringify(entry)) as MemoryEntry;
  parent.relations.child_ids = result.map(c => c.id);
  parent.evolution.version += 1;
  parent.evolution.last_mutated_at = timestamp;
  parent.evolution.changelog.push({
    timestamp,
    type: 'split',
    reason: `Split into ${children.length} entries: [${result.map(c => c.id).join(', ')}]`,
    agent_id: entry.agent_id,
  });

  return [parent, ...result];
}
