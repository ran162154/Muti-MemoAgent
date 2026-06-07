// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/evolution — 知识合并器
// ─────────────────────────────────────────────────────────────────

import type { MemoryEntry } from '@mutimemoagent/core';

// ═══════════════════════════════════════════════════════════════
// KnowledgeMerger
// ═══════════════════════════════════════════════════════════════

/**
 * Consolidates, deduplicates, and merges related memory entries
 * into coherent single entries to reduce redundancy and improve
 * knowledge density.
 */
export class KnowledgeMerger {
  /**
   * Merge a cluster of related entries into a single consolidated entry.
   * The first entry is used as the base; its content is replaced with
   * the merged summary, and it inherits relations from all merged entries.
   */
  merge(entries: MemoryEntry[]): MemoryEntry {
    if (entries.length === 0) {
      throw new Error('Cannot merge empty entry list');
    }
    if (entries.length === 1) {
      return entries[0];
    }

    // Sort by creation time (oldest first) to preserve narrative order
    const sorted = [...entries].sort(
      (a, b) => a.lifecycle.created_at - b.lifecycle.created_at,
    );

    const base = { ...sorted[0] };

    // Merge content
    base.content = this.generateMergeContent(sorted);

    // Merge tags
    const mergedTags = new Set(base.metadata.tags);
    for (let i = 1; i < sorted.length; i++) {
      for (const tag of sorted[i].metadata.tags) {
        mergedTags.add(tag);
      }
    }
    base.metadata.tags = Array.from(mergedTags);

    // Merge agent_refs
    const mergedAgentRefs = new Set(base.metadata.agent_refs ?? []);
    for (let i = 1; i < sorted.length; i++) {
      for (const ref of sorted[i].metadata.agent_refs ?? []) {
        mergedAgentRefs.add(ref);
      }
    }
    base.metadata.agent_refs = Array.from(mergedAgentRefs);

    // Merge file_refs
    const mergedFileRefs = new Set(base.metadata.file_refs ?? []);
    for (let i = 1; i < sorted.length; i++) {
      for (const ref of sorted[i].metadata.file_refs ?? []) {
        mergedFileRefs.add(ref);
      }
    }
    base.metadata.file_refs = Array.from(mergedFileRefs);

    // Merge relations
    const mergedFrom = new Set(base.relations.merged_from);
    for (let i = 1; i < sorted.length; i++) {
      mergedFrom.add(sorted[i].id);
      for (const mf of sorted[i].relations.merged_from) {
        mergedFrom.add(mf);
      }
    }
    base.relations.merged_from = Array.from(mergedFrom);

    // Child IDs: include all non-base IDs
    const childIds = new Set(base.relations.child_ids);
    for (let i = 1; i < sorted.length; i++) {
      childIds.add(sorted[i].id);
      for (const cid of sorted[i].relations.child_ids) {
        childIds.add(cid);
      }
    }
    base.relations.child_ids = Array.from(childIds);

    // Conflicts: union all
    const conflicts = new Set(base.relations.conflicts_with);
    for (let i = 1; i < sorted.length; i++) {
      for (const c of sorted[i].relations.conflicts_with) {
        conflicts.add(c);
      }
    }
    base.relations.conflicts_with = Array.from(conflicts);

    // Confidence: take the max
    base.metadata.confidence = Math.max(
      ...entries.map((e) => e.metadata.confidence),
    );

    // Importance: average of all
    base.metadata.importance_score =
      entries.reduce((sum, e) => sum + e.metadata.importance_score, 0) /
      entries.length;

    // Evolution
    base.evolution.version += 1;
    base.evolution.changelog.push({
      timestamp: Date.now(),
      type: 'merge',
      reason: `Merged ${entries.length} entries: ${entries.map((e) => e.id).join(', ')}`,
      agent_id: base.agent_id,
    });

    return base;
  }

  /**
   * Find groups of entries that are candidates for merging.
   * Clusters by: same entity name (via tags), same memory_type,
   * or cosine similarity between content.
   */
  findMergeCandidates(entries: MemoryEntry[]): MemoryEntry[][] {
    const clusters: MemoryEntry[][] = [];
    const used = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      if (used.has(entries[i].id)) continue;

      const cluster: MemoryEntry[] = [entries[i]];
      used.add(entries[i].id);

      for (let j = i + 1; j < entries.length; j++) {
        if (used.has(entries[j].id)) continue;

        if (this.isRelated(entries[i], entries[j])) {
          cluster.push(entries[j]);
          used.add(entries[j].id);
        }
      }

      if (cluster.length >= 2) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Generate a merged content string from a cluster of entries.
   * Concatenates unique information into a single coherent paragraph.
   */
  generateMergeContent(cluster: MemoryEntry[]): string {
    if (cluster.length === 0) return '';
    if (cluster.length === 1) return cluster[0].content;

    // Extract unique content snippets
    const seen = new Set<string>();
    const parts: string[] = [];

    for (const entry of cluster) {
      const normalized = entry.content.trim().toLowerCase();
      // Only add content that's not a near-duplicate
      let isDuplicate = false;
      for (const existing of seen) {
        if (this.similarity(normalized, existing) > 0.85) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        seen.add(normalized);
        parts.push(entry.content.trim());
      }
    }

    if (parts.length === 0) return cluster[0].content;

    // Join with semantic connectors
    return parts.join('\n\n---\n\n');
  }

  /**
   * Remove exact and near-duplicate entries.
   * Uses content hash for exact dedup, then fuzzy similarity.
   */
  deduplicate(entries: MemoryEntry[]): MemoryEntry[] {
    const result: MemoryEntry[] = [];
    const contentHashes = new Set<string>();

    for (const entry of entries) {
      // Exact dedup via content hash
      const hash = this.simpleHash(entry.content);
      if (contentHashes.has(hash)) continue;
      contentHashes.add(hash);

      // Near-duplicate check against already-accepted entries
      let isNearDuplicate = false;
      for (const accepted of result) {
        if (this.similarity(entry.content, accepted.content) > 0.9) {
          isNearDuplicate = true;
          break;
        }
      }

      if (!isNearDuplicate) {
        result.push(entry);
      }
    }

    return result;
  }

  // ── Private helpers ────────────────────────────────────────

  /**
   * Check if two entries are related enough to merge.
   */
  private isRelated(a: MemoryEntry, b: MemoryEntry): boolean {
    // Same memory type
    if (a.memory_type === b.memory_type) {
      // Same entity tags
      const aTags = new Set(a.metadata.tags);
      const bTags = new Set(b.metadata.tags);
      let tagIntersection = 0;
      for (const tag of aTags) {
        if (bTags.has(tag)) tagIntersection++;
      }
      const jaccard = tagIntersection / Math.max(1, aTags.size + bTags.size - tagIntersection);

      if (jaccard > 0.8) return true;
    }

    // Content similarity
    const sim = this.similarity(a.content, b.content);
    return sim > 0.8;
  }

  /**
   * Simple cosine similarity between two strings (character trigram based).
   */
  private similarity(a: string, b: string): number {
    const trigrams = (s: string): Map<string, number> => {
      const map = new Map<string, number>();
      const normalized = s.toLowerCase().replace(/\s+/g, ' ');
      for (let i = 0; i < normalized.length - 2; i++) {
        const tri = normalized.slice(i, i + 3);
        map.set(tri, (map.get(tri) ?? 0) + 1);
      }
      return map;
    };

    const aTri = trigrams(a);
    const bTri = trigrams(b);

    if (aTri.size === 0 && bTri.size === 0) return 1;
    if (aTri.size === 0 || bTri.size === 0) return 0;

    let dotProduct = 0;
    let aMag = 0;
    let bMag = 0;

    for (const [tri, count] of aTri) {
      aMag += count * count;
      const bCount = bTri.get(tri) ?? 0;
      dotProduct += count * bCount;
    }

    for (const [, count] of bTri) {
      bMag += count * count;
    }

    const magnitude = Math.sqrt(aMag) * Math.sqrt(bMag);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  /**
   * Simple hash for content deduplication.
   */
  private simpleHash(content: string): string {
    let hash = 5381;
    const normalized = content.trim().toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}
