// ─────────────────────────────────────────────────────────────────
// @memograph/core — 核心类型定义
// ─────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// 记忆体条目
// ═══════════════════════════════════════════════════════════════

export type MemoryType =
  | 'fact'
  | 'preference'
  | 'procedure'
  | 'event'
  | 'error'
  | 'mcp_registry'
  | 'mcp_tool'
  | 'mcp_example'
  | 'code_file'
  | 'code_symbol'
  | 'code_dependency'
  | 'code_architecture'
  | 'code_hotspot'
  | 'cross_agent_relation'
  | 'insight'
  | 'conflict_flag'
  | 'merge_result';

export type LifecycleStage =
  | 'working'
  | 'consolidating'
  | 'long-term'
  | 'archived'
  | 'forgotten';

export interface ChangeRecord {
  timestamp: number;
  type: 'create' | 'update' | 'merge' | 'split' | 'refine';
  previous_content?: string;
  reason: string;
  agent_id: string;
}

export interface MemoryEntry {
  id: string;
  agent_id: string;
  content: string;
  memory_type: MemoryType;
  structured_data?: Record<string, unknown>;
  embeddings?: number[];

  lifecycle: {
    stage: LifecycleStage;
    created_at: number;
    last_accessed_at: number;
    access_count: number;
    consolidation_count: number;
    ttl_ms?: number;
  };

  relations: {
    parent_id?: string;
    child_ids: string[];
    merged_from: string[];
    duplicate_of?: string;
    conflicts_with: string[];
  };

  evolution: {
    version: number;
    changelog: ChangeRecord[];
    fitness_score: number;
    evolution_round: number;
    last_mutated_at?: number;
  };

  metadata: {
    confidence: number;
    source: 'dialogue' | 'code' | 'manual' | 'inferred' | 'agent';
    tags: string[];
    language?: string;
    file_refs?: string[];
    agent_refs?: string[];
    importance_score: number;
  };

  local_cache?: {
    checksum: string;
    indexed_at: number;
    fts5_rowid?: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// 事件系统
// ═══════════════════════════════════════════════════════════════

export type EventSourceType =
  | 'dialogue'
  | 'code'
  | 'mcp_install'
  | 'file_watch'
  | 'ci_webhook'
  | 'cron'
  | 'manual';

export interface IngestEvent {
  id: string;
  source: EventSourceType;
  timestamp: number;
  payload: string;
  metadata?: Record<string, unknown>;
}

export interface RouteTarget {
  agent_id: string;
  weight: number;
}

export interface ClassifiedItem {
  target_agent: string;
  type: MemoryType;
  content: string;
  confidence: number;
  source: string;
  tags: string[];
  structured_data?: Record<string, unknown>;
}

export interface WriteResult {
  written: string[];
  indexed: string[];
  failed: Array<{ item: ClassifiedItem; error: string }>;
}

// ═══════════════════════════════════════════════════════════════
// 搜索
// ═══════════════════════════════════════════════════════════════

export interface SearchQuery {
  query: string;
  mode?: 'natural' | 'symbol' | 'chain' | 'impact';
  scope?: string[];
  max_results?: number;
  include_chain?: boolean;
  max_depth?: number;
  threshold?: number;
}

export interface SearchResult {
  entry: MemoryEntry;
  score: number;
  match_type: 'fts5' | 'vector' | 'symbol' | 'graph';
  call_chain?: CallChainNode[];
  related_memories?: SearchResult[];
  agent_chain?: string[];
}

export interface CallChainNode {
  symbol: string;
  path: string;
  relation: 'caller' | 'callee';
  depth: number;
}

export interface CollaborativeResult {
  results: SearchResult[];
  discovered_links?: CrossAgentRelation[];
}

// ═══════════════════════════════════════════════════════════════
// 跨 Agent 关系
// ═══════════════════════════════════════════════════════════════

export interface CrossAgentRelation {
  id: string;
  source_agent_id: string;
  target_agent_id: string;
  relation_type: string;
  weight: number;
  evidence: string[];
  discovered_at: number;
  discovery_method: 'ner' | 'llm_inference' | 'multi_hop' | 'rule';
}

export type EntityType = 'PERSON' | 'TOOL' | 'TECHNOLOGY' | 'PROJECT' | 'CONCEPT' | 'PROCESS' | 'DECISION';

export interface Entity {
  name: string;
  type: EntityType;
  agent_id: string;
  occurrences: number;
}

// ═══════════════════════════════════════════════════════════════
// 进化
// ═══════════════════════════════════════════════════════════════

export interface AgentFitnessReport {
  agent_id: string;
  timestamp: number;
  overall_score: number;
  dimensions: {
    memory_quality: DimensionScore;
    usage_utility: DimensionScore;
    evolution_activity: DimensionScore;
    collaboration_contribution: DimensionScore;
  };
}

export interface DimensionScore {
  score: number;
  metrics: Record<string, number>;
}

export interface EvolutionAction {
  type: 'split' | 'merge' | 'reorganize' | 'consolidate' | 'migrate' | 'retain' | 'archive';
  agent_ids: string[];
  reason: string;
  triggered_by: string;
}

export interface GraphDiff {
  added_nodes: string[];
  removed_nodes: string[];
  modified_nodes: Array<{ node: string; changes: string[] }>;
  added_edges: string[];
  removed_edges: string[];
  structural_changes: StructuralChange[];
}

export interface StructuralChange {
  type: 'coupling_shift' | 'new_dependency_cycle' | 'module_explosion' | 'architecture_refactor';
  severity: 'low' | 'medium' | 'high';
  detail: Record<string, unknown>;
}

export interface ImpactReport {
  direct_impact: ImpactItem[];
  indirect_impact: ImpactItem[];
  test_impact: ImpactItem[];
  risk_score: number;
  cross_project_impact?: CrossProjectImpact[];
}

export interface ImpactItem {
  node: string;
  path: string[];
  impact_type: 'test' | 'production';
  depth?: number;
}

export interface CrossProjectImpact {
  agent_id: string;
  symbol: string;
  similarity: number;
  suggestion: string;
}

export interface TrendReport {
  hotspot_migration: Array<{ module: string; direction: 'rising' | 'cooling'; change_rate: number }>;
  complexity_trend: number[];
  dependency_health: number;
  tech_debt_indicators: number;
  summary: string;
}

// ═══════════════════════════════════════════════════════════════
// SDK / 配置
// ═══════════════════════════════════════════════════════════════

export interface MemographConfig {
  xiami: {
    platform_key: string;
    api_base: string;
    agents: Record<string, {
      token: string;
      agent_id: string;
      api_token_id: string;
    }>;
  };
  local: {
    cache_dir: string;
    git_hooks: boolean;
    auto_sync: boolean;
  };
}

export interface InitOptions {
  xiamiKey?: string;
  createProfile?: boolean;
  createMCPRegistry?: boolean;
  initProject?: boolean;
  projectName?: string;
}

export interface InitResult {
  success: boolean;
  agents: Array<{ name: string; agent_id: string }>;
  config_path: string;
  cache_path: string;
}

export interface SDKStatus {
  connected: boolean;
  agents: Array<{ name: string; agent_id: string; entry_count: number }>;
  local_index: { size_bytes: number; entry_count: number; last_synced?: number };
  evolution: { last_run?: number; next_run?: number };
}

// ═══════════════════════════════════════════════════════════════
// Xiami API
// ═══════════════════════════════════════════════════════════════

export interface XiamiConfig {
  api_base: string;
  platform_key: string;
}

export interface XiamiWriteInput {
  agent_id: string;
  content: string;
  memory_type: string;
  metadata?: Record<string, unknown>;
  embeddings?: number[];
}

export interface XiamiSearchInput {
  query?: string;
  query_embedding?: number[];
  agent_id?: string;
  threshold?: number;
  limit?: number;
  memory_type?: string;
}

export interface XiamiAgentInfo {
  id: string;
  name: string;
  token: string;
  api_token_id: string;
}

// ═══════════════════════════════════════════════════════════════
// 遗忘
// ═══════════════════════════════════════════════════════════════

export type ForgettingAction = 'retain' | 'consolidate' | 'decay' | 'forget' | 'flag_conflict';

// ═══════════════════════════════════════════════════════════════
// 记忆体类型体系
// ═══════════════════════════════════════════════════════════════

export type MemoryTier = 'permanent' | 'long_term' | 'medium_term' | 'short_term';

export interface MemoryTierConfig {
  tier: MemoryTier;
  description: string;
  examples: string[];
  default_ttl_ms?: number;
  consolidation_threshold?: number;
}

// ═══════════════════════════════════════════════════════════════
// Code Indexer Types (stubs for ICodeIndexer interface)
// ═══════════════════════════════════════════════════════════════

export interface IndexOptions {
  include?: string[];
  exclude?: string[];
  followSymlinks?: boolean;
  enableCrossLanguage?: boolean;
  maxDepth?: number;
}

export interface IndexResult {
  symbols: SymbolNode[];
  totalFiles: number;
  totalSymbols: number;
  errors: string[];
}

export interface SymbolNode {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method' | 'property';
  path: string;
  language: string;
  startLine: number;
  endLine: number;
  signature?: string;
  doc?: string;
}

export const MEMORY_TIER_MAP: Record<MemoryType, MemoryTier> = {
  fact: 'long_term',
  preference: 'permanent',
  procedure: 'long_term',
  event: 'medium_term',
  error: 'long_term',
  mcp_registry: 'permanent',
  mcp_tool: 'permanent',
  mcp_example: 'permanent',
  code_file: 'long_term',
  code_symbol: 'long_term',
  code_dependency: 'long_term',
  code_architecture: 'long_term',
  code_hotspot: 'medium_term',
  cross_agent_relation: 'long_term',
  insight: 'medium_term',
  conflict_flag: 'short_term',
  merge_result: 'short_term',
};
