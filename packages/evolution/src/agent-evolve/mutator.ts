// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — Agent 变异器
// ─────────────────────────────────────────────────────────────────

import type { MemoryEntry } from '@mutimemoagent/core';

// ═══════════════════════════════════════════════════════════════
// AgentMutator
// ═══════════════════════════════════════════════════════════════

/**
 * Applies evolution operations to agent memory entries:
 * - Split: divide one agent's entries into multiple new agents
 * - Merge: detect and combine overlapping agent domains
 * - Reorganize: re-tag and consolidate clusters
 * - Consolidate: merge working-memory clusters into long-term entries
 * - Migrate: move entries between agents
 */
export class AgentMutator {
  /**
   * Split an agent's entries into multiple new agents based on a
   * clustering function.
   *
   * @param agentId - Source agent ID
   * @param entries - All entries of the source agent
   * @param clusterFn - Function that returns a cluster key for each entry
   * @returns Array of new agent configs with their assigned entries
   */
  split(
    agentId: string,
    entries: MemoryEntry[],
    clusterFn: (entry: MemoryEntry) => string,
  ): Array<{ name: string; entries: MemoryEntry[] }> {
    const clusters = new Map<string, MemoryEntry[]>();

    for (const entry of entries) {
      const key = clusterFn(entry);
      if (!clusters.has(key)) {
        clusters.set(key, []);
      }
      clusters.get(key)!.push(entry);
    }

    const result: Array<{ name: string; entries: MemoryEntry[] }> = [];
    let clusterIdx = 0;

    for (const [key, clusterEntries] of clusters) {
      // Skip micro-clusters (single entry) — they should go to the nearest big cluster
      if (clusterEntries.length === 1 && clusters.size > 2) continue;

      const agentName = `${agentId}-sub-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      result.push({
        name: agentName,
        entries: clusterEntries,
      });
      clusterIdx++;
    }

    return result;
  }

  /**
   * Detect pairs of agents whose domains overlap significantly
   * (Jaccard tag similarity > 0.8), indicating they should be merged.
   *
   * @param agents - Array of agent id and their entries
   * @returns Array of agent ID pairs [sourceId, targetId] to merge
   */
  shouldMerge(
    agents: Array<{ id: string; entries: MemoryEntry[] }>,
  ): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const similarity = this.jaccardTagSimilarity(
          agents[i].entries,
          agents[j].entries,
        );
        if (similarity > 0.8) {
          pairs.push([agents[i].id, agents[j].id]);
        }
      }
    }

    return pairs;
  }

  /**
   * Merge two entry arrays with deduplication by content hash.
   *
   * @param source - Entries from the source agent
   * @param target - Entries from the target agent
   * @returns Merged, deduplicated entry array
   */
  mergeEntries(source: MemoryEntry[], target: MemoryEntry[]): MemoryEntry[] {
    const merged = [...target]; // Start with target entries
    const seenHashes = new Set<string>();

    // Build hash set from target entries
    for (const entry of target) {
      seenHashes.add(this.contentHash(entry.content));
    }

    // Add source entries that are not duplicates
    for (const entry of source) {
      const hash = this.contentHash(entry.content);
      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        // Migrate to target agent
        const migrated = { ...entry, agent_id: target[0]?.agent_id ?? entry.agent_id };
        merged.push(migrated);
      }
    }

    // Update relations for moved entries
    for (let i = target.length; i < merged.length; i++) {
      const e = merged[i];
      const updated = { ...e };
      updated.relations = { ...e.relations };
      if (e.relations.parent_id) {
        updated.relations.parent_id = e.relations.parent_id;
      }
      updated.evolution = { ...e.evolution };
      updated.evolution.version = e.evolution.version + 1;
      updated.evolution.changelog = [
        ...e.evolution.changelog,
        {
          timestamp: Date.now(),
          type: 'merge',
          reason: `Merged from source agent via mutation`,
          agent_id: target[0]?.agent_id ?? e.agent_id,
        },
      ];
      merged[i] = updated;
    }

    return merged;
  }

  /**
   * Reorganize entries by re-tagging and consolidating similar entries.
   * Uses heuristics to consolidate tags and merge highly similar entries.
   *
   * @param entries - Entries to reorganize
   * @returns Reorganized entries with consolidated tags
   */
  reorganize(entries: MemoryEntry[]): MemoryEntry[] {
    // Step 1: Normalize tags across entries
    const tagConsolidation = this.buildTagConsolidation(entries);
    const reorganized: MemoryEntry[] = [];

    for (const entry of entries) {
      const updated = { ...entry };
      updated.metadata = { ...entry.metadata };
      updated.metadata.tags = entry.metadata.tags.map(
        (t) => tagConsolidation.get(t) ?? t,
      );
      // Remove duplicate tags
      updated.metadata.tags = Array.from(new Set(updated.metadata.tags));
      reorganized.push(updated);
    }

    return reorganized;
  }

  /**
   * Find clusters of related working-memory entries that can be
   * consolidated into long-term entries.
   *
   * @param entries - All entries to scan
   * @returns Array of entry clusters suitable for consolidation
   */
  shouldConsolidate(entries: MemoryEntry[]): MemoryEntry[][] {
    const workingEntries = entries.filter(
      (e) => e.lifecycle.stage === 'working',
    );
    if (workingEntries.length < 3) return [];

    // Cluster by same memory_type + similar tags
    const clusters: MemoryEntry[][] = [];
    const used = new Set<string>();

    for (let i = 0; i < workingEntries.length; i++) {
      if (used.has(workingEntries[i].id)) continue;

      const cluster: MemoryEntry[] = [workingEntries[i]];
      used.add(workingEntries[i].id);

      for (let j = i + 1; j < workingEntries.length; j++) {
        if (used.has(workingEntries[j].id)) continue;

        const a = workingEntries[i];
        const b = workingEntries[j];

        // Clustering criteria: same memory type AND similar tags
        if (a.memory_type === b.memory_type) {
          const sim = this.jaccardSets(
            new Set(a.metadata.tags),
            new Set(b.metadata.tags),
          );
          if (sim > 0.5) {
            cluster.push(workingEntries[j]);
            used.add(workingEntries[j].id);
          }
        }
      }

      if (cluster.length >= 2) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Migrate entries from one agent to another based on a filter predicate.
   *
   * @param source - Source entries
   * @param targetAgentId - Target agent ID
   * @param filter - Predicate function to select entries to migrate
   * @returns Object with migrated and remaining entries
   */
  migrateEntries(
    source: MemoryEntry[],
    targetAgentId: string,
    filter: (entry: MemoryEntry) => boolean,
  ): { migrated: MemoryEntry[]; remaining: MemoryEntry[] } {
    const migrated: MemoryEntry[] = [];
    const remaining: MemoryEntry[] = [];

    for (const entry of source) {
      if (filter(entry)) {
        const migratedEntry = { ...entry };
        migratedEntry.agent_id = targetAgentId;
        migratedEntry.metadata = { ...entry.metadata };
        migratedEntry.metadata.tags = [
          ...entry.metadata.tags,
          `migrated_from_${entry.agent_id}`,
        ];
        migratedEntry.evolution = { ...entry.evolution };
        migratedEntry.evolution.version = entry.evolution.version + 1;
        migratedEntry.evolution.changelog = [
          ...entry.evolution.changelog,
          {
            timestamp: Date.now(),
            type: 'split',
            reason: `Migrated to agent ${targetAgentId}`,
            agent_id: entry.agent_id,
          },
        ];
        migrated.push(migratedEntry);
      } else {
        remaining.push(entry);
      }
    }

    return { migrated, remaining };
  }

  // ── Private helpers ────────────────────────────────────────

  /**
   * Compute Jaccard similarity between tag sets of two entry arrays.
   */
  private jaccardTagSimilarity(
    entriesA: MemoryEntry[],
    entriesB: MemoryEntry[],
  ): number {
    const tagsA = new Set<string>();
    const tagsB = new Set<string>();

    for (const e of entriesA) {
      for (const tag of e.metadata.tags) tagsA.add(tag);
    }
    for (const e of entriesB) {
      for (const tag of e.metadata.tags) tagsB.add(tag);
    }

    return this.jaccardSets(tagsA, tagsB);
  }

  /**
   * Jaccard similarity between two sets.
   */
  private jaccardSets(a: Set<string>, b: Set<string>): number {
    const intersection = new Set<string>();
    for (const item of a) {
      if (b.has(item)) intersection.add(item);
    }
    const union = new Set([...a, ...b]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Build a tag consolidation map: similar tags → canonical form.
   * For example: "javascript" and "js" → "javascript".
   */
  private buildTagConsolidation(entries: MemoryEntry[]): Map<string, string> {
    const consolidation = new Map<string, string>();
    const allTags = Array.from(
      new Set(entries.flatMap((e) => e.metadata.tags)),
    );

    for (let i = 0; i < allTags.length; i++) {
      const tag = allTags[i];
      if (consolidation.has(tag)) continue;

      for (let j = i + 1; j < allTags.length; j++) {
        const other = allTags[j];
        if (consolidation.has(other)) continue;

        // Simple heuristic: shorter tag wins if one contains the other
        const lower = tag.toLowerCase();
        const lowerOther = other.toLowerCase();

        if (lower === lowerOther) {
          // Same text, keep shorter
          const canonical = tag.length <= other.length ? tag : other;
          consolidation.set(tag, canonical);
          consolidation.set(other, canonical);
        } else if (lower.includes(lowerOther) || lowerOther.includes(lower)) {
          // One contains the other — shorter is canonical
          const canonical = tag.length <= other.length ? tag : other;
          consolidation.set(tag, canonical);
          consolidation.set(other, canonical);
        }
      }

      // Default: tag maps to itself
      consolidation.set(tag, tag);
    }

    return consolidation;
  }

  /**
   * Simple hash of content for deduplication.
   */
  private contentHash(content: string): string {
    let hash = 5381;
    const normalized = content.trim().toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}
