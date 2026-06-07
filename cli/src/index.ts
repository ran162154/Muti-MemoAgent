#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════
// @memograph/cli — CLI 入口
// ═══════════════════════════════════════════════════════════════

import {Command} from 'commander';
import {initCommand} from './commands/init.js';
import {statusCommand} from './commands/status.js';
import {indexCommand} from './commands/index.js';
import {searchCommand} from './commands/search.js';
import {memoCommand} from './commands/memo.js';
import {evolveCommand} from './commands/evolve.js';
import {forgetCommand} from './commands/forget.js';
import {dashboardCommand} from './commands/dashboard.js';
import {analyzeCommand} from './commands/analyze.js';
import {watchCommand} from './commands/watch.js';
import {triggerCommand} from './commands/trigger.js';
import {onboardCommand} from './commands/onboard.js';
import {checkCommand} from './commands/check.js';

const program = new Command();

program
  .name('memograph')
  .description('Multi-MemoAgent — 多智能体记忆体自进化网络')
  .version('0.1.0')
  .showHelpAfterError(true);

// ═══════════════════════════════════════════════════════════════
// Commands
// ═══════════════════════════════════════════════════════════════

program
  .command('init')
  .description('Initialize memograph in the current or specified project')
  .option('-k, --xiami-key <key>', 'Xiami platform API key')
  .option('-p, --project-name <name>', 'Project name to initialize')
  .option('--no-profile', 'Skip creating profile agent')
  .option('--no-mcp', 'Skip creating MCP registry agent')
  .action(async (opts) => {
    await initCommand(opts);
  });

program
  .command('status')
  .description('Show memograph connection and agent status')
  .action(async () => {
    await statusCommand();
  });

program
  .command('index')
  .description('Index the current project code into memory')
  .option('-q, --quiet', 'Suppress non-error output')
  .option('--full', 'Full index: run cognitive pipeline and sync to xiami')
  .action(async (opts) => {
    await indexCommand(opts);
  });

program
  .command('analyze')
  .description('Run cognitive analysis pipeline on the project')
  .option('--domain', 'Enable business domain analysis')
  .option('--knowledge <path>', 'Path to knowledge base/wiki articles for analysis')
  .option('--language <lang>', 'Target output language for analysis results')
  .action(async (opts) => {
    await analyzeCommand(opts);
  });

program
  .command('watch')
  .description('Watch files and auto-index/sync on changes')
  .option('--patterns <patterns>', 'Comma-separated glob patterns to watch')
  .action(async (opts) => {
    const patterns = opts.patterns ? opts.patterns.split(',') : undefined;
    await watchCommand({patterns});
  });

program
  .command('trigger')
  .description('Manually trigger an event')
  .argument('<event>', 'Event name to trigger')
  .action(async (event) => {
    await triggerCommand(event);
  });

program
  .command('search')
  .description('Search across all memory agents')
  .argument('<query>', 'Search query string')
  .option('-a, --agent <id>', 'Scope search to specific agent')
  .option('-t, --type <type>', 'Filter by memory type')
  .option('-n, --max-results <number>', 'Max results', '10')
  .option('--mode <mode>', 'Search mode: natural|symbol|chain|impact', 'natural')
  .action(async (query, opts) => {
    await searchCommand(query, opts);
  });

program
  .command('memo')
  .description('Manually write a memory entry')
  .argument('<content>', 'Memory content to write')
  .option('-a, --agent <id>', 'Target agent (default: profile)')
  .option('-t, --type <type>', 'Memory type (default: fact)')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(async (content, opts) => {
    await memoCommand(content, opts);
  });

program
  .command('evolve')
  .description('Run the evolution cycle — split, merge, consolidate')
  .option('--dry-run', 'Show what would happen without executing')
  .action(async (opts) => {
    await evolveCommand(opts);
  });

program
  .command('forget')
  .description('Run the forgetting cycle — decay and prune stale memories')
  .argument('[agent]', 'Specific agent to process (default: all)')
  .option('--dry-run', 'Show what would be forgotten without executing')
  .action(async (agent, opts) => {
    await forgetCommand(agent, opts);
  });

program
  .command('onboard')
  .description('First-time setup: register Xiami account, get API key, show quick start guide')
  .action(async () => {
    await onboardCommand();
  });

program
  .command('check')
  .description('Check Xiami quota and balance')
  .option('-e, --entries <n>', 'Expected entries needed', '5')
  .option('-a, --agents <n>', 'Expected agents needed', '0')
  .action(async (opts) => {
    await checkCommand(opts);
  });

program
// ═══════════════════════════════════════════════════════════════
// Parse
// ═══════════════════════════════════════════════════════════════

program.parse(process.argv);
