// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — Agent 生命周期管理
// ─────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type LifecycleState =
  | 'active'
  | 'evaluating'
  | 'mutating'
  | 'competing'
  | 'archived';

// ═══════════════════════════════════════════════════════════════
// Allowed transitions
// ═══════════════════════════════════════════════════════════════

const ALLOWED_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  active: ['evaluating'],
  evaluating: ['mutating', 'competing', 'active', 'archived'],
  mutating: ['active', 'evaluating', 'archived'],
  competing: ['active', 'evaluating', 'archived'],
  archived: ['active'], // Can revive
};

// ═══════════════════════════════════════════════════════════════
// AgentState
// ═══════════════════════════════════════════════════════════════

interface AgentState {
  state: LifecycleState;
  last_transition: number;
  last_evolved?: number;
}

// ═══════════════════════════════════════════════════════════════
// EvolutionLifecycle
// ═══════════════════════════════════════════════════════════════

/**
 * Manages the lifecycle state machine for agents undergoing evolution.
 *
 * States:
 * - active: Normal operation, awaiting evolution cycle
 * - evaluating: Fitness evaluation in progress
 * - mutating: Split/merge/reorganize operations in progress
 * - competing: Competition evaluation in progress
 * - archived: Agent is archived (entries preserved)
 */
export class EvolutionLifecycle {
  /**
   * In-memory state store.
   * Key: agent_id, Value: current state and transition metadata.
   */
  private states: Map<string, AgentState> = new Map();

  /**
   * Transition an agent to a new state, with validation.
   * Throws if the transition is not allowed.
   */
  transition(agentId: string, to: LifecycleState): void {
    const current = this.states.get(agentId);
    const from = current?.state ?? 'active';

    // Always allow transitioning from empty state to any
    if (!current) {
      this.states.set(agentId, {
        state: to,
        last_transition: Date.now(),
      });
      return;
    }

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new Error(
        `Invalid lifecycle transition: "${from}" → "${to}". ` +
        `Allowed transitions from "${from}": [${allowed.join(', ')}]`,
      );
    }

    // Check cooldown for re-entering active state
    if (to === 'active' && current.last_transition > 0) {
      const cooldownMs = 5000; // 5s cooldown to prevent rapid cycling
      const elapsed = Date.now() - current.last_transition;
      if (elapsed < cooldownMs) {
        throw new Error(
          `Cannot transition to "active" yet. Cooldown remaining: ${((cooldownMs - elapsed) / 1000).toFixed(1)}s`,
        );
      }
    }

    this.states.set(agentId, {
      state: to,
      last_transition: Date.now(),
      last_evolved: current.last_evolved,
    });
  }

  /**
   * Check if an agent is eligible for evolution (24h+ since last evolution).
   *
   * @param agentId - Agent to check
   * @param lastEvolved - Timestamp of last evolution
   * @returns true if >= 24 hours have passed
   */
  shouldEvolve(agentId: string, lastEvolved: number): boolean {
    const existing = this.states.get(agentId);
    if (existing?.state === 'archived') return false;

    const twentyFourHours = 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - lastEvolved;
    return elapsed >= twentyFourHours;
  }

  /**
   * Archive an agent: mark as archived while preserving its entries.
   *
   * @param agentId - Agent to archive
   */
  archive(agentId: string): void {
    this.transition(agentId, 'archived');

    const state = this.states.get(agentId);
    if (state) {
      state.last_evolved = Date.now();
    }
  }

  /**
   * Revive an agent from archive, restoring it to active state.
   *
   * @param agentId - Agent to revive
   */
  revive(agentId: string): void {
    const state = this.states.get(agentId);
    if (!state || state.state !== 'archived') {
      throw new Error(
        `Cannot revive agent "${agentId}": agent is not archived (current state: ${state?.state ?? 'unknown'})`,
      );
    }

    this.transition(agentId, 'active');
  }

  /**
   * Get the current lifecycle state of an agent.
   * Returns 'active' for unknown agents.
   *
   * @param agentId - Agent to query
   * @returns Current LifecycleState
   */
  getState(agentId: string): LifecycleState {
    return this.states.get(agentId)?.state ?? 'active';
  }

  /**
   * Get all agents in a given state.
   *
   * @param state - LifecycleState to filter by
   * @returns Array of agent IDs in that state
   */
  getAgentsInState(state: LifecycleState): string[] {
    const result: string[] = [];
    for (const [agentId, agentState] of this.states) {
      if (agentState.state === state) {
        result.push(agentId);
      }
    }
    return result;
  }

  /**
   * Get the timestamp of the last state transition for an agent.
   *
   * @param agentId - Agent to query
   * @returns Unix timestamp of last transition, or 0 if unknown
   */
  getLastTransition(agentId: string): number {
    return this.states.get(agentId)?.last_transition ?? 0;
  }

  /**
   * Remove an agent from the lifecycle tracker entirely.
   *
   * @param agentId - Agent to forget
   */
  forget(agentId: string): void {
    this.states.delete(agentId);
  }
}
