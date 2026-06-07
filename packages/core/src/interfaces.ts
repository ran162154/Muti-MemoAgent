// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/core — Interface Layer (abstract public API surface)
//
// These interfaces decouple high-level orchestration from concrete
// implementations, making it easy to swap backends, indexers, or
// pipeline steps without changing dependent code.
// ─────────────────────────────────────────────────────────────────

import type {
  MemoryEntry,
  SearchQuery,
  SearchResult,
  IndexOptions,
  IndexResult,
  SymbolNode,
  XiamiWriteInput,
  XiamiSearchInput,
  XiamiAgentInfo,
  MemoryType,
  ClassifiedItem,
} from './types.js';

// ═══════════════════════════════════════════════════════════════
// Storage Backend Interface (abstraction over Xiami/cloud)
// ═══════════════════════════════════════════════════════════════

export interface IStorageBackend {
  /** Write a single entry */
  write(input: XiamiWriteInput): Promise<{ id: string }>;

  /** Write multiple entries in batch */
  writeBatch(inputs: XiamiWriteInput[]): Promise<{ ids: string[] }>;

  /** Search stored entries */
  search(input: XiamiSearchInput): Promise<MemoryEntry[]>;

  /** Cross-agent search */
  searchCrossAgent(query: string): Promise<SearchResult[]>;

  /** List agents */
  listAgents(): Promise<XiamiAgentInfo[]>;

  /** Get agent statistics */
  getStats(agentId: string): Promise<Record<string, unknown>>;

  /** Run forgetting cycle */
  runForgetting(agentId: string): Promise<void>;

  /** Create a new agent */
  createAgent(name: string, description?: string): Promise<XiamiAgentInfo>;

  /** Sync knowledge base entries */
  syncKnowledgeBase(entries: Array<{ content: string; type: MemoryType }>): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════
// Code Indexer Interface
// ═══════════════════════════════════════════════════════════════

export interface ICodeIndexer {
  /** Index a project root and return results */
  index(rootPath: string, options?: IndexOptions): Promise<IndexResult>;

  /** Get callers of a symbol (who calls this symbol) */
  getCallers(symbol: string): SymbolNode[];

  /** Get callees of a symbol (who this symbol calls) */
  getCallees(symbol: string): SymbolNode[];

  /** Search indexed symbols */
  search(query: string): SearchResult[];
}

// ═══════════════════════════════════════════════════════════════
// Pipeline Step Interface
// ═══════════════════════════════════════════════════════════════

export interface IPipelineStep<TInput = unknown, TOutput = unknown> {
  /** Human-readable step name */
  name: string;

  /** Process a single input and produce output */
  process(input: TInput): Promise<TOutput>;
}

// ═══════════════════════════════════════════════════════════════
// Local DB Interface
// ═══════════════════════════════════════════════════════════════

export interface ILocalDB {
  /** Initialize the database (e.g. with a file path) */
  initialize?(dbPath: string): void;

  /** Insert or update a memory entry */
  insert(entry: MemoryEntry): void;

  /** Get an entry by ID */
  getById(id: string): MemoryEntry | null;

  /** Get all entries for a given agent */
  getAllByAgent(agentId: string): MemoryEntry[];

  /** Delete an entry by ID */
  deleteById(id: string): void;

  /** Full-text search */
  search(query: string, limit?: number): MemoryEntry[];

  /** Get entries indexed since a timestamp */
  getEntriesIndexedSince(since: number): MemoryEntry[];

  /** Total entry count */
  count(): number;

  /** Database statistics */
  getStats(): { count: number };

  /** Close the database */
  close?(): void;
}
