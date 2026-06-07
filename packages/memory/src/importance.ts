// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/memory — ImportanceScorer: Auto importance scoring
// ─────────────────────────────────────────────────────────────────

import type { MemoryEntry } from '@mutimemoagent/core';

/**
 * Auto-score a memory entry's importance based on:
 * - Content length (longer = more substantial)
 * - Memory type (error > preference > fact > event)
 * - Source (dialogue > code > manual > inferred)
 * - Has actionable keywords (记住/重要/关键/必须/配置)
 * - Cross-references (linked to other entries)
 */
export class ImportanceScorer {
  /**
   * Score a single memory entry (0.0 – 1.0).
   */
  score(entry: MemoryEntry): number {
    let score = 0.5; // baseline

    // Content length bonus (0–0.15)
    score += Math.min(entry.content.length / 2000, 1) * 0.15;

    // Memory type bonus
    const typeBonus: Record<string, number> = {
      'error': 0.25,
      'preference': 0.15,
      'procedure': 0.15,
      'code_architecture': 0.15,
      'code_hotspot': 0.1,
      'fact': 0.05,
      'event': 0.05,
    };
    score += typeBonus[entry.memory_type] || 0;

    // Source bonus
    const sourceBonus: Record<string, number> = {
      'dialogue': 0.1,
      'code': 0.05,
      'manual': 0.15,
      'agent': 0.05,
    };
    score += sourceBonus[entry.metadata.source] || 0;

    // Keyword detection (Chinese & English important indicators)
    const importantKeywords = /记住|重要|关键|必须|配置|token|key|密码|password|secret|critical|important|required|todo|fixme|deprecated|breaking/i;
    if (importantKeywords.test(entry.content)) score += 0.1;

    // Cross-reference bonus
    if (entry.metadata.file_refs && entry.metadata.file_refs.length > 0) score += 0.05;
    if (entry.metadata.agent_refs && entry.metadata.agent_refs.length > 0) score += 0.05;

    // Frequently accessed bonus
    if (entry.lifecycle.access_count > 10) score += 0.1;
    if (entry.lifecycle.access_count > 50) score += 0.05;

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Re-score all entries in a batch and return updated copies.
   */
  rescoreAll(entries: MemoryEntry[]): MemoryEntry[] {
    return entries.map(e => ({
      ...e,
      metadata: { ...e.metadata, importance_score: this.score(e) },
    }));
  }
}
