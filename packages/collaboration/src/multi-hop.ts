// ────────────────────────────────────────────────────────────────
// @mutimemoagent/collaboration — Multi-Hop Reasoner
// Discovers transitive relations across agents via multi-hop path
// reasoning, transitve closure, and inferred relation suggestions.
// ────────────────────────────────────────────────────────────────

import type { CrossAgentRelation, MemoryEntry } from '@mutimemoagent/core';
import { CrossAgentGraph } from './cross-agent-graph.js';

let inferredCounter = 0;

function nextInferredId(): string {
  return `inferred_${++inferredCounter}_${Date.now()}`;
}

// ── MultiHopReasoner ───────────────────────────────────────

export class MultiHopReasoner {
  /**
   * Multi-hop path reasoning: for each path A→B→C where no direct
   * A→C relation exists, infer one.
   *
   * - inferred_weight = path_weight_product × 0.8 (decay per hop)
   * - Only keeps relations with inferred_weight > 0.5
   */
  reason(
    graph: CrossAgentGraph,
    startAgent: string,
    maxHops: number = 3,
  ): CrossAgentRelation[] {
    const now = Date.now();
    const inferred: CrossAgentRelation[] = [];
    const existingPairs = new Set<string>();

    // Track existing directed pairs to avoid duplicate inferences
    for (const rel of graph.toJSON()) {
      existingPairs.add(`${rel.source_agent_id}→${rel.target_agent_id}`);
    }

    // BFS with path tracking
    const queue: Array<{
      agent: string;
      path: string[];
      weightProduct: number;
    }> = [{ agent: startAgent, path: [startAgent], weightProduct: 1 }];

    while (queue.length > 0) {
      const { agent, path, weightProduct } = queue.shift()!;
      const depth = path.length - 1;

      if (depth >= maxHops) continue;

      // SAFETY: CrossAgentGraph has an internal adj map that's not exposed in types
      const edges = (graph as unknown as { adj: Map<string, Map<string, CrossAgentRelation>> }).adj?.get(agent) as
        | Map<string, CrossAgentRelation>
        | undefined;
      if (!edges) continue;

      for (const [neighbor, rel] of edges) {
        if (path.includes(neighbor)) continue; // no cycles

        const newWeight = weightProduct * rel.weight;
        const newPath = [...path, neighbor];

        // If this is hop #2+, check if relation already exists
        if (depth >= 1) {
          const pairKey = `${startAgent}→${neighbor}`;
          if (!existingPairs.has(pairKey)) {
            const inferredWeight = newWeight * 0.8;

            if (inferredWeight > 0.5) {
              inferred.push({
                id: nextInferredId(),
                source_agent_id: startAgent,
                target_agent_id: neighbor,
                relation_type: `inferred_via_${path[1] ?? 'unknown'}`,
                weight: Math.round(inferredWeight * 100) / 100,
                evidence: [
                  `Path: ${newPath.join(' → ')}`,
                  `Path weight product: ${newWeight.toFixed(3)}`,
                  `Decayed weight: ${inferredWeight.toFixed(3)}`,
                ],
                discovered_at: now,
                discovery_method: 'multi_hop',
              });

              existingPairs.add(pairKey);
            }
          }
        }

        // Continue traversal
        if (depth + 1 < maxHops) {
          queue.push({
            agent: neighbor,
            path: newPath,
            weightProduct: newWeight,
          });
        }
      }
    }

    return inferred;
  }

  /**
   * Find all agents reachable from the given agent through any
   * directed or undirected path (transitive closure).
   */
  findTransitiveClosure(graph: CrossAgentGraph, agentId: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [agentId];
    visited.add(agentId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Outgoing
      // SAFETY: CrossAgentGraph has an internal adj map that's not exposed in types
      const edges = (graph as unknown as { adj: Map<string, Map<string, CrossAgentRelation>> }).adj?.get(current) as
        | Map<string, CrossAgentRelation>
        | undefined;
      if (edges) {
        for (const target of edges.keys()) {
          if (!visited.has(target)) {
            visited.add(target);
            queue.push(target);
          }
        }
      }

      // Incoming — scan all sources that point to current
      for (const rel of graph.toJSON()) {
        if (
          rel.target_agent_id === current &&
          !visited.has(rel.source_agent_id)
        ) {
          visited.add(rel.source_agent_id);
          queue.push(rel.source_agent_id);
        }
      }
    }

    return [...visited];
  }

  /**
   * Suggest all possible inferred relations across the entire graph.
   * Runs multi-hop reasoning from every agent node.
   */
  suggestNewRelations(graph: CrossAgentGraph): CrossAgentRelation[] {
    const allRelations = graph.toJSON();
    const allAgents = new Set<string>();

    for (const rel of allRelations) {
      allAgents.add(rel.source_agent_id);
      allAgents.add(rel.target_agent_id);
    }

    const suggestions: CrossAgentRelation[] = [];
    const seenPairs = new Set<string>();

    for (const agent of allAgents) {
      const inferred = this.reason(graph, agent, 3);
      for (const rel of inferred) {
        const pairKey = `${rel.source_agent_id}→${rel.target_agent_id}`;
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          suggestions.push(rel);
        }
      }
    }

    return suggestions;
  }

  /**
   * Validate an inferred relation against actual memory entries.
   * Returns a weight boost (0–0.2) if entries corroborate the inference.
   */
  validateInferredRelation(
    relation: CrossAgentRelation,
    entries: MemoryEntry[],
  ): number {
    // Filter entries belonging to either agent in the relation
    const relevantEntries = entries.filter(
      (e) =>
        e.agent_id === relation.source_agent_id ||
        e.agent_id === relation.target_agent_id,
    );

    if (relevantEntries.length === 0) return 0;

    // Check if any entries cross-reference each other
    let crossRefCount = 0;

    for (const entry of relevantEntries) {
      // Check agent_refs
      if (entry.metadata.agent_refs) {
        if (
          entry.agent_id === relation.source_agent_id &&
          entry.metadata.agent_refs.includes(relation.target_agent_id)
        ) {
          crossRefCount++;
        } else if (
          entry.agent_id === relation.target_agent_id &&
          entry.metadata.agent_refs.includes(relation.source_agent_id)
        ) {
          crossRefCount++;
        }
      }

      // Check content for the other agent's ID mention
      const targetId =
        entry.agent_id === relation.source_agent_id
          ? relation.target_agent_id
          : relation.source_agent_id;
      if (entry.content.includes(targetId)) {
        crossRefCount++;
      }
    }

    // Boost scales with corroboration count, capped at 0.2
    return Math.min(0.2, crossRefCount * 0.05);
  }
}
