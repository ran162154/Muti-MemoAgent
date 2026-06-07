// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/sdk/events — PipelineOrchestrator
// Lazy-loads heavy packages only when needed
// ─────────────────────────────────────────────────────────────────

import { EventBus } from './bus.js';

export class PipelineOrchestrator {
  private bus: EventBus;

  constructor() {
    this.bus = new EventBus();
  }

  async onFileChange(files: string[]): Promise<void> {
    console.log(`[Orchestrator] Files changed: ${files.length} files`);
    // Lazy-load indexer when actually needed via dynamic import
    try {
      const idx = await import(String('@mutimemoagent/indexer'));
      const indexer = new idx.CodeIndexer();
      await indexer.index(process.cwd(), {
        includePatterns: ['**/*.ts', '**/*.py', '**/*.js'],
        excludePatterns: ['node_modules/**', 'dist/**', '.git/**'],
        maxFileSize: 1048576, languages: [],
      });
      console.log('[Orchestrator] Incremental index complete');
    } catch (e: any) {
      console.error(`[Orchestrator] Index failed: ${e.message}`);
    }
  }

  async onGitCommit(): Promise<void> {
    console.log('[Orchestrator] Git commit detected');
    await this.onFileChange([]);
  }

  async onSchedule(event: string): Promise<void> {
    console.log(`[Orchestrator] Scheduled event: ${event}`);
    if (event === 'evolution-cycle') {
      console.log('[Orchestrator] Running evolution cycle...');
    } else if (event === 'forgetting-cycle') {
      console.log('[Orchestrator] Running forgetting cycle...');
    }
  }

  getEventBus(): EventBus {
    return this.bus;
  }
}
