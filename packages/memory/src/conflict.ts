// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/memory — ConflictDetector 冲突检测器
// ─────────────────────────────────────────────────────────────────

import type { MemoryEntry } from '@mutimemoagent/core';
import { generateId, now } from '@mutimemoagent/core';
import type { LocalDB } from './store.js';

// ═══════════════════════════════════════════════════════════════
// 冲突报告
// ═══════════════════════════════════════════════════════════════

export type ConflictType =
  | 'opposite_sentiment'   // 对同一实体矛盾情感
  | 'contradictory_fact'    // 矛盾事实
  | 'temporal_inconsistency'; // 时间不一致

export type ConflictResolutionStatus = 'pending' | 'resolved_a' | 'resolved_b' | 'merged' | 'dismissed';

export interface ConflictReport {
  entry_a: string;  // entry ID
  entry_b: string;  // entry ID
  entity: string;
  type: ConflictType;
  resolution_status: ConflictResolutionStatus;
  confidence: number;
  discovered_at: number;
}

// ═══════════════════════════════════════════════════════════════
// 实体情感提取（简易规则）
// ═══════════════════════════════════════════════════════════════

interface EntitySentiment {
  entity: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
}

// 简易情感词表
const POSITIVE_WORDS = new Set([
  'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
  'awesome', 'love', 'like', 'recommend', 'helpful', 'reliable',
  'fast', 'efficient', 'powerful', 'stable', 'secure', 'beautiful',
  'clean', 'simple', 'easy', 'robust',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike',
  'slow', 'unreliable', 'broken', 'buggy', 'crash', 'error',
  'failure', 'problem', 'issue', 'difficult', 'complex', 'ugly',
  'dirty', 'expensive', 'unstable', 'insecure',
]);

function detectSentiment(text: string): { sentiment: 'positive' | 'negative' | 'neutral'; confidence: number } {
  const lower = text.toLowerCase();
  let posCount = 0;
  let negCount = 0;

  for (const word of lower.split(/\W+/)) {
    if (POSITIVE_WORDS.has(word)) posCount++;
    if (NEGATIVE_WORDS.has(word)) negCount++;
  }

  if (posCount > negCount && posCount > 0) {
    return { sentiment: 'positive', confidence: Math.min(posCount / (posCount + negCount + 1) + 0.3, 1.0) };
  }
  if (negCount > posCount && negCount > 0) {
    return { sentiment: 'negative', confidence: Math.min(negCount / (posCount + negCount + 1) + 0.3, 1.0) };
  }
  return { sentiment: 'neutral', confidence: 0.2 };
}

function extractEntities(text: string): string[] {
  // 简易实体提取：大驼峰词、引号内短语、常见命名模式
  const entities: Set<string> = new Set();

  // 大驼峰 / PascalCase
  const camelMatches = text.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]*)+\b/g);
  if (camelMatches) camelMatches.forEach(e => entities.add(e));

  // 引号内短语
  const quoteMatches = text.match(/"([^"]+)"/g);
  if (quoteMatches) quoteMatches.forEach(e => entities.add(e.replace(/"/g, '')));

  // 特殊标记 @agent 或 #tag
  const tagMatches = text.match(/@[\w-]+/g);
  if (tagMatches) tagMatches.forEach(e => entities.add(e));

  return [...entities];
}

// ═══════════════════════════════════════════════════════════════
// ConflictDetector
// ═══════════════════════════════════════════════════════════════

export class ConflictDetector {
  private db: LocalDB;

  constructor(db: LocalDB) {
    this.db = db;
  }

  // ── 检测冲突 ──
  async detectConflicts(entries: MemoryEntry[]): Promise<ConflictReport[]> {
    const reports: ConflictReport[] = [];

    // 为每个条目提取实体 + 情感
    const analyzed: Array<{
      entry: MemoryEntry;
      entities: string[];
      sentiment: ReturnType<typeof detectSentiment>;
    }> = [];

    for (const entry of entries) {
      // 跳过已知冲突标记和合并结果
      if (entry.memory_type === 'conflict_flag' || entry.memory_type === 'merge_result') continue;
      // 跳过短期记忆，减少噪音
      if (entry.lifecycle.stage === 'forgotten' || entry.lifecycle.stage === 'archived') continue;

      const entities = extractEntities(entry.content);
      if (entities.length === 0) continue;

      const sentiment = detectSentiment(entry.content);
      analyzed.push({ entry, entities, sentiment });
    }

    // 两两比较
    for (let i = 0; i < analyzed.length; i++) {
      for (let j = i + 1; j < analyzed.length; j++) {
        const a = analyzed[i];
        const b = analyzed[j];

        // 找共同实体
        const commonEntities = a.entities.filter(e => b.entities.includes(e));
        if (commonEntities.length === 0) continue;

        for (const entity of commonEntities) {
          // 检查是否有相反观点
          if (
            a.sentiment.sentiment !== 'neutral' &&
            b.sentiment.sentiment !== 'neutral' &&
            a.sentiment.sentiment !== b.sentiment.sentiment
          ) {
            const confidence = (a.sentiment.confidence + b.sentiment.confidence) / 2;
            if (confidence >= 0.4) {
              reports.push({
                entry_a: a.entry.id,
                entry_b: b.entry.id,
                entity,
                type: 'opposite_sentiment',
                resolution_status: 'pending',
                confidence,
                discovered_at: Date.now(),
              });
            }
          }

          // 同一实体但内容明显矛盾 (长度差异过大但都在说相同实体，说明角度完全不同)
          if (
            a.entry.memory_type === 'fact' &&
            b.entry.memory_type === 'fact' &&
            !reports.some(r =>
              (r.entry_a === a.entry.id && r.entry_b === b.entry.id) ||
              (r.entry_a === b.entry.id && r.entry_b === a.entry.id)
            )
          ) {
            const aLen = a.entry.content.length;
            const bLen = b.entry.content.length;
            // 内容长度差异 > 5 倍且在讨论同一实体
            if (Math.max(aLen, bLen) / Math.min(aLen, bLen) > 5) {
              reports.push({
                entry_a: a.entry.id,
                entry_b: b.entry.id,
                entity,
                type: 'contradictory_fact',
                resolution_status: 'pending',
                confidence: 0.5,
                discovered_at: Date.now(),
              });
            }
          }
        }
      }
    }

    return reports;
  }

  // ── 创建冲突标记条目 ──
  createConflictFlag(entryA: MemoryEntry, entryB: MemoryEntry): MemoryEntry {
    const timestamp = now();
    const id = generateId();

    const flag: MemoryEntry = {
      id,
      agent_id: entryA.agent_id, // 使用第一个条目的 agent
      content: `CONFLICT: ${entryA.id} vs ${entryB.id}`,
      memory_type: 'conflict_flag',
      structured_data: {
        entry_a_id: entryA.id,
        entry_b_id: entryB.id,
        entry_a_summary: entryA.content.slice(0, 200),
        entry_b_summary: entryB.content.slice(0, 200),
      },
      lifecycle: {
        stage: 'working',
        created_at: timestamp,
        last_accessed_at: timestamp,
        access_count: 0,
        consolidation_count: 0,
        ttl_ms: 7 * 86400000, // 7 天 TTL
      },
      relations: {
        parent_id: undefined,
        child_ids: [],
        merged_from: [],
        duplicate_of: undefined,
        conflicts_with: [entryA.id, entryB.id],
      },
      evolution: {
        version: 1,
        changelog: [
          {
            timestamp,
            type: 'create',
            reason: `Auto-detected conflict between ${entryA.id} and ${entryB.id}`,
            agent_id: entryA.agent_id,
          },
        ],
        fitness_score: 0.3,
        evolution_round: 0,
        last_mutated_at: undefined,
      },
      metadata: {
        confidence: 0.6,
        source: 'inferred',
        tags: ['conflict', 'auto_detected'],
        language: undefined,
        file_refs: undefined,
        agent_refs: [entryA.agent_id, entryB.agent_id],
        importance_score: 0.7,
      },
      local_cache: undefined,
    };

    return flag;
  }

  // ── 解决冲突 ──
  resolveConflict(
    flagId: string,
    resolution: 'resolve_a' | 'resolve_b' | 'merge' | 'dismiss',
  ): void {
    const flag = this.db.getById(flagId);
    if (!flag) throw new Error(`Conflict flag not found: ${flagId}`);
    if (flag.memory_type !== 'conflict_flag') {
      throw new Error(`Entry ${flagId} is not a conflict flag`);
    }

    // SAFETY: structured_data can be any Record<string, unknown>, typed here for access
    const sd = flag.structured_data as Record<string, unknown>;
    const entryAId = sd?.entry_a_id as string;
    const entryBId = sd?.entry_b_id as string;

    if (!entryAId || !entryBId) {
      throw new Error(`Conflict flag ${flagId} missing entry references`);
    }

    switch (resolution) {
      case 'resolve_a': {
        // 删除 B / 标记 B 为重复
        const entryB = this.db.getById(entryBId);
        if (entryB) {
          entryB.relations.duplicate_of = entryAId;
          this.db.insert(entryB);
        }
        break;
      }
      case 'resolve_b': {
        const entryA = this.db.getById(entryAId);
        if (entryA) {
          entryA.relations.duplicate_of = entryBId;
          this.db.insert(entryA);
        }
        break;
      }
      case 'merge': {
        // 创建合并结果（但不实际合并，由上层决定如何 merge）
        // 标记两个条目彼此关联
        const entryA = this.db.getById(entryAId);
        const entryB = this.db.getById(entryBId);
        if (entryA && !entryA.relations.merged_from.includes(entryBId)) {
          entryA.relations.merged_from.push(entryBId);
          this.db.insert(entryA);
        }
        if (entryB && !entryB.relations.merged_from.includes(entryAId)) {
          entryB.relations.merged_from.push(entryAId);
          this.db.insert(entryB);
        }
        break;
      }
      case 'dismiss': {
        // 不做任何操作，只删除冲突标记
        break;
      }
    }

    // 删除冲突标记
    this.db.deleteById(flagId);
  }
}
