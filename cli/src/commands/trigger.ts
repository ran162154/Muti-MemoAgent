// ─────────────────────────────────────────────────────────────────
// memograph trigger — Manually trigger an event
// ─────────────────────────────────────────────────────────────────

import {
  EventBus,
  PipelineOrchestrator,
  isValidEvent,
  getEventNames,
} from '@mutimemoagent/sdk';
import chalk from 'chalk';

export interface TriggerOptionsCLI {
  event: string;
}

const SUPPORTED_EVENTS = [
  'file:changed',
  'git:commit',
  'schedule:tick',
  'evolution:complete',
];

/**
 * `memograph trigger <event>` — Fire an event manually.
 *
 * Supported events:
 *   file:changed      Trigger incremental index + sync
 *   git:commit        Trigger full index + cognitive analysis + sync
 *   schedule:tick     Trigger scheduled task (requires --name)
 *   evolution:cycle   Trigger evolution pipeline
 */
export async function triggerCommand(event: string): Promise<void> {
  console.log('');
  console.log(chalk.bold('  ╔══════════════════════════════════════════╗'));
  console.log(chalk.bold('  ║         Event Trigger                   ║'));
  console.log(chalk.bold('  ╚══════════════════════════════════════════╝'));
  console.log('');

  if (!SUPPORTED_EVENTS.includes(event)) {
    console.error(chalk.red(`  ❌ Unsupported event: "${event}"`));
    console.log(`     Supported events: ${SUPPORTED_EVENTS.join(', ')}`);
    console.log(`     All event names:  ${getEventNames().join(', ')}`);
    console.log('');
    process.exit(1);
  }

  if (!isValidEvent(event)) {
    console.error(chalk.red(`  ❌ Invalid event name: "${event}"`));
    process.exit(1);
  }

  console.log(`  ${chalk.cyan('⚡')} Event:        ${chalk.bold(event)}`);
  console.log(`  ${chalk.cyan('📁')} Project:      ${process.cwd()}`);
  console.log('');

  try {
    const orchestrator = new PipelineOrchestrator();

    console.log(`  ${chalk.cyan('🔄')} Processing...`);

    switch (event) {
      case 'file:changed':
        console.log(`  ${chalk.cyan('📝')} Triggering incremental index + sync...`);
        await orchestrator.onFileChange([]);
        break;

      case 'git:commit':
        console.log(`  ${chalk.cyan('🔬')} Triggering full index + cognitive + sync...`);
        await orchestrator.onGitCommit();
        break;

      case 'schedule:tick':
        console.log(`  ${chalk.cyan('⏰')} Triggering schedule tick...`);
        await orchestrator.onSchedule('evolution-cycle');
        console.log(`  ${chalk.cyan('⏰')} Triggering forgetting cycle...`);
        await orchestrator.onSchedule('forgetting-cycle');
        console.log(`  ${chalk.cyan('⏰')} Triggering discovery cycle...`);
        await orchestrator.onSchedule('discovery');
        break;

      case 'evolution:complete':
        console.log(`  ${chalk.cyan('🧬')} Triggering evolution pipeline...`);
        await orchestrator.onSchedule('evolution-cycle');
        break;

      default:
        console.error(chalk.red(`  ❌ Unhandled event: "${event}"`));
        process.exit(1);
    }

    console.log(`  ${chalk.green('✅')} Event "${event}" completed successfully.`);
    console.log('');

  } catch (err) {
    console.error(chalk.red(`  ❌ Event "${event}" failed:`), err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
