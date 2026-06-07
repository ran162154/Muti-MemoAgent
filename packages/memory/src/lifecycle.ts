// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/memory — LifecycleManager 生命周期管理器
// ─────────────────────────────────────────────────────────────────

import type { MemoryEntry, MemoryType, LifecycleStage } from '@mutimemoagent/core';
import { MEMORY_TIER_MAP, type MemoryTier } from '@mutimemoagent/core';

// ═══════════════════════════════════════════════════════════════
// 层级 → TTL 映射（毫秒）
// ═══════════════════════════════════════════════════════════════

const TIER_TTL: Record<MemoryTier, number | undefined> = {
  permanent: undefined,        // 永不过期
  long_term: 365 * 86400000,   // 1 年
  medium_term: 90 * 86400000,  // 90 天
  short_term: 30 * 86400000,   // 30 天
};

// ═══════════════════════════════════════════════════════════════
// 阶段跃迁规则
// ═══════════════════════════════════════════════════════════════

const PROMOTION_RULES: Array<{
  from: LifecycleStage[];
  to: LifecycleStage;
  condition: (entry: MemoryEntry) => boolean;
}> = [
  {
    from: ['working'],
    to: 'consolidating',
    condition: (e) =>
      e.lifecycle.access_count >= 5 &&
      Date.now() - e.lifecycle.created_at < 30 * 86400000,
  },
  {
    from: ['consolidating'],
    to: 'long-term',
    condition: (e) =>
      e.lifecycle.consolidation_count >= 2 &&
      e.evolution.fitness_score >= 0.7 &&
      e.lifecycle.access_count >= 10,
  },
  {
    from: ['working', 'consolidating', 'long-term'],
    to: 'archived',
    condition: (e) => {
      const tier = MEMORY_TIER_MAP[e.memory_type] ?? 'short_term';
      if (tier === 'permanent') return false;
      const ttl = TIER_TTL[tier];
      if (ttl === undefined) return false;
      const age = Date.now() - e.lifecycle.created_at;
      return age > ttl * 1.5; // 超 TTL 1.5 倍可归档
    },
  },
];

const DEMOTION_RULES: Array<{
  from: LifecycleStage[];
  to: LifecycleStage;
  condition: (entry: MemoryEntry) => boolean;
}> = [
  {
    from: ['long-term', 'consolidating'],
    to: 'working',
    condition: (e) => {
      const daysSinceAccess =
        (Date.now() - e.lifecycle.last_accessed_at) / 86400000;
      return daysSinceAccess > 90 && e.lifecycle.access_count < 5;
    },
  },
  {
    from: ['archived'],
    to: 'forgotten',
    condition: (e) => {
      const tier = MEMORY_TIER_MAP[e.memory_type] ?? 'short_term';
      if (tier === 'permanent') return false;
      const daysSinceAccess =
        (Date.now() - e.lifecycle.last_accessed_at) / 86400000;
      return daysSinceAccess > 180;
    },
  },
];

// ═══════════════════════════════════════════════════════════════
// LifecycleManager
// ═══════════════════════════════════════════════════════════════

export class LifecycleManager {
  /**
   * 升迁 — 检查条件并将条目提升到下一阶段
   */
  promote(entry: MemoryEntry): MemoryEntry {
    const updated = { ...entry, lifecycle: { ...entry.lifecycle } };

    for (const rule of PROMOTION_RULES) {
      if (rule.from.includes(updated.lifecycle.stage)) {
        // 深度拷贝用于条件检查（不变）
        if (rule.condition(entry)) {
          updated.lifecycle.stage = rule.to;
          updated.lifecycle.last_accessed_at = Date.now();
          updated.lifecycle.consolidation_count =
            rule.to === 'consolidating'
              ? updated.lifecycle.consolidation_count + 1
              : updated.lifecycle.consolidation_count;
          break;
        }
      }
    }

    return updated;
  }

  /**
   * 降级 — 不活跃或退化时将条目降级
   */
  demote(entry: MemoryEntry): MemoryEntry {
    for (const rule of DEMOTION_RULES) {
      if (rule.from.includes(entry.lifecycle.stage)) {
        if (rule.condition(entry)) {
          return {
            ...entry,
            lifecycle: {
              ...entry.lifecycle,
              stage: rule.to,
              last_accessed_at: Date.now(),
            },
          };
        }
      }
    }
    return entry;
  }

  /**
   * 是否应该合并 —— access_count > 10, age < 7 天, stage = working
   */
  shouldConsolidate(entry: MemoryEntry): boolean {
    const ageDays = (Date.now() - entry.lifecycle.created_at) / 86400000;
    return (
      entry.lifecycle.access_count > 10 &&
      ageDays < 7 &&
      entry.lifecycle.stage === 'working'
    );
  }

  /**
   * 获取记忆类型的默认 TTL（毫秒）
   */
  getTTL(memoryType: MemoryType): number | undefined {
    const tier = MEMORY_TIER_MAP[memoryType] ?? 'short_term';
    return TIER_TTL[tier];
  }
}

export { TIER_TTL as TIER_TTL_MAP };
