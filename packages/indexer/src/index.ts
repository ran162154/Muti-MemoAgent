// ─── @mutimemoagent/indexer ──────────────────────────────────────────────────
// Code indexing engine — Tree-sitter AST parsing, symbol extraction, call graph,
// framework recognition, cross-language bridging, file watching, and SQLite+FTS5 persistence.

// Core Indexer
export { CodeIndexer } from './indexer.js';
export type { MemoryEntry } from './indexer.js';
export type { IndexOptions, IndexResult } from './types.js';

// Extraction
export { ExtractorRegistry } from './extraction/extractor-registry.js';
export { TypeScriptExtractor } from './extraction/typescript-extractor.js';
export { PythonExtractor } from './extraction/python-extractor.js';
export { GoExtractor } from './extraction/go-extractor.js';
export { GenericExtractor } from './extraction/generic-extractor.js';
export type { LanguageExtractor, ExtractionResult, SymbolNode, ImportEdge, CallEdge } from './types.js';

// Graph
export { CodeGraph } from './graph/code-graph.js';
export type { GraphNode, GraphEdge, GraphData, GraphStats, SubGraph, FileNode, ImpactChain, SearchResult } from './types.js';
export type { SymbolKind, EdgeType } from './types.js';

// Database
export { IndexDB } from './db/index-db.js';
export type { FileRecord, SymbolRecord, EdgeRecord } from './db/index-db.js';

// Framework Detection
export { FrameworkDetector } from './resolution/framework-detector.js';
export type { FrameworkInfo, RouteInfo } from './types.js';

// Cross-Language Bridge
export { CrossLanguageBridge } from './resolution/cross-language-bridge.js';
export type { BridgeInfo, BridgeInterface } from './types.js';

// File Watcher
export { FileWatcher } from './watcher/file-watcher.js';
