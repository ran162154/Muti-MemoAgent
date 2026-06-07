// ─────────────────────────────────────────────────────────────────
// memograph index — Code indexing command
// Uses CodeIndexer, triggers cognitive pipeline, syncs to xiami.
// ─────────────────────────────────────────────────────────────────

import {IngestPipeline} from '@mutimemoagent/ingest';
import {MemoryStore} from '@mutimemoagent/memory';
import {XiamiClient, LocalDB, SyncManager} from '@mutimemoagent/persist';
import {loadConfig, getCacheDir} from '@mutimemoagent/sdk';
import {createEmbedder, BaseLLMClient} from '@mutimemoagent/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import chalk from 'chalk';

export interface IndexOptionsCLI {
  quiet?: boolean;
  full?: boolean;
}

/**
 * `memograph index` — Index project code into memory.
 *
 * Supports:
 *   --full   Full run: index → cognitive analysis → sync to xiami
 *   --quiet  Suppress non-error output
 */
export async function indexCommand(options: IndexOptionsCLI): Promise<void> {
  if (!options.quiet) {
    console.log('');
    console.log(chalk.bold('  ╔══════════════════════════════════════════╗'));
    console.log(chalk.bold('  ║         Code Indexing Engine            ║'));
    console.log(chalk.bold('  ╚══════════════════════════════════════════╝'));
    console.log('');
  }

  try {
    const config = loadConfig();
    const cacheDir = getCacheDir();
    const cwd = process.cwd();

    if (!options.quiet) {
      console.log(`  ${chalk.cyan('📁')} Project:     ${cwd}`);
      console.log(`  ${chalk.cyan('🗂️')}  Cache:       ${cacheDir}`);
      if (options.full) {
        console.log(`  ${chalk.cyan('🔬')} Mode:        Full (index + cognitive + sync)`);
      } else {
        console.log(`  ${chalk.cyan('⚡')} Mode:        Index only`);
      }
      console.log('');
    }

    // Discover project files
    const files = await discoverProjectFiles(cwd);

    if (files.length === 0) {
      if (!options.quiet) {
        console.log(`  ${chalk.yellow('⚠️')} No source files found to index.`);
        console.log('     Supported: .ts, .js, .py, .rs, .go, .java, .md, .json, .yaml, .toml');
      }
      return;
    }

    if (!options.quiet) {
      console.log(`  ${chalk.green('📄')} Discovered ${chalk.bold(String(files.length))} files`);
      console.log('');
    }

    // Initialize pipeline
    const db = new LocalDB();
    db.initialize(path.join(cacheDir, 'memograph.db'));
    const xiamiClient = new XiamiClient({
      api_base: config.xiami.api_base,
      platform_key: config.xiami.platform_key,
    });
    // SAFETY: XiamiClientImpl and LocalDBImpl need casting to match memory's interfaces
    const memoryStore = new MemoryStore(xiamiClient as unknown as import('@mutimemoagent/memory').XiamiClient, db as unknown as import('@mutimemoagent/memory').LocalDB);
    const embedder = createEmbedder(256);
    const llmClient = new BaseLLMClient({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || process.env.XIAMI_LLM_KEY || '',
    });

    const pipeline = new IngestPipeline({
      embedder,
      llm: llmClient,
      memoryStore,
    });

    let indexed = 0;
    let failed = 0;
    let symbolsFound = 0;
    let edgesBuilt = 0;

    // Index files
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const relativePath = path.relative(cwd, file);

        if (!options.quiet && files.length <= 20) {
          process.stdout.write(`  ${chalk.cyan('📝')} ${relativePath}... `);
        }

        const fileEvent = {
          id: `index_${crypto.createHash('md5').update(file).digest('hex').slice(0, 8)}`,
          source: 'code' as const,
          timestamp: Date.now(),
          payload: content,
          metadata: {
            file_path: relativePath,
            file_ext: path.extname(file),
            file_size: content.length,
          },
        };

        const result = await pipeline.process(fileEvent);

        if (result.written.length > 0) {
          indexed += result.written.length;
          symbolsFound += countSymbols(content);
          edgesBuilt += countEdges(content);

          if (!options.quiet && files.length <= 20) {
            process.stdout.write(chalk.green(`✅ ${result.written.length} entries\n`));
          } else if (!options.quiet && files.length > 20) {
            // Show progress dot for large projects
            process.stdout.write(chalk.green('·'));
          }
        } else if (result.failed.length > 0) {
          failed += result.failed.length;
          if (!options.quiet && files.length <= 20) {
            process.stdout.write(chalk.yellow(`⚠️  ${result.failed[0].error}\n`));
          }
        } else {
          if (!options.quiet && files.length <= 20) {
            process.stdout.write(chalk.gray('⏭️  skipped\n'));
          }
        }
      } catch (err) {
        failed++;
        if (!options.quiet) {
          console.error(`  ${chalk.red('❌')} ${path.relative(cwd, file)}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (!options.quiet && files.length > 20) {
      process.stdout.write('\n');
    }

    // Summary
    if (!options.quiet || indexed > 0) {
      console.log('');
      console.log(`  ${chalk.green('✅')} ${chalk.bold(String(indexed))} memory entries written from ${chalk.bold(String(files.length))} files`);
      console.log(`  ${chalk.cyan('🔍')} ~${symbolsFound} symbols found, ~${edgesBuilt} edges built`);
      if (failed > 0) {
        console.log(`  ${chalk.yellow(`⚠️  ${failed} failures`)}`);
      }
      console.log('');
    }

    // If --full, run cognitive analysis and sync
    if (options.full) {
      console.log(`  ${chalk.cyan('🔬')} Running cognitive analysis...`);

      try {
        const {CognitivePipeline} = await import('@mutimemoagent/cognitive');
        const cognitive = new CognitivePipeline();
        // SAFETY: CognitivePipeline.run accepts flexible options with rootPath
        const result = await cognitive.run({rootPath: cwd} as Parameters<typeof cognitive.run>[0]);
        console.log(`  ${chalk.green('✅')} Cognitive analysis complete`);
        if (result && result.stats) {
          console.log(`     ${result.stats.totalNodes} knowledge nodes, ${result.stats.totalEdges} edges`);
        }
      } catch (err) {
        console.log(`  ${chalk.yellow('⚠️')} Cognitive pipeline not yet available: ${err instanceof Error ? err.message : String(err)}`);
      }

      console.log(`  ${chalk.cyan('🔄')} Syncing to xiami...`);
      try {
        const syncManager = new SyncManager(xiamiClient, db);
        await syncManager.fullSync('default');
        console.log(`  ${chalk.green('✅')} Sync complete`);
      } catch (err) {
        console.log(`  ${chalk.yellow('⚠️')} Sync failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      console.log('');
    }

    if (!options.quiet) {
      console.log(`  ${chalk.green('✨')} Indexing complete.`);
      console.log('');
    }
  } catch (err) {
    console.error(chalk.red('  ❌ Indexing failed:'), err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/**
 * Roughly count symbol declarations in source code.
 */
function countSymbols(content: string): number {
  const patterns = [
    /\bexport\s+(default\s+)?(function|class|interface|type|enum|const|let|var)\s+\w+/g,
    /\bfunction\s+\w+/g,
    /\bclass\s+\w+/g,
    /\binterface\s+\w+/g,
    /\benum\s+\w+/g,
    /\btype\s+\w+\s*=/g,
    /\bdef\s+\w+/g,       // Python
    /\bfn\s+\w+/g,        // Rust
    /\bfunc\s+\w+/g,       // Go
  ];
  let count = 0;
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Roughly count dependency edges in source code.
 */
function countEdges(content: string): number {
  const importPatterns = [
    /\bimport\s+/g,
    /\brequire\s*\(/g,
    /\bfrom\s+['"]/g,
  ];
  let count = 0;
  for (const pattern of importPatterns) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Discover project source files recursively.
 */
async function discoverProjectFiles(rootDir: string): Promise<string[]> {
  const extensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
    '.py', '.rs', '.go', '.java', '.rb', '.php',
    '.md', '.mdx', '.json', '.yaml', '.yml', '.toml',
    '.css', '.scss', '.html', '.vue', '.svelte',
  ]);

  const ignoreDirs = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
    '__pycache__', '.venv', 'venv', 'target', 'vendor',
    '.openclaw', '.memograph', 'coverage',
  ]);

  const files: string[] = [];

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
            files.push(fullPath);
          }
        }
      }
    } catch {
      // permission denied, skip
    }
  }

  walk(rootDir);

  // Sort for deterministic output
  files.sort();
  return files;
}
