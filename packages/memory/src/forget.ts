// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/memory — ForgettingEngine 遗忘引擎
// ─────────────────────────────────────────────────────────────────

import type { MemoryEntry, ForgettingAction, MemoryType } from '@mutimemoagent/core';
import { MEMORY_TIER_MAP } from '@mutimemoagent/core';
import type { XiamiClient, LocalDB } from './store.js';
import { LifecycleManager } from './lifecycle.js';

// ═══════════════════════════════════════════════════════════════
// 遗忘报告
// ═══════════════════════════════════════════════════════════════

export interface ForgettingReport {
  retained: number;
  consolidated: number;
  decayed: number;
  forgotten: number;
  conflicts_flagged: number;
}

// ═══════════════════════════════════════════════════════════════
// 辅助类型
// ═══════════════════════════════════════════════════════════════

export interface ForgettingDecision {
  entry: MemoryEntry;
  action: ForgettingAction;
  reason: string;
}

// ── Xiami forgetting API 签名 ──
interface XiamiForgettingInput {
  agent_id: string;
  memory_ids: string[];
  action: Exclude<ForgettingAction, 'flag_conflict'>;
}

interface XiamiDreamInput {
  agent_id: string;
  context: string;
  recent_forgotten_ids: string[];
}

// ═══════════════════════════════════════════════════════════════
// ForgettingEngine
// ═══════════════════════════════════════════════════════════════

export class ForgettingEngine {
  private client: XiamiClient;
  private db: LocalDB;
  private lifecycle: LifecycleManager;

  constructor(client: XiamiClient, db: LocalDB) {
    this.client = client;
    this.db = db;
    this.lifecycle = new LifecycleManager();
  }

  // ── 单条目决策逻辑 ──
  evaluate(entry: MemoryEntry): ForgettingAction {
    const tier = MEMORY_TIER_MAP[entry.memory_type] ?? 'short_term';

    // permanent 层级永远不丢弃
    if (tier === 'permanent') return 'retain';

    // 冲突标记条目：短期直接抛给冲突检测
    if (entry.memory_type === 'conflict_flag') {
      return 'flag_conflict';
    }

    const now = Date.now();
    const ageMs = now - entry.lifecycle.created_at;
    const ageDays = ageMs / 86400000;
    const accessCount = entry.lifecycle.access_count;
    const daysSinceAccess = (now - entry.lifecycle.last_accessed_at) / 86400000;

    // ── 高访问 + 近期活跃 → 合并 ──
    if (
      accessCount > 10 &&
      ageDays < 7 &&
      entry.lifecycle.stage === 'working'
    ) {
      return 'consolidate';
    }

    // ── 长期未访问且访问少 → 腐烂 ──
    if (daysSinceAccess > 90 && accessCount < 5) {
      if (daysSinceAccess > 365) return 'forget';
      // Very low importance + long stale → skip decay, go to forget
      if (entry.metadata.importance_score < 0.1 && daysSinceAccess > 180) return 'forget';
      return 'decay';
    }

    // ── 超 TTL 检查 ──
    const ttl = this.lifecycle.getTTL(entry.memory_type);
    if (ttl !== undefined) {
      if (ageMs > ttl * 2) {
        // 超过 2 倍 TTL
        return daysSinceAccess > 180 ? 'forget' : 'decay';
      }
      if (ageMs > ttl * 1.5 && daysSinceAccess > 60) {
        return 'decay';
      }
    }

    // ── 其他：保留 ──
    return 'retain';
  }

  // ── 批量决策 + 执行 ──
  async runCycle(agentId: string): Promise<ForgettingReport> {
    const report: ForgettingReport = {
      retained: 0,
      consolidated: 0,
      decayed: 0,
      forgotten: 0,
      conflicts_flagged: 0,
    };

    // 获取该 agent 的所有条目
    let allEntries: MemoryEntry[];
    try {
      allEntries = this.db.getAllByAgent(agentId);
    } catch {
      allEntries = [];
    }

    // 逐个评估
    const decisions: ForgettingDecision[] = [];
    for (const entry of allEntries) {
      const action = this.evaluate(entry);
      decisions.push({ entry, action, reason: `auto:${action}` });
    }

    // 按 action 分类执行
    const retainIds: string[] = [];
    const consolidateIds: string[] = [];
    const decayIds: string[] = [];
    const forgetIds: string[] = [];
    const conflictIds: string[] = [];

    for (const d of decisions) {
      switch (d.action) {
        case 'retain':
          retainIds.push(d.entry.id);
          break;
        case 'consolidate':
          consolidateIds.push(d.entry.id);
          break;
        case 'decay':
          decayIds.push(d.entry.id);
          break;
        case 'forget':
          forgetIds.push(d.entry.id);
          break;
        case 'flag_conflict':
          conflictIds.push(d.entry.id);
          break;
      }
    }

    // ── 执行 retain (标记访问) ──
    for (const id of retainIds) {
      const entry = allEntries.find(e => e.id === id);
      if (entry) {
        entry.lifecycle.last_accessed_at = Date.now();
        this.db.insert(entry);
        report.retained += 1;
      }
    }

    // ── 执行 consolidate (升迁到 consolidating) ──
    for (const id of consolidateIds) {
      const entry = allEntries.find(e => e.id === id);
      if (entry) {
        const promoted = this.lifecycle.promote(entry);
        this.db.insert(promoted);
        report.consolidated += 1;
      }
    }

    // ── 执行 decay (降级标记) ──
    for (const id of decayIds) {
      const entry = allEntries.find(e => e.id === id);
      if (entry) {
        const demoted = this.lifecycle.demote(entry);
        this.db.insert(demoted);
        report.decayed += 1;
      }
    }

    // ── 执行 forget (删除) ──
    for (const id of forgetIds) {
      this.db.deleteById(id);
      report.forgotten += 1;
    }

    // ── 冲突标记 (留给冲突检测处理) ──
    report.conflicts_flagged = conflictIds.length;

    // ── 通知 Xiami forgetting API ──
    if (forgetIds.length > 0) {
      try {
        const forgettingInput: XiamiForgettingInput = {
          agent_id: agentId,
          memory_ids: forgetIds,
          action: 'forget',
        };
        await this.client.runForgetting(agentId);
      } catch {
        // Xiami forgetting API 可选
      }
    }

    // ── 通知 Xiami dream API ──
    if (forgetIds.length > 0) {
      try {
        const dreamInput: XiamiDreamInput = {
          agent_id: agentId,
          context: `Forgetting cycle completed: ${forgetIds.length} memories forgotten`,
          recent_forgotten_ids: forgetIds,
        };
        // Dream API not available on XiamiClient interface
        console.debug(`[ForgettingEngine] Dream skipped: ${forgetIds.length} forgotten`);
      } catch {
        // Xiami dream API 可选
      }
    }

    return report;
  }
}
