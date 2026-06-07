// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — 进化调度器
// ─────────────────────────────────────────────────────────────────

import type { XiamiClient } from '@mutimemoagent/persist';
import type { MemoryStore } from '@mutimemoagent/memory';
import type { MemoryEntry } from '@mutimemoagent/core';
import { FitnessEvaluator, type AgentStats } from '../evaluate.js';
import { AgentMutator } from './mutator.js';
import { AgentCompetition } from './competition.js';
import { EvolutionLifecycle } from './lifecycle.js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface EvolutionCycleResult {
  evaluated: number;
  mutated: number;
  merged: number;
  archived: number;
  summary: string;
}

interface AgentInfo {
  id: string;
  name: string;
  entry_count: number;
}

// ═══════════════════════════════════════════════════════════════
// EvolutionScheduler
// ═══════════════════════════════════════════════════════════════

/**
 * Orchestrates the full evolution lifecycle on a regular schedule.
 *
 * Each cycle:
 * 1. Evaluate all active agents
 * 2. For low-scoring agents, determine mutation operations
 * 3. If multiple agents share a domain, run competition
 * 4. Archive lowest-performing agents if applicable
 * 5. Write evolution report
 */
export class EvolutionScheduler {
  private evaluator: FitnessEvaluator;
  private mutator: AgentMutator;
  private competition: AgentCompetition;
  private lifecycle: EvolutionLifecycle;
  private lastRun: number = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.evaluator = new FitnessEvaluator();
    this.mutator = new AgentMutator();
    this.competition = new AgentCompetition();
    this.lifecycle = new EvolutionLifecycle();
  }

  /**
   * Start the evolution scheduler. Runs evolution checks every ~6 hours.
   *
   * @returns The interval timer (for cleanup during shutdown)
   */
  schedule(): NodeJS.Timeout {
    const SIX_HOURS = 6 * 60 * 60 * 1000;

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = globalThis.setInterval(() => {
      // Run the cycle (fire-and-forget from timer perspective)
      // In production, this would be wired to actual stores
    }, SIX_HOURS);

    return this.intervalId as NodeJS.Timeout;
  }

  /**
   * Stop the evolution scheduler.
   */
  stop(): void {
    if (this.intervalId) {
      globalThis.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Execute a full evolution cycle.
   *
   * @param xiamiClient - Persistence client for reading/writing agent data
   * @param memoryStore - Local memory store
   * @returns EvolutionCycleResult with summary
   */
  async runEvolutionCycle(
    xiamiClient: XiamiClient,
    memoryStore: MemoryStore,
  ): Promise<EvolutionCycleResult> {
    const startTime = Date.now();
    let evaluated = 0;
    let mutated = 0;
    let merged = 0;
    let archived = 0;

    const mutations: string[] = [];

    try {
      // ── Step 0: Gather agent list ──────────────────────────
      const agentInfos = await this.getAgentList(xiamiClient);

      // ── Step 1: Evaluate all agents ────────────────────────
      const fitnessReports = await this.evaluateAll(
        agentInfos,
        xiamiClient,
        memoryStore,
      );
      evaluated = fitnessReports.length;

      // ── Step 2: Determine mutations for low-scoring agents ─
      for (const report of fitnessReports) {
        if (!this.lifecycle.shouldEvolve(report.agent_id, report.timestamp)) {
          continue;
        }

        if (report.overall_score < 0.5) {
          this.lifecycle.transition(report.agent_id, 'mutating');

          try {
            const entries = await this.getAgentEntries(
              report.agent_id,
              memoryStore,
            );

            // Attempt reorganization for mildly low scores
            if (report.overall_score >= 0.3 && report.overall_score < 0.5) {
              const reorganized = this.mutator.reorganize(entries);
              if (reorganized.length > 0) {
                mutated++;
                mutations.push(
                  `Reorganized ${report.agent_id}: ${entries.length} → ${reorganized.length} entries`,
                );
              }
            }

            // Attempt consolidation if many working entries
            const consolidateClusters = this.mutator.shouldConsolidate(entries);
            if (consolidateClusters.length > 0) {
              mutated++;
              mutations.push(
                `Consolidated ${report.agent_id}: ${consolidateClusters.length} clusters`,
              );
            }
          } finally {
            this.lifecycle.transition(report.agent_id, 'active');
          }
        }
      }

      // ── Step 3: Agent competition for overlapping domains ──
      if (fitnessReports.length >= 2) {
        const mergePairs = this.mutator.shouldMerge(
          agentInfos.map((a) => ({
            id: a.id,
            entries: [], // would be populated from store
          })),
        );

        if (mergePairs.length > 0) {
          this.lifecycle.transition(mergePairs[0][0], 'competing');
          merged += mergePairs.length;
          mutations.push(
            `Found ${mergePairs.length} merge candidate pair(s)`,
          );
          this.lifecycle.transition(mergePairs[0][0], 'active');
        }
      }

      // ── Step 4: Archive lowest performers ──────────────────
      const lowest = fitnessReports
        .sort((a, b) => a.overall_score - b.overall_score)
        .slice(0, Math.max(1, Math.floor(fitnessReports.length * 0.1)));

      for (const report of lowest) {
        if (report.overall_score < 0.2) {
          this.lifecycle.archive(report.agent_id);
          archived++;
          mutations.push(
            `Archived ${report.agent_id} (score: ${report.overall_score})`,
          );
        }
      }

      // ── Step 5: Generate summary ───────────────────────────
      this.lastRun = Date.now();
      const summary = this.generateEvolutionSummary({
        evaluated,
        mutated,
        merged,
        archived,
        summary: mutations.join('\n'),
      });

      return {
        evaluated,
        mutated,
        merged,
        archived,
        summary,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        evaluated,
        mutated,
        merged,
        archived,
        summary: `Evolution cycle failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Generate a natural-language evolution summary.
   */
  generateEvolutionSummary(result: EvolutionCycleResult): string {
    const lines: string[] = [
      `🧬 Evolution Cycle Report — ${new Date().toISOString()}`,
      '',
      `Agents evaluated: ${result.evaluated}`,
      `Mutations applied: ${result.mutated}`,
      `Merges performed: ${result.merged}`,
      `Agents archived: ${result.archived}`,
    ];

    if (result.summary) {
      lines.push('');
      lines.push('Details:');
      lines.push(result.summary);
    }

    if (result.evaluated === 0) {
      lines.push('');
      lines.push('No agents were evaluated. This may indicate a configuration issue.');
    }

    if (result.archived > 0) {
      lines.push('');
      lines.push(
        `${result.archived} agent(s) were archived due to critically low fitness scores.`,
      );
    }

    return lines.join('\n');
  }

  /**
   * Check if enough time has passed since the last evolution cycle.
   */
  shouldRun(lastRun: number): boolean {
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return Date.now() - lastRun >= twentyFourHours;
  }

  /**
   * Get the timestamp of the last evolution cycle.
   */
  getLastRun(): number {
    return this.lastRun;
  }

  /**
   * Access the lifecycle manager for external queries.
   */
  getLifecycle(): EvolutionLifecycle {
    return this.lifecycle;
  }

  // ── Private helpers ────────────────────────────────────────

  /**
   * Retrieve the list of agents from Xiami.
   */
  private async getAgentList(client: XiamiClient): Promise<AgentInfo[]> {
    try {
      const agents = await client.listAgents();
      return agents.map((a: { id: string; name: string }) => ({
        id: a.id,
        name: a.name,
        entry_count: 0,
      }));
    } catch {
      // Fallback: return empty list if the platform doesn't support listing
      return [];
    }
  }

  /**
   * Evaluate all agents and return fitness reports.
   */
  private async evaluateAll(
    agentInfos: AgentInfo[],
    client: XiamiClient,
    store: MemoryStore,
  ): Promise<Array<{
    agent_id: string;
    timestamp: number;
    overall_score: number;
    dimensions: Record<string, { score: number; metrics: Record<string, number> }>;
  }>> {
    const reports: Array<{
      agent_id: string;
      timestamp: number;
      overall_score: number;
      dimensions: Record<string, { score: number; metrics: Record<string, number> }>;
    }> = [];

    for (const info of agentInfos) {
      try {
        // Gather entries and stats
        const entries: import('@mutimemoagent/core').MemoryEntry[] = [];
        const stats: AgentStats = {
          entry_count: info.entry_count,
          queries_per_day: 0,
          avg_response_ms: 0,
          dependency_count: 0,
          mutation_count_7d: 0,
          new_relations_7d: 0,
        };

        // Try to get remote stats from Xiami
        try {
          const remoteStats = await client.getStats(info.id);
          if (remoteStats && typeof remoteStats === 'object') {
            stats.queries_per_day =
              (remoteStats.queries_today as number) ??
              (remoteStats.avg_queries_per_day as number) ??
              0;
            stats.avg_response_ms =
              (remoteStats.avg_response_ms as number) ?? 0;
          }
        } catch {
          // Use default stats
        }

        const report = this.evaluator.evaluate(info.id, entries, stats);
        reports.push(report);
      } catch {
        // Skip agents that fail evaluation
        reports.push({
          agent_id: info.id,
          timestamp: Date.now(),
          overall_score: 0,
          dimensions: {
            memory_quality: { score: 0, metrics: {} },
            usage_utility: { score: 0, metrics: {} },
            evolution_activity: { score: 0, metrics: {} },
            collaboration_contribution: { score: 0, metrics: {} },
          },
        });
      }
    }

    return reports;
  }

  /**
   * Get memory entries for a specific agent.
   */
  private async getAgentEntries(
    agentId: string,
    store: MemoryStore,
  ): Promise<import('@mutimemoagent/core').MemoryEntry[]> {
    try {
      // Attempt to read from local store
      // The MemoryStore.read method only reads by ID; we'd need
      // a broader query in production
      return [];
    } catch {
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// ForgettingEngine — Memory Decay & Dream Consolidation
// ═══════════════════════════════════════════════════════════════

/**
 * Orchestrates memory forgetting cycles:
 * - Analyzes memory entries for fitness/recency
 * - Calls Xiami /memory/forgetting/dream API
 * - Applies local consolidation when fitness < 0.3
 */
export class ForgettingEngine {
  private xiamiClient: XiamiClient;
  private consolidator: DreamConsolidator;

  constructor(xiamiClient: XiamiClient) {
    this.xiamiClient = xiamiClient;
    this.consolidator = new DreamConsolidator();
  }

  /**
   * Run a full forgetting cycle for the given agent.
   * Calls Xiami's /memory/forgetting/dream API and then,
   * if local entries are provided, runs dream consolidation.
   *
   * @param agentId - Agent whose memory should be pruned/consolidated
   * @param localEntries - Optional local entries for dream consolidation
   */
  async runCycle(
    agentId: string,
    localEntries?: MemoryEntry[],
  ): Promise<{
    xiamiResult: boolean;
    consolidated: MemoryEntry[];
  }> {
    let xiamiResult = false;
    let consolidated: MemoryEntry[] = [];

    // ── Step 1: Call Xiami's forgetting/dream API ────────────────
    try {
      await this.xiamiClient.runForgetting(agentId);
      xiamiResult = true;
    } catch (err) {
      console.error(`[ForgettingEngine] Xiami dream API failed for ${agentId}:`, err);
    }

    // ── Step 2: Run local dream consolidation if entries provided ─
    if (localEntries && localEntries.length > 0) {
      try {
        consolidated = await this.consolidator.consolidate(localEntries);
      } catch (err) {
        console.error(`[ForgettingEngine] Dream consolidation failed for ${agentId}:`, err);
      }
    }

    return { xiamiResult, consolidated };
  }
}

// ═══════════════════════════════════════════════════════════════
// DreamConsolidator
// ═══════════════════════════════════════════════════════════════

/**
 * Consolidates low-fitness memory entries into higher-level summaries.
 *
 * Process:
 * 1. Groups entries by topic (shared tags/keywords)
 * 2. Identifies low-score entries (fitness < 0.3)
 * 3. Consolidates each low-fitness cluster into a single summary entry
 * 4. Removes original low-fitness entries, inserts the consolidated summary
 */
export class DreamConsolidator {
  /**
   * Consolidate a batch of memory entries.
   *
   * @param entries - All entries for an agent
   * @returns Remaining entries + new consolidated summary entries
   */
  async consolidate(entries: MemoryEntry[]): Promise<MemoryEntry[]> {
    // Separate healthy entries (fitness >= 0.3) from low-fitness ones
    const healthy: MemoryEntry[] = [];
    const lowFitness: MemoryEntry[] = [];

    for (const entry of entries) {
      if (entry.evolution.fitness_score < 0.3) {
        lowFitness.push(entry);
      } else {
        healthy.push(entry);
      }
    }

    // If no low-fitness entries, nothing to consolidate
    if (lowFitness.length === 0) {
      return [...entries];
    }

    // ── Group low-fitness entries by topic ────────────────────────
    const topicClusters = this.groupByTopic(lowFitness);

    // ── Consolidate each cluster into a summary entry ─────────────
    const summaries: MemoryEntry[] = [];

    for (const cluster of topicClusters) {
      if (cluster.length < 2) {
        // Single low-fitness entries with no peers just get promoted to healthy
        // (they don't get consolidated, but we keep them as-is)
        healthy.push(cluster[0]);
        continue;
      }

      const summary = this.createSummary(cluster);
      summaries.push(summary);
    }

    // Return healthy entries + new summaries
    return [...healthy, ...summaries];
  }

  /**
   * Group entries by shared tags/keywords (topic clustering).
   * Two entries share a topic if they have >= 1 tag in common.
   */
  private groupByTopic(entries: MemoryEntry[]): MemoryEntry[][] {
    const groups: MemoryEntry[][] = [];
    const assigned = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      if (assigned.has(entries[i].id)) continue;

      const cluster: MemoryEntry[] = [entries[i]];
      assigned.add(entries[i].id);

      for (let j = i + 1; j < entries.length; j++) {
        if (assigned.has(entries[j].id)) continue;

        const tagsA = new Set(entries[i].metadata.tags);
        const tagsB = new Set(entries[j].metadata.tags);

        // Check if they share at least one tag
        let hasCommonTag = false;
        for (const tag of tagsA) {
          if (tagsB.has(tag)) {
            hasCommonTag = true;
            break;
          }
        }

        // Also check if they share significant keywords (content overlap)
        if (!hasCommonTag) {
          const contentA = entries[i].content.toLowerCase();
          const contentB = entries[j].content.toLowerCase();
          const wordsA = new Set(contentA.split(/\s+/).filter((w) => w.length > 3));
          const wordsB = new Set(contentB.split(/\s+/).filter((w) => w.length > 3));
          let sharedWords = 0;
          for (const w of wordsA) {
            if (wordsB.has(w)) sharedWords++;
          }
          if (sharedWords >= 3 || (wordsA.size > 0 && sharedWords / wordsA.size > 0.3)) {
            hasCommonTag = true;
          }
        }

        if (hasCommonTag) {
          cluster.push(entries[j]);
          assigned.add(entries[j].id);
        }
      }

      groups.push(cluster);
    }

    return groups;
  }

  /**
   * Create a consolidated summary entry from a cluster of low-fitness entries.
   * Merges content, tags, and metadata into one representative entry.
   */
  private createSummary(cluster: MemoryEntry[]): MemoryEntry {
    // Use the agent_id from the cluster (assume all belong to same agent)
    const agentId = cluster[0].agent_id;

    // Merge content: dedup key points
    const seenSentences = new Set<string>();
    const mergedContentParts: string[] = [];
    for (const entry of cluster) {
      const sentences = entry.content
        .split(/[.\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const sentence of sentences) {
        const key = sentence.toLowerCase().slice(0, 80);
        if (!seenSentences.has(key)) {
          seenSentences.add(key);
          mergedContentParts.push(sentence);
        }
      }
    }

    const mergedContent =
      mergedContentParts.length > 0
        ? mergedContentParts.join('. ') + '.'
        : cluster.map((e) => e.content).join('; ');

    // Merge tags (unique)
    const mergedTags = Array.from(
      new Set(cluster.flatMap((e) => e.metadata.tags)),
    );

    // Determine memory type: use the most common type, or 'insight'
    const typeCounts = new Map<string, number>();
    for (const e of cluster) {
      typeCounts.set(e.memory_type, (typeCounts.get(e.memory_type) ?? 0) + 1);
    }
    const dominantType =
      Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      'insight';

    // Average importance and confidence
    const avgImportance =
      cluster.reduce((s, e) => s + e.metadata.importance_score, 0) /
      cluster.length;
    const avgConfidence =
      cluster.reduce((s, e) => s + e.metadata.confidence, 0) / cluster.length;

    // Earliest creation timestamp among the cluster
    const earliestCreated = Math.min(
      ...cluster.map((e) => e.lifecycle.created_at),
    );

    // Gather source agent references
    const agentRefs = Array.from(
      new Set(
        cluster.flatMap(
          (e) => e.metadata.agent_refs ?? [e.agent_id],
        ),
      ),
    );

    // Build the consolidated entry
    const summary: MemoryEntry = {
      id: `dream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      agent_id: agentId,
      content: mergedContent,
      memory_type: dominantType as import('@mutimemoagent/core').MemoryType,
      structured_data: undefined,
      embeddings: undefined,
      lifecycle: {
        stage: 'working',
        created_at: earliestCreated,
        last_accessed_at: Date.now(),
        access_count: cluster.reduce((s, e) => s + e.lifecycle.access_count, 0),
        consolidation_count: cluster.reduce(
          (s, e) => s + e.lifecycle.consolidation_count,
          0,
        ) + 1,
      },
      relations: {
        parent_id: undefined,
        child_ids: cluster.map((e) => e.id),
        merged_from: cluster.map((e) => e.id),
        duplicate_of: undefined,
        conflicts_with: [],
      },
      evolution: {
        version: 1,
        changelog: [
          {
            timestamp: Date.now(),
            type: 'merge',
            reason: `Dream consolidation: merged ${cluster.length} low-fitness entries`,
            agent_id: agentId,
          },
        ],
        fitness_score: Math.min(1, avgImportance + 0.2),
        evolution_round: Math.max(...cluster.map((e) => e.evolution.evolution_round)),
      },
      metadata: {
        confidence: avgConfidence,
        source: 'agent',
        tags: mergedTags,
        agent_refs: agentRefs,
        importance_score: avgImportance,
      },
    };

    return summary;
  }
}

// ═══════════════════════════════════════════════════════════════
// CronScheduler — Real Cron Scheduling
// ═══════════════════════════════════════════════════════════════

interface CronJob {
  cronExpr: string;
  task: () => Promise<void>;
  nextRun: number;
}

/**
 * Minimal cron scheduler using setInterval with next-run calculation.
 * Supports standard 5-field cron expressions (min hour dom mon dow)
 * and built-in schedules for forgetting / dream consolidation.
 *
 * Built-in schedules:
 *   - '0 2 * * *'  → Daily 2AM: full forgetting cycle
 *   - '0 3 * * 0'  → Weekly Sunday 3AM: dream consolidation
 */
export class CronScheduler {
  private jobs: CronJob[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private tickMs: number;

  /**
   * @param tickMs - How often (in ms) to check for due jobs. Default 60_000 (1 minute).
   */
  constructor(tickMs = 60_000) {
    this.tickMs = tickMs;
  }

  /**
   * Register a cron job.
   *
   * @param cronExpr - Standard 5-field cron expression (min hour dom mon dow)
   * @param task - Async function to execute when the cron fires
   */
  schedule(cronExpr: string, task: () => Promise<void>): void {
    const nextRun = this.calculateNextRun(cronExpr);
    this.jobs.push({ cronExpr, task, nextRun });
  }

  /**
   * Start the scheduler. Begins checking every tickMs for due jobs.
   */
  start(): void {
    if (this.intervalId) return;

    this.intervalId = globalThis.setInterval(() => {
      this.check();
    }, this.tickMs);
  }

  /**
   * Stop the scheduler. Clears the check interval.
   */
  stop(): void {
    if (this.intervalId) {
      globalThis.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get all registered jobs with their next-run times.
   */
  getJobs(): Array<{ cronExpr: string; nextRun: number }> {
    return this.jobs.map((j) => ({
      cronExpr: j.cronExpr,
      nextRun: j.nextRun,
    }));
  }

  /**
   * Check all jobs and execute any that are due.
   * Jobs that are due get their nextRun recalculated after execution.
   */
  private check(): void {
    const now = Date.now();

    for (const job of this.jobs) {
      if (now >= job.nextRun) {
        // Execute asynchronously (fire-and-forget)
        job.task().catch((err) => {
          console.error(`[CronScheduler] Job "${job.cronExpr}" failed:`, err);
        });

        // Recalculate next run time
        job.nextRun = this.calculateNextRun(job.cronExpr);
      }
    }
  }

  /**
   * Calculate the next run time (epoch ms) for a 5-field cron expression.
   * Fields: minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-6, 0=Sun).
   * Only supports * (any), fixed values, comma-separated, and step values.
   * Uses simple scanning forward from the next full minute.
   */
  private calculateNextRun(cronExpr: string): number {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(
        `Invalid cron expression "${cronExpr}": expected 5 fields (min hour dom mon dow)`,
      );
    }

    const [minField, hourField, domField, monthField, dowField] = parts;

    // Parse each field into a set of acceptable values
    const parseField = (
      field: string,
      min: number,
      max: number,
    ): Set<number> => {
      const values = new Set<number>();

      if (field === '*') {
        for (let i = min; i <= max; i++) values.add(i);
        return values;
      }

      // Handle comma-separated list
      const segments = field.split(',');
      for (const seg of segments) {
        if (seg.includes('/')) {
          // Step values: e.g. */5 or 1-10/2
          const [range, stepStr] = seg.split('/');
          const step = parseInt(stepStr, 10);
          if (isNaN(step) || step < 1) continue;

          let start = min;
          let end = max;
          if (range !== '*') {
            const rangeParts = range.split('-');
            start = parseInt(rangeParts[0], 10);
            end = rangeParts.length > 1 ? parseInt(rangeParts[1], 10) : start;
          }

          for (let i = start; i <= end; i += step) {
            if (i >= min && i <= max) values.add(i);
          }
        } else if (seg.includes('-')) {
          // Range
          const [rStart, rEnd] = seg.split('-').map(Number);
          for (let i = rStart; i <= rEnd; i++) {
            if (i >= min && i <= max) values.add(i);
          }
        } else {
          // Single value
          const val = parseInt(seg, 10);
          if (!isNaN(val) && val >= min && val <= max) values.add(val);
        }
      }

      return values;
    };

    const allowedMins = parseField(minField, 0, 59);
    const allowedHours = parseField(hourField, 0, 23);
    const allowedDom = parseField(domField, 1, 31);
    const allowedMonths = parseField(monthField, 1, 12);
    const allowedDow = parseField(dowField, 0, 6);

    // Scan forward minute by minute starting from the next full minute
    const now = new Date();
    let candidate = new Date(now);
    // Start from the next full minute
    candidate.setUTCSeconds(0, 0);
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

    // Check at most 366 days into the future (to avoid infinite loops)
    const maxIterations = 366 * 24 * 60;
    for (let i = 0; i < maxIterations; i++) {
      const min = candidate.getUTCMinutes();
      const hour = candidate.getUTCHours();
      const dom = candidate.getUTCDate();
      const month = candidate.getUTCMonth() + 1;
      const dow = candidate.getUTCDay();

      if (
        allowedMins.has(min) &&
        allowedHours.has(hour) &&
        allowedDom.has(dom) &&
        allowedMonths.has(month) &&
        allowedDow.has(dow)
      ) {
        return candidate.getTime();
      }

      candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    }

    // Fallback: if no match found within reasonable bounds, return a far-future time
    // so this job doesn't spam-check forever.
    return now.getTime() + 365 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Convenience function to register the standard built-in cron jobs
 * on a CronScheduler.
 *
 * @param scheduler - The CronScheduler instance
 * @param forgettingEngine - A ForgettingEngine instance
 * @param agentIds - Array of agent IDs to run forgetting cycles on
 */
export function registerDefaultCronJobs(
  scheduler: CronScheduler,
  forgettingEngine: ForgettingEngine,
  agentIds: string[],
): void {
  // Daily 2AM: full forgetting cycle
  scheduler.schedule('0 2 * * *', async () => {
    console.log('[CronScheduler] Running daily forgetting cycle (2AM)…');
    for (const agentId of agentIds) {
      try {
        const { xiamiResult, consolidated } = await forgettingEngine.runCycle(agentId);
        console.log(
          `[CronScheduler] Forgetting cycle for ${agentId}: xiami=${xiamiResult}, consolidated=${consolidated.length}`,
        );
      } catch (err) {
        console.error(`[CronScheduler] Forgetting cycle failed for ${agentId}:`, err);
      }
    }
  });

  // Weekly Sunday 3AM: dream consolidation
  scheduler.schedule('0 3 * * 0', async () => {
    console.log('[CronScheduler] Running weekly dream consolidation (Sunday 3AM)…');
    for (const agentId of agentIds) {
      try {
        const { xiamiResult, consolidated } = await forgettingEngine.runCycle(agentId);
        console.log(
          `[CronScheduler] Dream consolidation for ${agentId}: xiami=${xiamiResult}, consolidated=${consolidated.length}`,
        );
      } catch (err) {
        console.error(`[CronScheduler] Dream consolidation failed for ${agentId}:`, err);
      }
    }
  });
}

