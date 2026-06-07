// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/events — FileListener
// Watch project files with chokidar and emit 'file:changed' events.
// ─────────────────────────────────────────────────────────────────

import * as chokidar from 'chokidar';
import * as path from 'node:path';
import { EventBus } from '../bus.js';

/**
 * Default ignore patterns matching common non-source directories.
 */
const DEFAULT_IGNORED = [
  /(^|[/\\])node_modules[/\\]/,
  /(^|[/\\])\.git[/\\]/,
  /(^|[/\\])dist[/\\]/,
  /(^|[/\\])build[/\\]/,
  /(^|[/\\])\.next[/\\]/,
  /(^|[/\\])__pycache__[/\\]/,
  /(^|[/\\])\.openclaw[/\\]/,
  /(^|[/\\])\.memograph[/\\]/,
];

export interface FileChangeEvent {
  files: string[];
  timestamp: number;
  projectDir: string;
}

export class FileListener {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFiles: Set<string> = new Set();
  private projectDir: string = '';
  private eventBus: EventBus;

  /**
   * Debounce interval in milliseconds before emitting the event.
   */
  private readonly debounceMs: number;

  constructor(eventBus: EventBus, debounceMs = 2000) {
    this.eventBus = eventBus;
    this.debounceMs = debounceMs;
  }

  /**
   * Start watching the project directory for file changes matching the given patterns.
   *
   * @param patterns  Glob patterns to watch (e.g. src/glob/*.ts)
   */
  watch(projectDir: string, patterns: string[]): void {
    if (this.watcher) {
      throw new Error('FileListener is already watching. Call unwatch() first.');
    }

    this.projectDir = projectDir;

    this.watcher = chokidar.watch(patterns, {
      cwd: projectDir,
      ignored: DEFAULT_IGNORED,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher.on('all', (_eventType, filePath) => {
      // Ignore hidden files and directories starting with .
      const basename = path.basename(filePath);
      if (basename.startsWith('.') && basename !== '.env') return;

      this.pendingFiles.add(filePath);
      this.scheduleEmit();
    });
  }

  /**
   * Stop watching and clean up.
   */
  unwatch(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.pendingFiles.clear();
  }

  /**
   * Whether the watcher is currently active.
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * Schedule an emit after the debounce window.
   */
  private scheduleEmit(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.debounceMs);
  }

  /**
   * Flush pending changes and emit the event immediately.
   */
  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pendingFiles.size === 0) return;

    const files = Array.from(this.pendingFiles);
    this.pendingFiles.clear();

    const event: FileChangeEvent = {
      files,
      timestamp: Date.now(),
      projectDir: this.projectDir,
    };

    this.eventBus.emit('file:changed', event);
  }
}
