// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — 变更影响传播分析
// ─────────────────────────────────────────────────────────────────

import type { ImpactReport, ImpactItem } from '@mutimemoagent/core';
import type { CodeGraph, CodeGraphNode } from './graph-diff.js';

// ═══════════════════════════════════════════════════════════════
// ImpactPropagation
// ═══════════════════════════════════════════════════════════════

/**
 * Analyzes how a change to a specific code node propagates through
 * the dependency graph, identifying direct callers, indirect
 * dependents, and test coverage impact.
 */
export class ImpactPropagation {
  /**
   * Analyze the full impact of changing a node.
   *
   * Returns a report with three layers of impact:
   * - direct_impact: immediate callers (Layer 1)
   * - indirect_impact: transitive dependents up to depth 5 (Layer 2)
   * - test_impact: affected test nodes (Layer 3)
   */
  analyze(changedNodeId: string, graph: CodeGraph): ImpactReport {
    const direct = this.getCallers(changedNodeId, graph);
    const indirect: CodeGraphNode[] = [];
    const visited = new Set<string>([changedNodeId]);

    // BFS from direct callers up to depth 5
    const queue: Array<{ nodeId: string; depth: number }> = [];
    for (const caller of direct) {
      if (!visited.has(caller.id)) {
        visited.add(caller.id);
        queue.push({ nodeId: caller.id, depth: 1 });
      }
    }

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      if (depth > 5) continue;

      const callers = this.getCallers(nodeId, graph);
      for (const caller of callers) {
        if (!visited.has(caller.id)) {
          visited.add(caller.id);
          if (depth < 5) {
            queue.push({ nodeId: caller.id, depth: depth + 1 });
          }
          // Build the path from changed node to this indirect caller
          const path = this.findPath(changedNodeId, caller.id, graph);
          indirect.push(caller);
        }
      }
    }

    // Build direct impact items
    const directItems: ImpactItem[] = direct.map((node) => ({
      node: node.id,
      path: [changedNodeId, node.id],
      impact_type: this.isTestNode(node) ? 'test' : 'production',
      depth: 1,
    }));

    // Build indirect impact items
    const indirectItems: ImpactItem[] = indirect.map((node) => {
      const path = this.findPath(changedNodeId, node.id, graph) ?? [changedNodeId, node.id];
      return {
        node: node.id,
        path,
        impact_type: this.isTestNode(node) ? 'test' : 'production',
        depth: path.length - 1,
      };
    });

    // Test impact: nodes whose name/path suggests they're tests
    const testItems: ImpactItem[] = [...direct, ...indirect]
      .filter((node) => this.isTestNode(node))
      .map((node) => {
        const path = this.findPath(changedNodeId, node.id, graph) ?? [changedNodeId, node.id];
        return {
          node: node.id,
          path,
          impact_type: 'test' as const,
          depth: path.length - 1,
        };
      });

    // Risk score calculation
    const productionImpactCount = directItems.filter(
      (i) => i.impact_type === 'production',
    ).length;
    const indirectCount = indirectItems.length;
    const testLoss = testItems.length;
    const complexity = graph.nodes.get(changedNodeId)?.complexity ?? 1;

    const riskScore =
      productionImpactCount * 0.4 +
      indirectCount * 0.3 +
      testLoss * 0.2 +
      Math.min(1, complexity / 20) * 0.1;

    return {
      direct_impact: directItems,
      indirect_impact: indirectItems,
      test_impact: testItems,
      risk_score: Math.round(riskScore * 100) / 100,
    };
  }

  /**
   * Find all nodes that directly reference (call/import/extend) the given node.
   */
  getCallers(nodeId: string, graph: CodeGraph): CodeGraphNode[] {
    const callers: CodeGraphNode[] = [];
    for (const edge of graph.edges.values()) {
      if (edge.to === nodeId) {
        const caller = graph.nodes.get(edge.from);
        if (caller) callers.push(caller);
      }
    }
    return callers;
  }

  /**
   * Find all nodes that the given node directly references.
   */
  getCallees(nodeId: string, graph: CodeGraph): CodeGraphNode[] {
    const callees: CodeGraphNode[] = [];
    for (const edge of graph.edges.values()) {
      if (edge.from === nodeId) {
        const callee = graph.nodes.get(edge.to);
        if (callee) callees.push(callee);
      }
    }
    return callees;
  }

  /**
   * BFS shortest path search between two nodes in the graph.
   * Returns the path as an array of node IDs, or null if no path exists.
   */
  findPath(from: string, to: string, graph: CodeGraph): string[] | null {
    if (from === to) return [from];

    // Build adjacency list (outgoing edges)
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges.values()) {
      if (!adjacency.has(edge.from)) {
        adjacency.set(edge.from, []);
      }
      adjacency.get(edge.from)!.push(edge.to);
    }

    // BFS
    const visited = new Set<string>([from]);
    const queue: Array<{ node: string; path: string[] }> = [
      { node: from, path: [from] },
    ];

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      const neighbors = adjacency.get(node) ?? [];

      for (const neighbor of neighbors) {
        if (neighbor === to) {
          return [...path, to];
        }
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return null; // No path found
  }

  // ── Helpers ─────────────────────────────────────────────────

  /**
   * Check if a node appears to be a test node based on name/path heuristics.
   */
  private isTestNode(node: CodeGraphNode): boolean {
    const lowerPath = node.path.toLowerCase();
    const lowerName = node.name.toLowerCase();
    return (
      lowerPath.includes('test') ||
      lowerPath.includes('spec') ||
      lowerPath.includes('__tests__') ||
      lowerName.startsWith('test') ||
      lowerName.endsWith('.test') ||
      lowerName.endsWith('.spec') ||
      node.kind === 'test'
    );
  }
}
