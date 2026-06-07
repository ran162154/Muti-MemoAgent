// ─────────────────────────────────────────────────────────────────
// memograph watch — File watcher + auto-sync
// ─────────────────────────────────────────────────────────────────

import {
  EventBus,
  FileListener,
  PipelineOrchestrator,
} from '@mutimemoagent/sdk';
import {loadConfig, getCacheDir} from '@mutimemoagent/sdk';
import * as path from 'node:path';
import * as fs from 'node:fs';
import chalk from 'chalk';

export interface WatchOptionsCLI {
  patterns?: string[];
}

/**
 * `memograph watch` — Start file watcher and auto-sync pipeline.
 *
 * Watches source files, triggers incremental indexing on changes,
 * and syncs to xiami automatically.
 */
export async function watchCommand(options: WatchOptionsCLI): Promise<void> {
  console.log('');
  console.log(chalk.bold('  ╔══════════════════════════════════════════╗'));
  console.log(chalk.bold('  ║         File Watcher & Auto-Sync       ║'));
  console.log(chalk.bold('  ╚══════════════════════════════════════════╝'));
  console.log('');

  try {
    const config = loadConfig();
    const cacheDir = getCacheDir();
    const cwd = process.cwd();

    console.log(`  ${chalk.cyan('📁')} Project:     ${cwd}`);
    console.log(`  ${chalk.cyan('🗂️')}  Cache:       ${cacheDir}`);
    console.log('');

    // Setup orchestrator
    const orchestrator = new PipelineOrchestrator();
    const eventBus = orchestrator.getEventBus();

    // Connect file:changed events to orchestrator
    eventBus.on('file:changed', async (payload) => {
      const event = payload as {files: string[]; projectDir: string};
      console.log(`  ${chalk.green('📝')} Change detected: ${event.files.length} file(s)`);

      if (!options.patterns || event.files.length <= 10) {
        for (const file of event.files.slice(0, 5)) {
          console.log(`     ${chalk.gray('·')} ${file}`);
        }
        if (event.files.length > 5) {
          console.log(`     ${chalk.gray(`... and ${event.files.length - 5} more`)}`);
        }
      }

      try {
        await orchestrator.onFileChange(event.files);
        console.log(`  ${chalk.green('✅')} Indexed and synced\n`);
      } catch {
        console.log(`  ${chalk.red('❌')} Indexing failed\n`);
      }
    });

    // Discover files to determine watch patterns
    const patterns = options.patterns ?? await detectWatchPatterns(cwd);

    // Count initially matching files
    const fileCount = countWatchedFiles(cwd, patterns);

    console.log(`  ${chalk.cyan('👀')} Watching ${chalk.bold(String(fileCount))} files...`);
    console.log(`     Patterns: ${patterns.join(', ')}`);
    console.log('');
    console.log(chalk.gray('  Press Ctrl+C to stop watching'));
    console.log('');

    // Start file listener
    const fileListener = new FileListener(eventBus, 2000);
    fileListener.watch(cwd, patterns);

    // Handle shutdown
    process.on('SIGINT', () => {
      console.log(`\n  ${chalk.yellow('🛑')} Shutting down watcher...`);
      fileListener.unwatch();
      console.log(`  ${chalk.green('✅')} Watcher stopped.`);
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      fileListener.unwatch();
      process.exit(0);
    });

    // Keep alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      // Intentionally empty — keeps the process alive
    }, 30_000);

    process.on('SIGINT', () => {
      clearInterval(heartbeat);
    });

    // Prevent process from exiting
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        clearInterval(heartbeat);
        resolve();
      });
    });

  } catch (err) {
    console.error(chalk.red('  ❌ Watch failed:'), err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/**
 * Detect common source file patterns for watching.
 */
async function detectWatchPatterns(projectDir: string): Promise<string[]> {
  const patterns: string[] = ['src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'];

  // Check for common project types
  const hasPackageJson = fs.existsSync(path.join(projectDir, 'package.json'));
  const hasPyProject = fs.existsSync(path.join(projectDir, 'pyproject.toml'));
  const hasCargo = fs.existsSync(path.join(projectDir, 'Cargo.toml'));
  const hasGoMod = fs.existsSync(path.join(projectDir, 'go.mod'));

  if (hasPackageJson) {
    // Also watch config files
    patterns.push('*.config.{js,ts,json}');
    patterns.push('*.json');
  }
  if (hasPyProject) {
    patterns.push('**/*.py');
  }
  if (hasCargo) {
    patterns.push('**/*.rs');
  }
  if (hasGoMod) {
    patterns.push('**/*.go');
  }

  // Always watch markdown and config
  patterns.push('**/*.md');
  patterns.push('*.{yaml,yml,toml}');

  return patterns;
}

/**
 * Count files matching the given patterns.
 */
function countWatchedFiles(projectDir: string, patterns: string[]): number {
  let count = 0;
  const extensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
    '.py', '.rs', '.go', '.java', '.rb', '.php',
    '.md', '.mdx', '.json', '.yaml', '.yml', '.toml',
  ]);

  const ignoreDirs = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
    '__pycache__', '.venv', 'venv', 'target', '.openclaw', '.memograph',
  ]);

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, {withFileTypes: true});
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.has(ext)) {
            count++;
          }
        }
      }
    } catch {
      // skip
    }
  }

  walk(projectDir);
  return count;
}
