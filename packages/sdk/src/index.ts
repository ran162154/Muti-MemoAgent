// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/sdk — Public API
// ─────────────────────────────────────────────────────────────────

export {MemographSDK} from './installer.js';

export {
  loadConfig,
  saveConfig,
  getConfigPath,
  getCacheDir,
  getConfigDir,
  getLogDir,
  getDefaultConfig,
  isConfigInitialized,
  ensureConfigDir,
  loadIgnorePatterns,
} from './config.js';

export {
  installHooks,
  uninstallHooks,
  generateHookScript,
} from './hooks/git-hooks.js';

// ── Events (consolidated from @mutimemoagent/events) ───────────
export { EventBus } from './events/bus.js';
export type { EventHandler, EventName } from './events/bus.js';
export { isValidEvent, getEventNames } from './events/bus.js';

export { GitListener } from './events/listeners/git-listener.js';

export { FileListener } from './events/listeners/file-listener.js';

export { CronListener } from './events/listeners/cron-listener.js';
export type { ScheduledJob } from './events/listeners/cron-listener.js';
export { parseCronExpr, computeNextRun } from './events/listeners/cron-listener.js';

export { PipelineOrchestrator } from './events/orchestrator.js';
