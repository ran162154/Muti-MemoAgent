// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — Agent 竞争评估
// ─────────────────────────────────────────────────────────────────

import type { SearchResult } from '@mutimemoagent/core';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface CompetitionResult {
  scores: Map<string, number>;
  ranked: Array<{ agent_id: string; score: number }>;
  winner: string;
  recommendation: string;
}

// ═══════════════════════════════════════════════════════════════
// AgentCompetition
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluates multiple agents against each other by running
 * the same set of test queries and comparing results.
 *
 * The competition helps determine which agents perform best
 * on a given domain, informing decisions about which to keep,
 * merge, or archive.
 */
export class AgentCompetition {
  /**
   * Run a competition among agents.
   *
   * @param agents - Array of agent contestants, each with an id and search function
   * @param testQueries - Array of queries to test all agents on
   * @returns CompetitionResult with scores, rankings, and recommendations
   */
  async compete(
    agents: Array<{
      id: string;
      searchFn: (query: string) => Promise<SearchResult[]>;
    }>,
    testQueries: string[],
  ): Promise<CompetitionResult> {
    const scores = new Map<string, number>();

    // Each agent answers all test queries
    for (const agent of agents) {
      let totalScore = 0;

      for (const query of testQueries) {
        try {
          const results = await agent.searchFn(query);
          const queryScore = await this.evaluateResponse(query, results);
          totalScore += queryScore;
        } catch {
          // If an agent fails to respond, score 0 for this query
          totalScore += 0;
        }
      }

      scores.set(agent.id, totalScore / testQueries.length);
    }

    // Rank agents by score
    const ranked = Array.from(scores.entries())
      .map(([agent_id, score]) => ({ agent_id, score }))
      .sort((a, b) => b.score - a.score);

    const winner = this.getWinner({ scores, ranked, winner: '', recommendation: '' });

    return {
      scores,
      ranked,
      winner,
      recommendation: this.getRecommendation({ scores, ranked, winner, recommendation: '' }),
    };
  }

  /**
   * Evaluate the quality of a search response for a given query.
   * Score 0–1 based on:
   * - Result count (not empty)
   * - Top result relevance
   * - Diversity of results
   */
  async evaluateResponse(
    query: string,
    result: SearchResult[],
  ): Promise<number> {
    if (result.length === 0) return 0;

    // Result count score: more results is generally better, capped at 10
    const countScore = Math.min(1, result.length / 10);

    // Top result relevance: highest score among results
    const topScore = result[0]?.score ?? 0;
    const relevanceScore = topScore;

    // Diversity: different match types
    const matchTypes = new Set(result.map((r) => r.match_type));
    const diversityScore = Math.min(1, matchTypes.size / 3);

    const total = countScore * 0.3 + relevanceScore * 0.5 + diversityScore * 0.2;
    return Math.round(total * 100) / 100;
  }

  /**
   * Determine the winner — agent with the highest total score.
   */
  getWinner(result: CompetitionResult): string {
    if (result.ranked.length === 0) return '';
    return result.ranked[0].agent_id;
  }

  /**
   * Generate a recommendation based on competition results.
   * If the winner is >30% ahead of the runner-up, recommend archiving
   * the lowest-performing agents.
   */
  getRecommendation(result: CompetitionResult): string {
    if (result.ranked.length < 2) {
      return 'Not enough agents to make meaningful comparisons.';
    }

    const winner = result.ranked[0];
    const runnerUp = result.ranked[1];
    const last = result.ranked[result.ranked.length - 1];

    const gap = winner.score - runnerUp.score;

    if (gap > 0.3 && result.ranked.length > 2) {
      return `Winner "${winner.agent_id}" outperforms runner-up by ${(gap * 100).toFixed(0)}%. Consider archiving "${last.agent_id}" (score: ${(last.score * 100).toFixed(0)}%).`;
    }

    if (gap > 0.15) {
      return `"${winner.agent_id}" leads with ${(winner.score * 100).toFixed(0)}%. Performance gap is moderate; monitor over next cycle.`;
    }

    return `Agents are closely matched (winner: ${(winner.score * 100).toFixed(0)}%, runner-up: ${(runnerUp.score * 100).toFixed(0)}%). All agents performing acceptably.`;
  }
}
