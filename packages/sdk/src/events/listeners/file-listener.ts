// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/sdk/events — FileListener
// Watch project files and emit 'file:changed' events.
// chokidar is optional — install for full file watching support.
// ─────────────────────────────────────────────────────────────────

import * as path from 'node:path';
import { EventBus } from '../bus.js';

// chokidar is optional — install for full file watching support
declare function require(name: string): any;

const DEFAULT_IGNORED = [
  /(^|[/\\])node_modules[/\\]/,
  /(^|[/\\])\.git[/\\]/,
  /(^|[/\\])dist[/\\]/,
  /(^|[/\\])build[/\\]/,
  /(^|[/\\])\.memograph[/\\]/,
];

export class FileListener {
  private bus: EventBus;
  private watcher: any = null;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  watch(projectDir: string, patterns: string[] = ['**/*']): void {
    try {
      const chokidar = require('chokidar');
      if (!chokidar) {
        console.warn('[FileListener] chokidar not installed. File watching disabled.');
        return;
      }
      this.watcher = chokidar.watch(projectDir, {
        ignored: DEFAULT_IGNORED,
        persistent: true,
        ignoreInitial: true,
      });
      this.watcher.on('change', (_eventType: any, filePath: any) => {
        this.bus.emit('file:changed', { files: [filePath], projectDir });
      });
      console.log(`[FileListener] Watching ${projectDir}`);
    } catch {
      console.warn('[FileListener] chokidar not installed. Run: pnpm add chokidar');
    }
  }

  unwatch(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
