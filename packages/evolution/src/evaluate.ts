// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — 适应度评估
// ─────────────────────────────────────────────────────────────────

import type {
  MemoryEntry,
  AgentFitnessReport,
  DimensionScore,
} from '@mutimemoagent/core';

// ═══════════════════════════════════════════════════════════════
// AgentStats
// ═══════════════════════════════════════════════════════════════

export interface AgentStats {
  entry_count: number;
  queries_per_day: number;
  avg_response_ms: number;
  dependency_count: number;
  mutation_count_7d: number;
  new_relations_7d: number;
}

// ═══════════════════════════════════════════════════════════════
// FitnessEvaluator
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluates an agent's overall fitness across four dimensions:
 * - memory_quality (40%)
 * - usage_utility (25%)
 * - evolution_activity (20%)
 * - collaboration_contribution (15%)
 *
 * Each dimension produces a score 0–1, then combined via weighted average.
 */
export class FitnessEvaluator {
  // ── Public API ────────────────────────────────────────────────

  /**
   * Evaluate a single agent and return a full fitness report.
   */
  evaluate(
    agentId: string,
    entries: MemoryEntry[],
    stats: AgentStats,
  ): AgentFitnessReport {
    const memoryQuality = this.evaluateMemoryQuality(entries);
    const usageUtility = this.evaluateUsageUtility(stats);
    const evolutionActivity = this.evaluateEvolutionActivity(entries, stats);
    const collaboration = this.evaluateCollaborationContribution(entries);

    const overall = this.calculateOverallScore([
      memoryQuality,
      usageUtility,
      evolutionActivity,
      collaboration,
    ]);

    return {
      agent_id: agentId,
      timestamp: Date.now(),
      overall_score: overall,
      dimensions: {
        memory_quality: memoryQuality,
        usage_utility: usageUtility,
        evolution_activity: evolutionActivity,
        collaboration_contribution: collaboration,
      },
    };
  }

  /**
   * Weighted average of all dimension scores.
   * Weights: quality 0.4, utility 0.25, activity 0.2, collab 0.15
   */
  calculateOverallScore(dimensions: DimensionScore[]): number {
    const weights = [0.4, 0.25, 0.2, 0.15];
    let total = 0;
    for (let i = 0; i < dimensions.length; i++) {
      total += dimensions[i].score * weights[i];
    }
    return Math.round(total * 100) / 100;
  }

  /**
   * Generate human-readable improvement recommendations based on
   * the fitness report's dimension scores.
   */
  getRecommendations(report: AgentFitnessReport): string[] {
    const recs: string[] = [];
    const { dimensions } = report;

    if (dimensions.memory_quality.score < 0.5) {
      recs.push(
        'Memory quality is low. Consider consolidating stale entries and resolving conflicts.',
      );
      if ((dimensions.memory_quality.metrics.duplicate_ratio ?? 0) > 0.2) {
        recs.push('High duplicate ratio detected. Run deduplication to merge redundant entries.');
      }
      if ((dimensions.memory_quality.metrics.stale_ratio ?? 0) > 0.3) {
        recs.push('Many entries are stale. Review and archive or remove outdated knowledge.');
      }
    }

    if (dimensions.usage_utility.score < 0.5) {
      recs.push('Usage utility is low. Encourage more frequent queries and improve response time.');
      if ((dimensions.usage_utility.metrics.recall_precision ?? 0) < 0.6) {
        recs.push(
          'Recall precision is low. Consider improving embedding quality or FTS indexing.',
        );
      }
    }

    if (dimensions.evolution_activity.score < 0.4) {
      recs.push(
        'Evolution activity is low. Schedule more frequent mutation cycles or introduce new relations.',
      );
    }

    if (dimensions.collaboration_contribution.score < 0.4) {
      recs.push(
        'Cross-agent collaboration is weak. Create more cross-agent links and shared insights.',
      );
    }

    if (report.overall_score < 0.3) {
      recs.push(
        'Overall fitness is critically low. Consider archiving this agent and redistributing entries.',
      );
    }

    return recs;
  }

  // ── Dimension: Memory Quality (40%) ──────────────────────────

  private evaluateMemoryQuality(entries: MemoryEntry[]): DimensionScore {
    if (entries.length === 0) {
      return { score: 0, metrics: {} };
    }

    const avgConfidence =
      entries.reduce((sum, e) => sum + e.metadata.confidence, 0) /
      entries.length;

    // Duplicate detection via duplicate_of / merged_from fields
    const duplicateIds = new Set<string>();
    const mergedIds = new Set<string>();
    for (const e of entries) {
      if (e.relations.duplicate_of) duplicateIds.add(e.id);
      if (e.relations.merged_from.length > 0) mergedIds.add(e.id);
    }
    const duplicateCount = duplicateIds.size + mergedIds.size;
    const duplicateRatio = entries.length > 0 ? duplicateCount / entries.length : 0;

    // Stale: last accessed > 30 days ago or stage === 'archived'
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const staleCount = entries.filter(
      (e) =>
        now - e.lifecycle.last_accessed_at > thirtyDays ||
        e.lifecycle.stage === 'archived',
    ).length;
    const staleRatio = staleCount / entries.length;

    // Conflict count
    const conflictCount = entries.filter(
      (e) => e.relations.conflicts_with.length > 0,
    ).length;

    // Average importance
    const avgImportance =
      entries.reduce((sum, e) => sum + e.metadata.importance_score, 0) /
      entries.length;

    // Composite score
    const confidenceScore = avgConfidence;
    const dedupScore = 1 - duplicateRatio;
    const freshnessScore = 1 - staleRatio;
    const conflictScore = Math.max(0, 1 - conflictCount / Math.max(1, entries.length) * 5);
    const importanceScore = Math.min(1, avgImportance);

    const score =
      confidenceScore * 0.25 +
      dedupScore * 0.2 +
      freshnessScore * 0.2 +
      conflictScore * 0.15 +
      importanceScore * 0.2;

    return {
      score: Math.round(score * 100) / 100,
      metrics: {
        avg_confidence: Math.round(avgConfidence * 100) / 100,
        duplicate_ratio: Math.round(duplicateRatio * 100) / 100,
        stale_ratio: Math.round(staleRatio * 100) / 100,
        conflict_count: conflictCount,
        avg_importance: Math.round(avgImportance * 100) / 100,
      },
    };
  }

  // ── Dimension: Usage Utility (25%) ─────────────────────────────

  private evaluateUsageUtility(stats: AgentStats): DimensionScore {
    // Access frequency: normalized queries per day (cap at 50/d)
    const accessFreq = Math.min(1, stats.queries_per_day / 50);

    // Response time: 200ms ideal, 2000ms floor
    const respTime =
      stats.avg_response_ms <= 200
        ? 1
        : Math.max(0, 1 - (stats.avg_response_ms - 200) / 1800);

    // Dependency count as a sign of integration
    const depScore = Math.min(1, stats.dependency_count / 20);

    const score =
      accessFreq * 0.3 +
      respTime * 0.25 +
      depScore * 0.15;

    return {
      score: Math.round(score * 100) / 100,
      metrics: {
        access_frequency: Math.round(accessFreq * 100) / 100,
        recall_precision: Math.round(accessFreq * 100) / 100,
        avg_response_time: stats.avg_response_ms,
        dependency_count: stats.dependency_count,
      },
    };
  }

  // ── Dimension: Evolution Activity (20%) ──────────────────────

  private evaluateEvolutionActivity(
    entries: MemoryEntry[],
    stats: AgentStats,
  ): DimensionScore {
    const recentMutations = stats.mutation_count_7d;
    const newRelations = stats.new_relations_7d;
    const mutationScore = Math.min(1, recentMutations / 10);
    const relationScore = Math.min(1, newRelations / 10);

    // Knowledge growth: new entries over total
    const growthRate =
      entries.length > 0
        ? recentMutations / Math.max(1, entries.length)
        : 0;
    const growthScore = Math.min(1, growthRate * 5);

    // Novelty: entries with recent evolution rounds
    const recentEvolved = entries.filter((e) => {
      const lastMutated = e.evolution.last_mutated_at;
      return lastMutated && Date.now() - lastMutated < 7 * 24 * 60 * 60 * 1000;
    }).length;
    const noveltyScore = Math.min(1, recentEvolved / Math.max(1, entries.length) * 3);

    const score =
      mutationScore * 0.3 +
      relationScore * 0.25 +
      growthScore * 0.25 +
      noveltyScore * 0.2;

    return {
      score: Math.round(score * 100) / 100,
      metrics: {
        recent_mutations: recentMutations,
        new_relations: newRelations,
        knowledge_growth_rate: Math.round(growthRate * 100) / 100,
        novelty_score: Math.round(noveltyScore * 100) / 100,
      },
    };
  }

  // ── Dimension: Collaboration Contribution (15%) ─────────────

  private evaluateCollaborationContribution(
    entries: MemoryEntry[],
  ): DimensionScore {
    const crossAgentLinks = entries.filter(
      (e) =>
        e.memory_type === 'cross_agent_relation' ||
        (e.metadata.agent_refs && e.metadata.agent_refs.length > 0),
    ).length;

    const sharedInsights = entries.filter(
      (e) => e.memory_type === 'insight' && e.metadata.tags.includes('shared'),
    ).length;

    const conflictResolutions = entries.filter(
      (e) =>
        e.memory_type === 'conflict_flag' &&
        e.evolution.changelog.some((c) => c.type === 'merge' || c.type === 'refine'),
    ).length;

    const linkScore = Math.min(1, crossAgentLinks / 20);
    const insightScore = Math.min(1, sharedInsights / 10);
    const conflictScore = Math.min(1, conflictResolutions / 5);

    const score = linkScore * 0.4 + insightScore * 0.35 + conflictScore * 0.25;

    return {
      score: Math.round(score * 100) / 100,
      metrics: {
        cross_agent_links: crossAgentLinks,
        shared_insights: sharedInsights,
        conflict_resolutions: conflictResolutions,
      },
    };
  }
}
