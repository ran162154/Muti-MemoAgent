// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/ingest — 记忆摄入管道
// ─────────────────────────────────────────────────────────────────

export {IngestPipeline} from './pipeline.js';
export type {PipelineConfig, PipelineStep, ClassifierStep} from './pipeline.js';

// Filter
export {SignalFilter} from './filter/signal-filter.js';
export type {FilterResult} from './filter/signal-filter.js';

export {DedupDetector} from './filter/dedup.js';
export type {DedupResult} from './filter/dedup.js';

export {clean, DEFAULT_FILLER_WORDS} from './filter/cleaner.js';

// Router
export {SmartRouter} from './router/smart-router.js';
export type {RoutingContext} from './router/smart-router.js';

// Extractors
export {ProfileExtractor} from './extractor/profile.js';
export {CodeExtractor} from './extractor/code.js';
export {MCPExtractor} from './extractor/mcp.js';
