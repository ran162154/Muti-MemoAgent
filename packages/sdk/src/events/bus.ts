// ─────────────────────────────────────────────────────────────────
// @memograph/events — EventBus pub/sub system
// ─────────────────────────────────────────────────────────────────

export type EventHandler = (payload: unknown) => void | Promise<void>;

export type EventName =
  | 'file:changed'
  | 'git:commit'
  | 'git:checkout'
  | 'mcp:installed'
  | 'ci:push'
  | 'ci:pr'
  | 'schedule:tick'
  | 'memory:written'
  | 'index:complete'
  | 'evolution:complete';

const ALL_EVENT_NAMES: EventName[] = [
  'file:changed',
  'git:commit',
  'git:checkout',
  'mcp:installed',
  'ci:push',
  'ci:pr',
  'schedule:tick',
  'memory:written',
  'index:complete',
  'evolution:complete',
];

export function isValidEvent(name: string): name is EventName {
  return ALL_EVENT_NAMES.includes(name as EventName);
}

export function getEventNames(): EventName[] {
  return [...ALL_EVENT_NAMES];
}

/**
 * Lightweight pub/sub event bus.
 *
 * Handlers can be sync or async. Errors from individual handlers are caught
 * and logged but do not prevent other handlers from running.
 */
export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private onceHandlers = new Map<string, Set<EventHandler>>();

  /**
   * Emit an event, calling all registered handlers with the given payload.
   */
  emit(event: string, payload: unknown): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        this.invokeHandler(event, handler, payload);
      }
    }

    const onceSet = this.onceHandlers.get(event);
    if (onceSet) {
      for (const handler of onceSet) {
        this.invokeHandler(event, handler, payload);
      }
      this.onceHandlers.delete(event);
    }
  }

  /**
   * Register a handler for the given event.
   */
  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  /**
   * Remove a previously registered handler.
   */
  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
    this.onceHandlers.get(event)?.delete(handler);
  }

  /**
   * Register a one-time handler that will be removed after being called once.
   */
  once(event: string, handler: EventHandler): void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler);
  }

  /**
   * Remove all handlers for a given event (or all events if no event given).
   */
  clear(event?: string): void {
    if (event) {
      this.handlers.delete(event);
      this.onceHandlers.delete(event);
    } else {
      this.handlers.clear();
      this.onceHandlers.clear();
    }
  }

  /**
   * Return the number of handlers registered for a specific event.
   */
  listenerCount(event: string): number {
    return (this.handlers.get(event)?.size ?? 0) + (this.onceHandlers.get(event)?.size ?? 0);
  }

  private invokeHandler(event: string, handler: EventHandler, payload: unknown): void {
    try {
      const result = handler(payload);
      if (result instanceof Promise) {
        result.catch((err) => {
          console.error(`[EventBus] Handler error for "${event}":`, err);
        });
      }
    } catch (err) {
      console.error(`[EventBus] Handler error for "${event}":`, err);
    }
  }
}
