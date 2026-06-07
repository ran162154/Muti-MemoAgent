// ─────────────────────────────────────────────────────────────────
// memograph analyze — Cognitive pipeline command
// Runs domain analysis, knowledge extraction, and graph building.
// ─────────────────────────────────────────────────────────────────

import {MemoryStore} from '@mutimemoagent/memory';
import {XiamiClient, LocalDB} from '@mutimemoagent/persist';
import {loadConfig, getCacheDir} from '@mutimemoagent/sdk';
import {createEmbedder, BaseLLMClient} from '@mutimemoagent/core';
import * as path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';

export interface AnalyzeOptionsCLI {
  domain?: boolean;
  knowledge?: string;
  language?: string;
}

/**
 * `memograph analyze` — Run cognitive analysis pipeline.
 *
 * Options:
 *   --domain       Enable business domain analysis
 *   --knowledge    Path to knowledge base / wiki articles for analysis
 *   --language     Target output language for analysis results
 */
export async function analyzeCommand(options: AnalyzeOptionsCLI): Promise<void> {
  console.log('');
  console.log(chalk.bold('  ╔══════════════════════════════════════════╗'));
  console.log(chalk.bold('  ║       Cognitive Analysis Engine         ║'));
  console.log(chalk.bold('  ╚══════════════════════════════════════════╝'));
  console.log('');

  try {
    const config = loadConfig();
    const cacheDir = getCacheDir();
    const cwd = process.cwd();

    console.log(`  ${chalk.cyan('📁')} Project:     ${cwd}`);

    if (options.domain) {
      console.log(`  ${chalk.cyan('🏢')} Domain:      Enabled`);
    }
    if (options.knowledge) {
      console.log(`  ${chalk.cyan('📚')} Knowledge:   ${options.knowledge}`);
    }
    if (options.language) {
      console.log(`  ${chalk.cyan('🌐')} Language:    ${options.language}`);
    }
    console.log('');

    // Initialize dependencies
    const db = new LocalDB();
    db.initialize(path.join(cacheDir, 'memograph.db'));
    const xiamiClient = new XiamiClient({
      api_base: config.xiami.api_base,
      platform_key: config.xiami.platform_key,
    });
    // SAFETY: XiamiClientImpl and LocalDBImpl need casting to match memory's interfaces
    const memoryStore = new MemoryStore(xiamiClient as unknown as import('@mutimemoagent/memory').XiamiClient, db as unknown as import('@mutimemoagent/memory').LocalDB);
    const llmClient = new BaseLLMClient({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || process.env.XIAMI_LLM_KEY || '',
    });

    // Run cognitive pipeline
    const spinner = ora('Running cognitive analysis...').start();

    try {
      const {CognitivePipeline} = await import('@mutimemoagent/cognitive');
      const cognitive = new CognitivePipeline();

      const pipelineOptions = {
        rootPath: cwd,
        outputDir: '',
        concurrency: 4,
        includeDomain: options.domain ?? true,
        includeKnowledge: !!options.knowledge,
        language: options.language,
      };

      // SAFETY: CognitivePipeline.run accepts flexible options with rootPath
      const result = await cognitive.run(pipelineOptions as Parameters<typeof cognitive.run>[0]);
      spinner.succeed('Cognitive analysis complete');

      if (result && result.stats) {
        console.log('');
        console.log(`  ${chalk.green('📊')} Analysis Summary:`);
        console.log(`     • ${result.stats.totalFiles} files analyzed`);
        console.log(`     • ${result.stats.totalNodes} knowledge nodes`);
        console.log(`     • ${result.stats.totalEdges} edges`);
        console.log(`     • ${result.stats.layersFound} architecture layers`);
        console.log(`     • Languages: ${result.stats.languagesDetected.join(', ') || 'none'}`);
        console.log(`     • Frameworks: ${result.stats.frameworksDetected.join(', ') || 'none'}`);
        console.log(`     • Quality score: ${result.stats.qualityScore.toFixed(2)}`);

        if (result.graph && result.graph.tours && result.graph.tours.length > 0) {
          console.log(`     • Guided tours: ${result.graph.tours.length}`);
          for (const tour of result.graph.tours) {
            console.log(`       - "${tour.title}" (${tour.targetAudience}, ${tour.steps.length} steps)`);
          }
        }
      }

      if (result && result.domain) {
        console.log('');
        console.log(`  ${chalk.cyan('🏢')} Business Domains:`);
        for (const domain of result.domain.domains) {
          console.log(`     • ${chalk.bold(domain.name)} — ${domain.description}`);
        }
      }

      console.log('');
      console.log(`  ${chalk.green('✨')} Analysis complete.`);
    } catch (err) {
      spinner.fail('Cognitive pipeline failed');

      // Try fallback: use CodeIndexer directly for basic analysis
      console.log(`  ${chalk.yellow('⚠️')} Cognitive pipeline not yet fully implemented.`);
      console.log(`     ${err instanceof Error ? err.message : String(err)}`);

      // Fallback: basic symbol analysis
      console.log('');
      await basicSymbolAnalysis(cwd);
    }

    console.log('');
  } catch (err) {
    console.error(chalk.red('  ❌ Analysis failed:'), err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/**
 * Fallback basic analysis when the cognitive pipeline is unavailable.
 */
async function basicSymbolAnalysis(projectDir: string): Promise<void> {
  const spinner = ora('Running basic symbol analysis...').start();

  try {
    // Use CodeIndexer if available
    const {CodeIndexer} = await import('@mutimemoagent/indexer');
    const indexer = new CodeIndexer();
    const result = await indexer.index(projectDir);
    spinner.succeed('Symbol analysis complete');

    console.log('');
    console.log(`  ${chalk.cyan('🔍')} Symbol Analysis:`);
    console.log(`     • ${result.files} files scanned`);
    console.log(`     • ${result.symbols} symbols found`);
    console.log(`     • ${result.edges} edges built`);
    console.log(`     • Duration: ${result.duration}ms`);
    if (result.errors.length > 0) {
      console.log(`     • ${chalk.yellow(`${result.errors.length} errors`)}`);
      for (const err of result.errors.slice(0, 3)) {
        console.log(`       ⚠️  ${err}`);
      }
    }
  } catch {
    spinner.warn('No indexer available');
    console.log(`  ${chalk.gray('Install @mutimemoagent/indexer for detailed symbol analysis.')}`);
  }
}
