// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/memory — 统一导出
// ─────────────────────────────────────────────────────────────────

// 条目工厂
export {
  createEntry,
  updateEntry,
  mergeEntries,
  splitEntry,
} from './entry.js';
export type {
  CreateEntryParams,
  EntryPatch,
  SplitFunction,
} from './entry.js';

// 存储引擎
export { MemoryStore } from './store.js';
export type {
  XiamiClient,
  LocalDB,
} from './store.js';

// 生命周期管理
export { LifecycleManager } from './lifecycle.js';
export { TIER_TTL_MAP } from './lifecycle.js';

// 召回引擎
export { RecallEngine } from './recall.js';
export type { RecallContext } from './recall.js';

// 遗忘引擎
export { ForgettingEngine } from './forget.js';
export type { ForgettingReport, ForgettingDecision } from './forget.js';

// 冲突检测
export { ConflictDetector } from './conflict.js';
export type {
  ConflictReport,
  ConflictType,
  ConflictResolutionStatus,
} from './conflict.js';

// 重要性评分
export { ImportanceScorer } from './importance.js';
