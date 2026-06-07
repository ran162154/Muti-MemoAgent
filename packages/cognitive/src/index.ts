// ─── @mutimemoagent/cognitive — Barrel Exports ───────────────────────────────────

// Pipeline
export { CognitivePipeline } from './pipeline/pipeline.js';
export type {
  PipelineOptions,
  PipelineResult,
  PipelineStats,
} from './pipeline/types.js';

// Knowledge Graph Types
export type {
  KnowledgeGraph,
  KnowledgeNode,
  KnowledgeEdge,
  NodeKind,
  EdgeType,
  ArchitectureLayer,
  GuidedTour,
  TourStep,
} from './pipeline/types.js';

// Domain & Knowledge Types
export type {
  DomainModel,
  Domain,
  BusinessFlow,
  FlowStep,
  KnowledgeModel,
  Entity,
  KnowledgeRelation,
  Claim,
} from './pipeline/types.js';

// Agents
export { ProjectScanner } from './agents/project-scanner.js';
export type {
  ScanResult,
  FileInfo,
  ProjectStats,
} from './agents/project-scanner.js';

export { FileAnalyzer } from './agents/file-analyzer.js';
export type {
  FileAnalysis,
  AnalyzedSymbol,
  SymbolEntry,
  SymbolRole,
} from './agents/file-analyzer.js';

export { ArchitectureAnalyzer } from './agents/architecture-analyzer.js';

export { TourBuilder } from './agents/tour-builder.js';

export { GraphReviewer } from './agents/graph-reviewer.js';
export type {
  ReviewResult,
  ReviewIssue,
} from './agents/graph-reviewer.js';

export { DomainAnalyzer } from './agents/domain-analyzer.js';

export { ArticleAnalyzer } from './agents/article-analyzer.js';

// Language Registry
export { LanguageRegistry, languageRegistry } from './languages/registry.js';
export type {
  LanguageConfig,
  FrameworkConfig,
} from './languages/registry.js';
