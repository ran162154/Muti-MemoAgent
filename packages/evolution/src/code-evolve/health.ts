// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — 架构健康度评估
// ─────────────────────────────────────────────────────────────────

import type { GraphDiff } from '@mutimemoagent/core';
import type { CodeGraph, CodeGraphNode, CodeGraphEdge } from './graph-diff.js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface HealthReport {
  /** Overall score 0–100 */
  overall: number;
  metrics: {
    coupling: number;
    cohesion: number;
    cyclomatic_complexity: number;
    test_coverage_estimate: number;
    dependency_depth: number;
    cycle_count: number;
  };
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════
// ArchitectureHealth
// ═══════════════════════════════════════════════════════════════

/**
 * Assesses the architectural health of a codebase based on its
 * dependency graph, detecting coupling issues, cycles, and
 * structural warnings.
 */
export class ArchitectureHealth {
  /**
   * Assess the overall health of a code graph, optionally
   * incorporating a recent diff for additional context.
   */
  assess(graph: CodeGraph, diff?: GraphDiff): HealthReport {
    const coupling = this.calculateCoupling(graph);
    const cycles = this.detectCycles(graph);
    const maxDepth = this.maxDependencyDepth(graph);
    const complexity = this.estimateComplexity(graph);
    const testCoverage = this.estimateTestCoverage(graph);

    // Normalize metrics to 0–100 scale
    const couplingScore = this.normalizeCoupling(coupling);
    const cycleScore = Math.max(0, 100 - cycles.length * 15);
    const depthScore = this.normalizeDepth(maxDepth);
    const complexityScore = Math.max(0, 100 - complexity * 2);
    const coverageScore = Math.round(testCoverage * 100);

    // Weighted overall score
    const overall = Math.round(
      couplingScore * 0.2 +
      cycleScore * 0.25 +
      depthScore * 0.15 +
      complexityScore * 0.15 +
      coverageScore * 0.25,
    );

    const warnings = this.generateWarnings({
      overall,
      metrics: {
        coupling: Math.round(coupling * 100) / 100,
        cohesion: Math.round(this.calculateCohesion(graph) * 100) / 100,
        cyclomatic_complexity: Math.round(complexity * 100) / 100,
        test_coverage_estimate: Math.round(testCoverage * 100) / 100,
        dependency_depth: maxDepth,
        cycle_count: cycles.length,
      },
      warnings: [],
    });

    // If diff is provided, check for regressions
    if (diff) {
      if (diff.structural_changes.length > 0) {
        for (const sc of diff.structural_changes) {
          if (sc.type === 'new_dependency_cycle' || sc.type === 'coupling_shift') {
            warnings.push(
              `Recent diff introduced ${sc.type} (severity: ${sc.severity}). Consider refactoring.`,
            );
          }
        }
      }
    }

    return {
      overall,
      metrics: {
        coupling: Math.round(coupling * 100) / 100,
        cohesion: Math.round(this.calculateCohesion(graph) * 100) / 100,
        cyclomatic_complexity: Math.round(complexity * 100) / 100,
        test_coverage_estimate: Math.round(testCoverage * 100) / 100,
        dependency_depth: maxDepth,
        cycle_count: cycles.length,
      },
      warnings,
    };
  }

  /**
   * Calculate average coupling: edges per node, normalized.
   * Returns the raw average number of edges per node.
   */
  calculateCoupling(graph: CodeGraph): number {
    if (graph.nodes.size === 0) return 0;
    return graph.edges.size / graph.nodes.size;
  }

  /**
   * Detect all simple cycles in the dependency graph via DFS.
   */
  detectCycles(graph: CodeGraph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): void => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      for (const edge of graph.edges.values()) {
        if (edge.from === nodeId) {
          const neighbor = edge.to;
          if (!graph.nodes.has(neighbor)) continue;
          if (!visited.has(neighbor)) {
            dfs(neighbor);
          } else if (recStack.has(neighbor)) {
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

    return this.deduplicateCycles(cycles);
  }

  /**
   * Compute the longest dependency chain length in the graph.
   * Uses topological sort when possible; falls back to DFS with
   * cycle detection for graphs with cycles.
   */
  maxDependencyDepth(graph: CodeGraph): number {
    if (graph.nodes.size === 0) return 0;

    // Build adjacency list (outgoing)
    const adj = new Map<string, string[]>();
    for (const edge of graph.edges.values()) {
      if (!adj.has(edge.from)) adj.set(edge.from, []);
      adj.get(edge.from)!.push(edge.to);
    }

    // Memoization for DAG longest path
    const memo = new Map<string, number>();
    const inProgress = new Set<string>();

    const dfs = (nodeId: string): number => {
      if (memo.has(nodeId)) return memo.get(nodeId)!;
      if (inProgress.has(nodeId)) return 0; // Cycle — avoid infinite recursion

      inProgress.add(nodeId);
      const neighbors = adj.get(nodeId) ?? [];
      let maxLen = 0;
      for (const neighbor of neighbors) {
        const len = dfs(neighbor);
        maxLen = Math.max(maxLen, len);
      }
      inProgress.delete(nodeId);

      const result = maxLen + 1;
      memo.set(nodeId, result);
      return result;
    };

    let maxDepth = 0;
    for (const nodeId of graph.nodes.keys()) {
      maxDepth = Math.max(maxDepth, dfs(nodeId));
    }

    return maxDepth;
  }

  /**
   * Generate a list of warnings based on health metrics.
   */
  generateWarnings(health: HealthReport): string[] {
    const warnings: string[] = [];

    if (health.metrics.coupling > 5) {
      warnings.push(
        `High coupling detected (${health.metrics.coupling.toFixed(1)} edges/node). Consider modularizing dependencies.`,
      );
    }

    if (health.metrics.cycle_count > 0) {
      warnings.push(
        `Found ${health.metrics.cycle_count} dependency cycle(s). Cycles can make the codebase harder to refactor.`,
      );
      if (health.metrics.cycle_count > 3) {
        warnings.push('Severe cycle count. Consider architectural restructuring.');
      }
    }

    if (health.metrics.dependency_depth > 10) {
      warnings.push(
        `Deep dependency chains detected (max depth: ${health.metrics.dependency_depth}). Deep chains increase change impact.`,
      );
    }

    if (health.metrics.cyclomatic_complexity > 20) {
      warnings.push(
        `High estimated complexity (${health.metrics.cyclomatic_complexity.toFixed(1)}). Complex modules are harder to test and maintain.`,
      );
    }

    if (health.metrics.test_coverage_estimate < 0.3) {
      warnings.push(
        `Low test coverage estimate (${(health.metrics.test_coverage_estimate * 100).toFixed(0)}%). Consider adding more tests.`,
      );
    }

    if (health.overall < 40) {
      warnings.push('Overall architecture health is poor. Consider a dedicated refactoring effort.');
    }

    return warnings;
  }

  // ── Private helpers ────────────────────────────────────────

  /**
   * Estimate average cohesion: intra-module edges / total edges.
   * Higher = better (modules depend internally rather than cross-module).
   */
  private calculateCohesion(graph: CodeGraph): number {
    if (graph.edges.size === 0) return 1;

    // Group nodes by module (first path segment)
    const moduleOf = new Map<string, string>();
    for (const node of graph.nodes.values()) {
      const module = node.path.split(/[/\\]/)[0] ?? 'root';
      moduleOf.set(node.id, module);
    }

    let intraModuleEdges = 0;
    for (const edge of graph.edges.values()) {
      const fromModule = moduleOf.get(edge.from);
      const toModule = moduleOf.get(edge.to);
      if (fromModule !== undefined && toModule !== undefined && fromModule === toModule) {
        intraModuleEdges++;
      }
    }

    return intraModuleEdges / graph.edges.size;
  }

  /**
   * Estimate average cyclomatic complexity from node-level complexity values.
   * Uses the mean of all node complexities as a proxy.
   */
  private estimateComplexity(graph: CodeGraph): number {
    if (graph.nodes.size === 0) return 0;
    let total = 0;
    for (const node of graph.nodes.values()) {
      total += node.complexity;
    }
    return total / graph.nodes.size;
  }

  /**
   * Estimate test coverage by counting test-like nodes vs total, using
   * name/path heuristics.
   */
  private estimateTestCoverage(graph: CodeGraph): number {
    const productionNodes: CodeGraphNode[] = [];
    const testNodes: CodeGraphNode[] = [];

    for (const node of graph.nodes.values()) {
      const lower = (node.path + '/' + node.name).toLowerCase();
      if (
        lower.includes('test') ||
        lower.includes('spec') ||
        lower.includes('__tests__') ||
        node.kind === 'test'
      ) {
        testNodes.push(node);
      } else {
        productionNodes.push(node);
      }
    }

    if (productionNodes.length === 0) return testNodes.length > 0 ? 1 : 0;
    return testNodes.length / (productionNodes.length + testNodes.length);
  }

  /**
   * Normalize coupling to a 0–100 score. Lower coupling is better.
   * Ideal: 1–3 edges per node. Penalize >5 or <0.5.
   */
  private normalizeCoupling(coupling: number): number {
    if (coupling <= 0) return 50;
    if (coupling >= 0.5 && coupling <= 3) return 90;
    if (coupling <= 5) return Math.round(70 - (coupling - 3) * 10);
    if (coupling <= 10) return Math.round(50 - (coupling - 5) * 8);
    return Math.max(0, Math.round(30 - (coupling - 10) * 2));
  }

  /**
   * Normalize dependency depth to a 0–100 score. Shallower is better.
   */
  private normalizeDepth(depth: number): number {
    if (depth <= 2) return 95;
    if (depth <= 5) return 80;
    if (depth <= 10) return 60;
    if (depth <= 20) return 30;
    return Math.max(0, 20 - (depth - 20));
  }

  /**
   * Deduplicate cycles by rotating each to a canonical form.
   */
  private deduplicateCycles(cycles: string[][]): string[][] {
    const seen = new Set<string>();
    const result: string[][] = [];

    for (const cycle of cycles) {
      if (cycle.length === 0) continue;
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
