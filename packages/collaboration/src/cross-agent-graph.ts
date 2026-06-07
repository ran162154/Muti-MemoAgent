// ────────────────────────────────────────────────────────────────
// @mutimemoagent/collaboration — Cross-Agent Graph
// In-memory graph for cross-agent relations with BFS traversal,
// shortest-path, community detection, and serialization.
// ────────────────────────────────────────────────────────────────

import type { CrossAgentRelation } from '@mutimemoagent/core';

/**
 * In-memory directed weighted graph for cross-agent relations.
 *
 * Nodes are agent IDs; edges carry a CrossAgentRelation with a weight
 * (0–1) indicating the strength of the connection.
 */
export class CrossAgentGraph {
  /** adjacency: source -> Map<target, CrossAgentRelation> */
  private adj = new Map<string, Map<string, CrossAgentRelation>>();

  // ── Mutators ──────────────────────────────────────────────

  /** Add or overwrite a relation edge. */
  addRelation(relation: CrossAgentRelation): void {
    const edges = this.adj.get(relation.source_agent_id);
    if (edges) {
      edges.set(relation.target_agent_id, relation);
    } else {
      this.adj.set(
        relation.source_agent_id,
        new Map([[relation.target_agent_id, relation]]),
      );
    }
  }

  // ── Queries ───────────────────────────────────────────────

  /** Retrieve a single relation by its id. */
  getRelation(id: string): CrossAgentRelation | null {
    for (const edges of this.adj.values()) {
      for (const rel of edges.values()) {
        if (rel.id === id) return rel;
      }
    }
    return null;
  }

  /** Return every relation where the agent is either source or target. */
  getRelations(agentId: string): CrossAgentRelation[] {
    const result: CrossAgentRelation[] = [];

    // Outgoing
    const outEdges = this.adj.get(agentId);
    if (outEdges) {
      result.push(...outEdges.values());
    }

    // Incoming — scan all sources
    for (const [src, edges] of this.adj) {
      if (src === agentId) continue;
      const rel = edges.get(agentId);
      if (rel) result.push(rel);
    }

    return result;
  }

  /** Return IDs of agents directly connected to the given agent, optionally filtered by minimum weight. */
  getRelatedAgents(agentId: string, minWeight?: number): string[] {
    const seen = new Set<string>();
    const addIf = (rel: CrossAgentRelation) => {
      if (minWeight === undefined || rel.weight >= minWeight) {
        seen.add(rel.target_agent_id);
      }
    };

    const outEdges = this.adj.get(agentId);
    if (outEdges) {
      for (const rel of outEdges.values()) addIf(rel);
    }

    // Incoming
    for (const [src, edges] of this.adj) {
      if (src === agentId) continue;
      const rel = edges.get(agentId);
      if (rel) {
        if (minWeight === undefined || rel.weight >= minWeight) {
          seen.add(src);
        }
      }
    }

    return [...seen];
  }

  // ── Graph Traversal / Analytic ────────────────────────────

  /**
   * BFS traversal from startAgent to find all reachable agents
   * up to maxDepth (default unlimited).
   */
  getAgentChain(startAgent: string, maxDepth?: number): string[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [
      { id: startAgent, depth: 0 },
    ];
    visited.add(startAgent);

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (maxDepth !== undefined && depth >= maxDepth) continue;

      const edges = this.adj.get(id);
      if (!edges) continue;

      for (const target of edges.keys()) {
        if (!visited.has(target)) {
          visited.add(target);
          queue.push({ id: target, depth: depth + 1 });
        }
      }
    }

    return [...visited];
  }

  /**
   * Shortest path between two agents using BFS (treating edges
   * as unweighted). Returns agent IDs in order [from, ..., to]
   * or null if no path exists.
   */
  findPath(from: string, to: string): string[] | null {
    if (from === to) return [from];

    const visited = new Set<string>([from]);
    const predecessor = new Map<string, string | null>();
    const queue: string[] = [from];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const edges = this.adj.get(current);
      if (!edges) continue;

      for (const target of edges.keys()) {
        if (!visited.has(target)) {
          visited.add(target);
          predecessor.set(target, current);
          if (target === to) {
            // Reconstruct path
            const path: string[] = [];
            let node: string | null = to;
            while (node !== null) {
              path.unshift(node);
              node = predecessor.get(node) ?? null;
            }
            return path;
          }
          queue.push(target);
        }
      }
    }

    return null;
  }

  /**
   * Return an N×N weight matrix for every pair of agents that
   * have a direct relation (either direction).
   */
  getRelationMatrix(): Map<string, Map<string, number>> {
    const matrix = new Map<string, Map<string, number>>();

    // Collect all unique agent IDs
    const allAgents = new Set<string>();
    for (const [src, edges] of this.adj) {
      allAgents.add(src);
      for (const target of edges.keys()) {
        allAgents.add(target);
      }
    }

    for (const a of allAgents) {
      const row = new Map<string, number>();
      for (const b of allAgents) {
        if (a === b) continue;
        // Check a→b
        const edgesA = this.adj.get(a);
        const relAB = edgesA?.get(b);
        if (relAB) {
          row.set(b, relAB.weight);
        } else {
          // Check b→a
          const edgesB = this.adj.get(b);
          const relBA = edgesB?.get(a);
          row.set(b, relBA ? relBA.weight : 0);
        }
      }
      matrix.set(a, row);
    }

    return matrix;
  }

  /**
   * Simple connected-components cluster detection.
   * Returns groups of agent IDs where every pair is connected
   * (directly or indirectly) via edges of at least minWeight.
   */
  detectClusters(minWeight?: number): string[][] {
    // Build undirected connectivity
    const adjacency = new Map<string, Set<string>>();

    const addEdge = (a: string, b: string) => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      adjacency.get(a)!.add(b);
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(b)!.add(a);
    };

    for (const [src, edges] of this.adj) {
      for (const [target, rel] of edges) {
        if (minWeight === undefined || rel.weight >= minWeight) {
          addEdge(src, target);
        }
      }
    }

    // BFS clusters
    const visited = new Set<string>();
    const clusters: string[][] = [];

    for (const agent of adjacency.keys()) {
      if (visited.has(agent)) continue;

      const cluster: string[] = [];
      const queue = [agent];
      visited.add(agent);

      while (queue.length > 0) {
        const current = queue.shift()!;
        cluster.push(current);
        const neighbors = adjacency.get(current);
        if (neighbors) {
          for (const nb of neighbors) {
            if (!visited.has(nb)) {
              visited.add(nb);
              queue.push(nb);
            }
          }
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Remove relations older than maxAge (milliseconds).
   * Returns the number of removed relations.
   */
  removeStaleRelations(maxAge: number): number {
    const cutoff = Date.now() - maxAge;
    let removed = 0;

    for (const [src, edges] of this.adj) {
      for (const [target, rel] of edges) {
        if (rel.discovered_at < cutoff) {
          edges.delete(target);
          removed++;
        }
      }
    }

    // Clean up empty entries
    for (const [src, edges] of this.adj) {
      if (edges.size === 0) this.adj.delete(src);
    }

    return removed;
  }

  // ── Serialization ─────────────────────────────────────────

  /** Serialise all relations to a flat array. */
  toJSON(): CrossAgentRelation[] {
    const result: CrossAgentRelation[] = [];
    for (const edges of this.adj.values()) {
      result.push(...edges.values());
    }
    return result;
  }

  /** Replace the entire graph with relations from a flat array. */
  fromJSON(relations: CrossAgentRelation[]): void {
    this.adj.clear();
    for (const rel of relations) {
      this.addRelation(rel);
    }
  }

  // ── Stats ─────────────────────────────────────────────────

  stats(): { nodeCount: number; edgeCount: number; avgWeight: number } {
    const nodes = new Set<string>();
    let edgeCount = 0;
    let totalWeight = 0;

    for (const [src, edges] of this.adj) {
      nodes.add(src);
      for (const [target, rel] of edges) {
        nodes.add(target);
        edgeCount++;
        totalWeight += rel.weight;
      }
    }

    return {
      nodeCount: nodes.size,
      edgeCount,
      avgWeight: edgeCount > 0 ? totalWeight / edgeCount : 0,
    };
  }
}
