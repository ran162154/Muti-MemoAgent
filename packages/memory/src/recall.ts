// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/memory — RecallEngine 自适应召回引擎
// ─────────────────────────────────────────────────────────────────

import type { MemoryEntry, SearchResult, SearchQuery, CollaborativeResult } from '@mutimemoagent/core';
import { cosineSimilarity, extractSymbolPattern } from '@mutimemoagent/core';
import type { XiamiClient, LocalDB } from './store.js';

// ═══════════════════════════════════════════════════════════════
// Recall 上下文
// ═══════════════════════════════════════════════════════════════

export interface RecallContext {
  /** 限定 agent 范围 */
  agent_ids?: string[];
  /** 限定记忆类型 */
  memory_types?: string[];
  /** 最大结果数 (默认 20) */
  max_results?: number;
  /** 最低阈值 (默认 0.3) */
  threshold?: number;
  /** 是否启用多样性惩罚 (默认 true) */
  diversity_penalty?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// RecallEngine
// ═══════════════════════════════════════════════════════════════

export class RecallEngine {
  private client: XiamiClient;
  private db: LocalDB;

  constructor(client: XiamiClient, db: LocalDB) {
    this.client = client;
    this.db = db;
  }

  // ── 多路径召回 ──
  async recall(query: string, context?: RecallContext): Promise<SearchResult[]> {
    const maxResults = context?.max_results ?? 20;
    const threshold = context?.threshold ?? 0.3;

    const candidates: SearchResult[] = [];

    // 路径 1: FTS5 全文搜索
    try {
      const ftsResults = this.db.search(query, maxResults * 2);
      for (const entry of ftsResults) {
        candidates.push({
          entry,
          score: this.computeFtsScore(query, entry),
          match_type: 'fts5',
        });
      }
    } catch {
      // FTS 可能不可用
    }

    // 路径 2: 向量搜索 (如果有 embedding)
    try {
      // 对于没有 embedding 的条目，尝试从文本生成占位向量
      const queryEmbedding = this.hashEmbed(query);
      const allEntries = this.db.getAllByAgent('');
      for (const entry of allEntries) {
        if (candidates.some(c => c.entry.id === entry.id)) continue;
        // 简易向量相似度降级
        const entryEmbed = this.hashEmbed(entry.content);
        const sim = cosineSimilarity(queryEmbedding, entryEmbed);
        if (sim >= 0.3) {
          candidates.push({
            entry,
            score: sim,
            match_type: 'vector',
          });
        }
      }
    } catch {
      // 向量搜索可能不可用
    }

    // 路径 3: 符号匹配
    const symbol = extractSymbolPattern(query);
    if (symbol) {
      const allAgentEntries = this.db.getAllByAgent(''); // 空 = 跨 agent
      for (const entry of allAgentEntries) {
        // 跳过已有的
        if (candidates.some(c => c.entry.id === entry.id)) continue;
        const contentMatch =
          entry.content.includes(symbol) ||
          entry.structured_data?.symbol === symbol ||
          (entry.structured_data?.symbols as string[] ?? []).includes(symbol);

        if (contentMatch) {
          candidates.push({
            entry,
            score: 0.8, // 符号匹配固定高分
            match_type: 'symbol',
          });
        }
      }
    }

    // 路径 4: 关系图扩展
    const graphCandidates = await this.graphRecall(query, context);
    for (const gc of graphCandidates) {
      if (!candidates.some(c => c.entry.id === gc.entry.id)) {
        candidates.push(gc);
      }
    }

    // 筛选 + 排序
    let filtered = candidates.filter(c => c.score >= threshold);

    // 如果没有结果，降低阈值重试
    if (filtered.length === 0) {
      filtered = candidates.filter(c => c.score >= threshold * 0.5);
    }

    const ranked = this.rerank(filtered, query);

    return ranked.slice(0, maxResults);
  }

  // ── 重排序 ──
  rerank(candidates: SearchResult[], query: string): SearchResult[] {
    // 按 match_type 加权
    const typeWeight: Record<string, number> = {
      fts: 1.0,
      vector: 1.2,
      symbol: 1.5,
      graph: 1.3,
    };

    const scored = candidates.map(c => {
      const entry = c.entry;
      const baseScore = c.score * (typeWeight[c.match_type] ?? 1.0);

      // 访问计数提升
      const accessBoost = Math.min(entry.lifecycle.access_count / 20, 0.3);

      // 时间衰减
      const daysSinceAccess =
        (Date.now() - entry.lifecycle.last_accessed_at) / 86400000;
      const timeDecay = this.timeDecay(entry, daysSinceAccess);

      // 原始分 * 时间衰减 + 访问提升（限制在 0-1 之间）
      let finalScore = Math.min(baseScore * timeDecay + accessBoost, 1.0);

      // 重要性分数提升：高重要性条目推高排名
      // 公式：boostedScore = rawScore * (0.7 + 0.3 * importance_score)
      const importanceBoost = 0.7 + 0.3 * (entry.metadata.importance_score ?? 0.5);
      finalScore = finalScore * importanceBoost;

      return { ...c, score: finalScore };
    });

    // 按分数降序
    scored.sort((a, b) => b.score - a.score);

    // 多样性惩罚 — 避免同一 agent 占据所有结果
    const deduped: SearchResult[] = [];
    const agentCounts = new Map<string, number>();
    for (const c of scored) {
      const agentId = c.entry.agent_id;
      const count = agentCounts.get(agentId) ?? 0;
      const diversityPenalty = Math.min(count * 0.05, 0.3);
      const adjustedScore = c.score - diversityPenalty;
      c.score = Math.max(adjustedScore, 0);
      agentCounts.set(agentId, count + 1);
      deduped.push(c);
    }

    deduped.sort((a, b) => b.score - a.score);
    return deduped;
  }

  // ── 时间衰减 ──
  timeDecay(_entry: MemoryEntry, daysSinceAccess: number): number {
    if (daysSinceAccess <= 30) return 1.0;
    if (daysSinceAccess <= 90) return 0.5;
    if (daysSinceAccess <= 365) return 0.2;
    return 0.05;
  }

  // ── 图召回 — 遍历关联条目 ──
  private async graphRecall(
    _query: string,
    context?: RecallContext,
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    try {
      const allEntries = this.db.getAllByAgent('');
      const maxDepth = 2;

      for (const entry of allEntries) {
        // 查找有 child_ids 或 parent_id 的关联关系
        if (
          entry.relations.child_ids.length > 0 ||
          entry.relations.parent_id
        ) {
          // 简单关联分
          const depth = entry.relations.child_ids.length > 0 ? 1 : 2;
          if (depth <= maxDepth) {
            results.push({
              entry,
              score: 0.4 / depth,
              match_type: 'graph',
            });
          }
        }
      }
    } catch {
      // 图搜索失败时静默
    }
    return results;
  }

  // ── FTS5 简单评分 ──
  private computeFtsScore(query: string, entry: MemoryEntry): number {
    const q = query.toLowerCase();
    const text = entry.content.toLowerCase();
    let score = 0.5; // 基础分

    // 精确匹配加分
    if (text.includes(q)) score += 0.3;
    // 标题级加分（前 100 字符）
    if (text.slice(0, 100).includes(q)) score += 0.2;
    // 标签匹配加分
    for (const tag of entry.metadata.tags) {
      if (tag.toLowerCase().includes(q)) {
        score += 0.1;
        break;
      }
    }
    // 访问活跃加分
    score += Math.min(entry.lifecycle.access_count / 50, 0.1);
    // 重要性加分
    score += (entry.metadata.importance_score ?? 0.5) * 0.1;

    return Math.min(score, 1.0);
  }

  // ── 简易哈希嵌入（与 @mutimemoagent/core HashEmbedder 一致） ──
  private hashEmbed(text: string, dims = 256): number[] {
    const vec = new Array(dims).fill(0);
    for (let i = 0; i < text.length; i++) {
      const idx = text.charCodeAt(i) % dims;
      vec[idx] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < dims; i++) vec[i] /= norm;
    }
    return vec;
  }

  // ── 协作召回 — 跨 Agent 搜索 ──
  async collaborativeRecall(query: string): Promise<CollaborativeResult> {
    const results: SearchResult[] = [];

    try {
      // 从本地跨 agent 搜索
      const localCandidates = await this.recall(query, {
        max_results: 30,
        threshold: 0.2,
      });
      results.push(...localCandidates);

      // 尝试远程 Xiami 搜索
      const xiamiInput = { query, limit: 30, threshold: 0.3 };
      const remoteEntries = await this.client.search(xiamiInput);
      for (const entry of remoteEntries) {
        if (!results.some(r => r.entry.id === entry.id)) {
          results.push({
            entry,
            score: 0.5,
            match_type: 'graph',
          });
        }
      }
    } catch {
      // 远程搜索失败时只返回本地结果
    }

    const reranked = this.rerank(results, query);
    return {
      results: reranked.slice(0, 20),
      discovered_links: [],
    };
  }
}
