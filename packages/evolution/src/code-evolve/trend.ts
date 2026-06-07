// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — 代码变更趋势分析
// ─────────────────────────────────────────────────────────────────

import type { TrendReport } from '@mutimemoagent/core';

// ═══════════════════════════════════════════════════════════════
// TrendAnalyzer
// ═══════════════════════════════════════════════════════════════

/**
 * Analyzes historical code changes to identify trends in
 * hotspot migration, complexity, dependency health, and tech debt.
 */
export class TrendAnalyzer {
  /**
   * Analyze a sequence of code change events and produce a TrendReport.
   */
  analyzeTrend(
    changes: Array<{
      timestamp: number;
      type: string;
      nodeId: string;
      module: string;
    }>,
  ): TrendReport {
    const hotspotMigration = this.detectHotspotMigration(changes);
    const complexityTrend = this.computeComplexityTrend(changes);
    const dependencyHealth = this.computeDependencyHealth(changes);
    const techDebtIndicators = this.computeTechDebtIndicators(changes);

    return {
      hotspot_migration: hotspotMigration,
      complexity_trend: complexityTrend,
      dependency_health: dependencyHealth,
      tech_debt_indicators: techDebtIndicators,
      summary: '',
    };
  }

  /**
   * Generate a human-readable summary of the trend report.
   * In a production environment this could use an LLM; here
   * it builds a structured summary from the trend data.
   */
  async generateSummary(trends: TrendReport): Promise<string> {
    const lines: string[] = [];

    // Hotspot migration
    const rising = trends.hotspot_migration.filter((h) => h.direction === 'rising');
    const cooling = trends.hotspot_migration.filter((h) => h.direction === 'cooling');

    if (rising.length > 0) {
      lines.push(
        `📈 Rising modules: ${rising.map((r) => `${r.module} (${(r.change_rate * 100).toFixed(0)}%)`).join(', ')}`,
      );
    }
    if (cooling.length > 0) {
      lines.push(
        `📉 Cooling modules: ${cooling.map((c) => `${c.module} (${(c.change_rate * 100).toFixed(0)}%)`).join(', ')}`,
      );
    }

    // Complexity trend
    if (trends.complexity_trend.length >= 2) {
      const first = trends.complexity_trend[0];
      const last = trends.complexity_trend[trends.complexity_trend.length - 1];
      const dir = last > first ? 'increasing' : 'decreasing';
      lines.push(`🔧 Complexity is ${dir} (${first.toFixed(0)} → ${last.toFixed(0)} changes/bucket)`);
    }

    // Dependency health
    const depHealth = trends.dependency_health;
    if (depHealth < 0.3) {
      lines.push(`⚠️  Dependency health is low (${(depHealth * 100).toFixed(0)}%). Consider reducing new dependencies.`);
    } else if (depHealth > 0.7) {
      lines.push(`✅ Dependency health is good (${(depHealth * 100).toFixed(0)}%).`);
    } else {
      lines.push(`📊 Dependency health is moderate (${(depHealth * 100).toFixed(0)}%).`);
    }

    // Tech debt
    const techDebt = trends.tech_debt_indicators;
    if (techDebt > 0.7) {
      lines.push(`🧹 Low code removal rate (${((1 - techDebt) * 100).toFixed(0)}% removed). Consider cleaning up dead code.`);
    } else if (techDebt < 0.3) {
      lines.push(`👍 Healthy code turnover (${((1 - techDebt) * 100).toFixed(0)}% removed).`);
    }

    return lines.join('\n');
  }

  /**
   * Detect which modules are becoming hotspots (rising change frequency)
   * vs cooling down, by comparing change counts in the first vs second half.
   */
  detectHotspotMigration(
    changes: Array<{ timestamp: number; type: string; nodeId: string; module: string }>,
  ): Array<{ module: string; direction: 'rising' | 'cooling'; change_rate: number }> {
    if (changes.length < 4) {
      // Not enough data for meaningful hotspot detection
      return changes.length === 0
        ? []
        : Array.from(new Set(changes.map((c) => c.module))).map((module) => ({
            module,
            direction: 'rising' as const,
            change_rate: 0,
          }));
    }

    const midpoint = Math.floor(changes.length / 2);
    const firstHalf = changes.slice(0, midpoint);
    const secondHalf = changes.slice(midpoint);

    const countByModule = (slice: typeof changes): Map<string, number> => {
      const counts = new Map<string, number>();
      for (const c of slice) {
        counts.set(c.module, (counts.get(c.module) ?? 0) + 1);
      }
      return counts;
    };

    const firstCounts = countByModule(firstHalf);
    const secondCounts = countByModule(secondHalf);
    const allModules = new Set([
      ...firstCounts.keys(),
      ...secondCounts.keys(),
    ]);

    const result: Array<{
      module: string;
      direction: 'rising' | 'cooling';
      change_rate: number;
    }> = [];

    for (const module of allModules) {
      const first = firstCounts.get(module) ?? 0;
      const second = secondCounts.get(module) ?? 0;
      const total = first + second;

      if (total === 0) continue;

      // Normalized rate: (second - first) / total
      const rate = (second - first) / Math.max(1, total);

      // Only report meaningful shifts
      if (Math.abs(rate) > 0.1) {
        result.push({
          module,
          direction: rate > 0 ? 'rising' : 'cooling',
          change_rate: Math.round(Math.abs(rate) * 100) / 100,
        });
      }
    }

    // Sort by absolute change rate descending
    result.sort((a, b) => b.change_rate - a.change_rate);

    return result;
  }

  // ── Private computation methods ────────────────────────────

  /**
   * Compute complexity trend by bucketing changes over time.
   * Divides the time span into 10 equal buckets and counts changes per bucket.
   */
  private computeComplexityTrend(
    changes: Array<{ timestamp: number }>,
  ): number[] {
    if (changes.length === 0) return [];
    if (changes.length < 3) {
      return [changes.length];
    }

    const timestamps = changes.map((c) => c.timestamp);
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const span = maxTs - minTs;

    if (span === 0) return [changes.length];

    const bucketCount = 10;
    const buckets = new Array(bucketCount).fill(0);
    const bucketSize = span / bucketCount;

    for (const ts of timestamps) {
      const idx = Math.min(bucketCount - 1, Math.floor((ts - minTs) / bucketSize));
      buckets[idx]++;
    }

    return buckets;
  }

  /**
   * Compute dependency health as the ratio of new edges added vs total edges.
   * Higher ratio = more new dependencies being introduced (potentially unhealthy).
   * Lower ratio = stable dependency graph.
   */
  private computeDependencyHealth(
    changes: Array<{ type: string; nodeId: string }>,
  ): number {
    if (changes.length === 0) return 0.5;

    const addCount = changes.filter((c) =>
      c.type.toLowerCase().includes('add') || c.type === 'create',
    ).length;
    const removeCount = changes.filter((c) =>
      c.type.toLowerCase().includes('remove') || c.type === 'delete',
    ).length;

    const total = addCount + removeCount;
    if (total === 0) return 0.5;

    // Health = removed / total (higher removal = healthier = lower debt accumulation)
    // We want a healthy balance: health score near 0.5 is typical
    const removeRatio = removeCount / total;
    return Math.round(removeRatio * 100) / 100;
  }

  /**
   * Compute tech debt indicators based on the ratio of removed-to-total changes.
   * Low removal ratio suggests accumulating debt; high suggests healthy cleanup.
   */
  private computeTechDebtIndicators(
    changes: Array<{ type: string; nodeId: string }>,
  ): number {
    if (changes.length === 0) return 0.5;

    // Count removal-type changes
    const removedCount = changes.filter((c) => {
      const lower = c.type.toLowerCase();
      return lower.includes('remove') || lower.includes('delete') || lower === 'archived';
    }).length;

    // Tech debt score: 1 - (removed / total)
    // Lower removed ratio = higher tech debt
    const total = changes.length;
    const removedRatio = removedCount / total;

    // Normalize: low removal = high debt
    const debtScore = Math.max(0, Math.min(1, 1 - removedRatio * 3));
    return Math.round(debtScore * 100) / 100;
  }
}
