// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — Public API
// ─────────────────────────────────────────────────────────────────

// ── Fitness Evaluation ──────────────────────────────────────────
export { FitnessEvaluator } from './evaluate.js';
export type { AgentStats } from './evaluate.js';

// ── Knowledge Merging ──────────────────────────────────────────
export { KnowledgeMerger } from './merge.js';

// ── Code Evolution ─────────────────────────────────────────────
export { GraphDiffEngine } from './code-evolve/graph-diff.js';
export type { CodeGraph, CodeGraphNode, CodeGraphEdge } from './code-evolve/graph-diff.js';

export { ImpactPropagation } from './code-evolve/impact.js';

export { TrendAnalyzer } from './code-evolve/trend.js';

export { ArchitectureHealth } from './code-evolve/health.js';
export type { HealthReport } from './code-evolve/health.js';

// ── Agent Evolution ────────────────────────────────────────────
export { AgentMutator } from './agent-evolve/mutator.js';

export { AgentCompetition } from './agent-evolve/competition.js';
export type { CompetitionResult } from './agent-evolve/competition.js';

export { EvolutionLifecycle } from './agent-evolve/lifecycle.js';
export type { LifecycleState } from './agent-evolve/lifecycle.js';

export { EvolutionScheduler, CronScheduler, DreamConsolidator, ForgettingEngine, registerDefaultCronJobs } from './agent-evolve/scheduler.js';
export type { EvolutionCycleResult } from './agent-evolve/scheduler.js';
