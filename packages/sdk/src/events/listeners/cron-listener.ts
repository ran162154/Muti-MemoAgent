// ─────────────────────────────────────────────────────────────────
// @memograph/events — CronListener
// Simple interval-based scheduler for periodic tasks.
// ─────────────────────────────────────────────────────────────────

import { EventBus } from '../bus.js';

export interface ScheduledJob {
  name: string;
  cronExpr: string;
  nextRun: number;
  intervalMs: number;
  lastRun: number | null;
}

export interface CronListenerOptions {
  eventBus: EventBus;
}

/**
 * Parse a cron expression and return the interval in milliseconds.
 *
 * Supports simplified expressions:
 *   5-field cron patterns: every minute, every N minutes, hourly,
 *   every H hours, daily at given hour, weekly on given day.
 *
 * Returns the interval in milliseconds. Throws on invalid expressions.
 */
export function parseCronExpr(expr: string): number {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: "${expr}" -- expected 5 fields`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // "every minute" — * * * * *
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 60_000;
  }

  // "every N minutes" — */N * * * *
  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = parseInt(minute.slice(2), 10);
    if (isNaN(n) || n < 1) throw new Error(`Invalid minute interval: ${minute}`);
    return n * 60_000;
  }

  // "every hour" — 0 * * * *
  if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 3_600_000;
  }

  // "every H hours" — 0 */H * * *
  if (minute === '0' && hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const h = parseInt(hour.slice(2), 10);
    if (isNaN(h) || h < 1) throw new Error(`Invalid hour interval: ${hour}`);
    return h * 3_600_000;
  }

  // "daily at HH:MM" — M H * * *
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const m = parseInt(minute, 10);
    const h = parseInt(hour, 10);
    if (isNaN(m) || isNaN(h)) throw new Error(`Invalid daily time: ${minute} ${hour}`);
    return 24 * 3_600_000;
  }

  // "weekly DOW HH:MM" — M H * * DOW
  if (dayOfMonth === '*' && month === '*') {
    const dow = parseInt(dayOfWeek, 10);
    if (isNaN(dow) || dow < 0 || dow > 6) throw new Error(`Invalid day-of-week: ${dayOfWeek}`);
    return 7 * 24 * 3_600_000;
  }

  // Fallback: compute next run from expression and return interval
  const intervalMs = computeIntervalFromExpr(parts);
  return intervalMs;
}

/**
 * Basic next-run computation for common patterns.
 */
function computeIntervalFromExpr(parts: string[]): number {
  const [minute, hour, , , dayOfWeek] = parts;

  // Weekly pattern: 0 2 * * 0 (Sunday 2AM)
  if (minute === '0' && hour !== '*' && dayOfWeek !== '*') {
    return 7 * 24 * 3_600_000;
  }

  // Default: daily
  if (minute !== '*' && hour !== '*') {
    return 24 * 3_600_000;
  }

  // Last resort: hourly
  return 3_600_000;
}

/**
 * Compute the next run timestamp (epoch ms) from a cron expression.
 */
export function computeNextRun(expr: string): number {
  const intervalMs = parseCronExpr(expr);
  return Date.now() + intervalMs;
}

/**
 * Manages scheduled periodic jobs using setInterval.
 *
 * Built-in schedules:
 *   - 'evolution-cycle':     every 24h  → emit 'schedule:tick' (evolution)
 *   - 'forgetting-cycle':    weekly Sunday 2AM → emit 'schedule:tick' (forgetting)
 *   - 'cross-agent-discovery': weekly Monday 8AM → emit 'schedule:tick' (discovery)
 */
export class CronListener {
  private eventBus: EventBus;
  private jobs = new Map<string, ScheduledJob>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private running = false;

  constructor(options: CronListenerOptions) {
    this.eventBus = options.eventBus;
  }

  /**
   * Start the built-in schedules.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Built-in schedules
    this.schedule('evolution-cycle', '0 0 * * *', async () => {
      this.eventBus.emit('schedule:tick', { task: 'evolution-cycle', name: 'evolution' });
    });

    this.schedule('forgetting-cycle', '0 2 * * 0', async () => {
      this.eventBus.emit('schedule:tick', { task: 'forgetting-cycle', name: 'forgetting' });
    });

    this.schedule('cross-agent-discovery', '0 8 * * 1', async () => {
      this.eventBus.emit('schedule:tick', { task: 'cross-agent-discovery', name: 'discovery' });
    });
  }

  /**
   * Stop all scheduled jobs.
   */
  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.jobs.clear();
  }

  /**
   * Schedule a new periodic job.
   *
   * @param name     Unique job name
   * @param cronExpr Simplified cron expression
   * @param handler  Async handler to call on each tick
   */
  schedule(name: string, cronExpr: string, handler: () => Promise<void>): void {
    // Unschedule existing job with the same name
    this.unschedule(name);

    const intervalMs = parseCronExpr(cronExpr);
    const nextRun = Date.now() + intervalMs;

    const job: ScheduledJob = {
      name,
      cronExpr,
      nextRun,
      intervalMs,
      lastRun: null,
    };

    this.jobs.set(name, job);

    const timer = setInterval(async () => {
      const now = Date.now();
      const entry = this.jobs.get(name);
      if (entry) {
        entry.lastRun = entry.nextRun;
        entry.nextRun = now + entry.intervalMs;
      }
      try {
        await handler();
      } catch (err) {
        console.error(`[CronListener] Job "${name}" failed:`, err);
      }
    }, intervalMs);

    this.timers.set(name, timer);
  }

  /**
   * Unschedule a job by name.
   */
  unschedule(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(name);
    }
    this.jobs.delete(name);
  }

  /**
   * List all currently scheduled jobs.
   */
  list(): ScheduledJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Check whether the scheduler is running.
   */
  isRunning(): boolean {
    return this.running;
  }
}
