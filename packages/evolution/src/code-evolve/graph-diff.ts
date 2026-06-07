// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — 代码图谱差异分析
// ─────────────────────────────────────────────────────────────────

import type { GraphDiff, StructuralChange } from '@mutimemoagent/core';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CodeGraph {
  nodes: Map<string, CodeGraphNode>;
  edges: Map<string, CodeGraphEdge>;
}

export interface CodeGraphNode {
  id: string;
  path: string;
  name: string;
  kind: string;
  language: string;
  complexity: number;
}

export interface CodeGraphEdge {
  id: string;
  from: string;
  to: string;
  type: 'imports' | 'calls' | 'extends' | 'implements';
}

// ═══════════════════════════════════════════════════════════════
// GraphDiffEngine
// ═══════════════════════════════════════════════════════════════

/**
 * Computes structured diffs between two code graph snapshots.
 * Detects added/removed/modified nodes and edges, plus
 * architectural-level structural changes.
 */
export class GraphDiffEngine {
  /**
   * Compute the full diff between two code graph versions.
   */
  diff(oldGraph: CodeGraph, newGraph: CodeGraph): GraphDiff {
    const addedNodes: string[] = [];
    const removedNodes: string[] = [];
    const modifiedNodes: Array<{ node: string; changes: string[] }> = [];
    const addedEdges: string[] = [];
    const removedEdges: string[] = [];

    // ── Node diff ────────────────────────────────────────────
    const oldNodeIds = new Set(oldGraph.nodes.keys());
    const newNodeIds = new Set(newGraph.nodes.keys());

    for (const id of newNodeIds) {
      if (!oldNodeIds.has(id)) {
        addedNodes.push(id);
      } else {
        const oldNode = oldGraph.nodes.get(id)!;
        const newNode = newGraph.nodes.get(id)!;
        if (!this.nodesEqual(oldNode, newNode)) {
          modifiedNodes.push({
            node: id,
            changes: this.nodeDiff(oldNode, newNode),
          });
        }
      }
    }

    for (const id of oldNodeIds) {
      if (!newNodeIds.has(id)) {
        removedNodes.push(id);
      }
    }

    // ── Edge diff ────────────────────────────────────────────
    const oldEdgeIds = new Set(oldGraph.edges.keys());
    const newEdgeIds = new Set(newGraph.edges.keys());

    for (const id of newEdgeIds) {
      if (!oldEdgeIds.has(id)) {
        addedEdges.push(id);
      }
    }

    for (const id of oldEdgeIds) {
      if (!newEdgeIds.has(id)) {
        removedEdges.push(id);
      }
    }

    // ── Structural changes ───────────────────────────────────
    const structuralChanges = this.detectArchitecturalChanges(oldGraph, newGraph);

    return {
      added_nodes: addedNodes,
      removed_nodes: removedNodes,
      modified_nodes: modifiedNodes,
      added_edges: addedEdges,
      removed_edges: removedEdges,
      structural_changes: structuralChanges,
    };
  }

  /**
   * Compare two nodes for structural equality.
   * Ignores properties that don't affect code structure (e.g. irrelevant metadata).
   */
  nodesEqual(a: CodeGraphNode, b: CodeGraphNode): boolean {
    return (
      a.name === b.name &&
      a.path === b.path &&
      a.kind === b.kind &&
      a.language === b.language &&
      a.complexity === b.complexity
    );
  }

  /**
   * List the properties that differ between two nodes.
   */
  nodeDiff(a: CodeGraphNode, b: CodeGraphNode): string[] {
    const changes: string[] = [];
    if (a.name !== b.name) changes.push(`name: "${a.name}" → "${b.name}"`);
    if (a.path !== b.path) changes.push(`path: "${a.path}" → "${b.path}"`);
    if (a.kind !== b.kind) changes.push(`kind: "${a.kind}" → "${b.kind}"`);
    if (a.language !== b.language) changes.push(`language: "${a.language}" → "${b.language}"`);
    if (a.complexity !== b.complexity)
      changes.push(`complexity: ${a.complexity} → ${b.complexity}`);
    return changes;
  }

  /**
   * Detect architectural-level changes between two code graphs.
   */
  detectArchitecturalChanges(
    oldG: CodeGraph,
    newG: CodeGraph,
  ): StructuralChange[] {
    const changes: StructuralChange[] = [];

    // ── Coupling shift ───────────────────────────────────────
    const oldCoupling = this.calculateCoupling(oldG);
    const newCoupling = this.calculateCoupling(newG);
    const couplingDelta = Math.abs(newCoupling - oldCoupling);
    if (couplingDelta > 0.3) {
      changes.push({
        type: 'coupling_shift',
        severity: couplingDelta > 0.5 ? 'high' : 'medium',
        detail: {
          old_average: Math.round(oldCoupling * 100) / 100,
          new_average: Math.round(newCoupling * 100) / 100,
          delta: Math.round(couplingDelta * 100) / 100,
          direction: newCoupling > oldCoupling ? 'increased' : 'decreased',
        },
      });
    }

    // ── New dependency cycles ────────────────────────────────
    const oldCycles = this.findCycles(oldG);
    const newCycles = this.findCycles(newG);
    const newCycleCount = newCycles.length - oldCycles.length;
    if (newCycleCount > 0) {
      // Find descriptions of the new cycles
      const newCycleDetails = newCycles.slice(oldCycles.length, oldCycles.length + 3);
      changes.push({
        type: 'new_dependency_cycle',
        severity: newCycleCount > 2 ? 'high' : 'medium',
        detail: {
          added_cycles: newCycleCount,
          total_cycles: newCycles.length,
          example_cycles: newCycleDetails.map((c) => c.join(' → ')),
        },
      });
    }

    // ── Module explosion (node count > 1.5x previous) ────────
    const oldNodeCount = oldG.nodes.size;
    const newNodeCount = newG.nodes.size;
    if (oldNodeCount > 0 && newNodeCount > oldNodeCount * 1.5) {
      changes.push({
        type: 'module_explosion',
        severity: newNodeCount > oldNodeCount * 2 ? 'high' : 'medium',
        detail: {
          old_count: oldNodeCount,
          new_count: newNodeCount,
          ratio: Math.round((newNodeCount / oldNodeCount) * 100) / 100,
        },
      });
    }

    return changes;
  }

  // ── Graph analysis helpers ─────────────────────────────────

  /**
   * Calculate average coupling: edges per node across the graph.
   */
  calculateCoupling(graph: CodeGraph): number {
    if (graph.nodes.size === 0) return 0;
    return graph.edges.size / graph.nodes.size;
  }

  /**
   * Find all simple cycles in the dependency graph using DFS.
   * Returns each cycle as an array of node IDs in order.
   */
  findCycles(graph: CodeGraph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): void => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      // Find outgoing edges from this node
      for (const edge of graph.edges.values()) {
        if (edge.from === nodeId) {
          const neighbor = edge.to;
          if (!visited.has(neighbor)) {
            dfs(neighbor);
          } else if (recStack.has(neighbor)) {
            // Found a cycle; extract from path
            const cycleStart = path.indexOf(neighbor);
            if (cycleStart !== -1) {
              cycles.push(path.slice(cycleStart));
            }
          }
        }
      }

      path.pop();
      recStack.delete(nodeId);
    };

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }

    // Deduplicate cycles (normalize by rotation)
    return this.deduplicateCycles(cycles);
  }

  /**
   * Deduplicate cycles by rotating each to a canonical form.
   */
  private deduplicateCycles(cycles: string[][]): string[][] {
    const seen = new Set<string>();
    const result: string[][] = [];

    for (const cycle of cycles) {
      if (cycle.length === 0) continue;
      // Find the minimum element's index for canonical rotation
      let minIdx = 0;
      for (let i = 1; i < cycle.length; i++) {
        if (cycle[i] < cycle[minIdx]) minIdx = i;
      }
      const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
      const key = rotated.join('|');
      if (!seen.has(key)) {
        seen.add(key);
        result.push(cycle);
      }
    }

    return result;
  }
}
