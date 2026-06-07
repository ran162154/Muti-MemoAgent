// ────────────────────────────────────────────────────────────────
// @mutimemoagent/collaboration — Relation Inference
// Rule-based inference engine that discovers cross-agent relations
// by comparing entity sets and memory entries between agents.
// ────────────────────────────────────────────────────────────────

import type { CrossAgentRelation, Entity, MemoryEntry } from '@mutimemoagent/core';
import { CrossAgentGraph } from './cross-agent-graph.js';

let relationCounter = 0;

/** Deterministic ID generation for relations */
function nextRelationId(): string {
  return `rel_${++relationCounter}_${Date.now()}`;
}

/** Group entities by type for quicker lookups. */
function groupByType(entities: Entity[]): Map<Entity['type'], Entity[]> {
  const groups = new Map<Entity['type'], Entity[]>();
  for (const e of entities) {
    const list = groups.get(e.type) ?? [];
    list.push(e);
    groups.set(e.type, list);
  }
  return groups;
}

// ── RelationInference ──────────────────────────────────────

export class RelationInference {
  /**
   * Infer relations between two agents by comparing their entity sets.
   * Returns an array of discovered CrossAgentRelation objects.
   */
  inferRelations(entitiesA: Entity[], entitiesB: Entity[]): CrossAgentRelation[] {
    const now = Date.now();
    const relations: CrossAgentRelation[] = [];
    const groupedA = groupByType(entitiesA);
    const groupedB = groupByType(entitiesB);

    // Determine agent IDs from entities (assumes all entities for an agent
    // share the same agent_id, fall back to 'unknown')
    const agentA = entitiesA.length > 0 ? entitiesA[0].agent_id : 'unknown';
    const agentB = entitiesB.length > 0 ? entitiesB[0].agent_id : 'unknown';
    if (agentA === agentB) return []; // Same agent → no cross-relations

    const nameSetA = new Set(entitiesA.map((e) => e.name.toLowerCase()));
    const nameSetB = new Set(entitiesB.map((e) => e.name.toLowerCase()));

    // ── Rule 1: Same entity name → same_entity ─────────
    for (const nameA of nameSetA) {
      if (nameSetB.has(nameA)) {
        // Find the original casing from either set
        const original =
          entitiesA.find((e) => e.name.toLowerCase() === nameA)?.name ??
          entitiesB.find((e) => e.name.toLowerCase() === nameA)?.name ??
          nameA;
        relations.push({
          id: nextRelationId(),
          source_agent_id: agentA,
          target_agent_id: agentB,
          relation_type: 'same_entity',
          weight: 0.9,
          evidence: [`Both agents mention "${original}"`],
          discovered_at: now,
          discovery_method: 'rule',
        });
      }
    }

    // ── Rule 2: PREFERENCE → TOOL match ───────────────
    // SAFETY: Entity.type is a string union that may include 'PREFERENCE' as a normalized form
    const prefA = groupedA.get('PREFERENCE' as import('@mutimemoagent/core').EntityType) ?? [];
    const prefEntitiesA = entitiesA.filter((e) => e.type === 'PROCESS'); // preferences are stored as PROCESS-ish
    const toolsB = groupedB.get('TOOL') ?? [];
    for (const pref of prefEntitiesA) {
      for (const tool of toolsB) {
        if (
          pref.name.toLowerCase().includes(tool.name.toLowerCase()) ||
          tool.name.toLowerCase().includes(pref.name.toLowerCase())
        ) {
          relations.push({
            id: nextRelationId(),
            source_agent_id: agentA,
            target_agent_id: agentB,
            relation_type: 'preference_implies_usage',
            weight: 0.85,
            evidence: [
              `Agent A has preference "${pref.name}" which relates to Agent B's tool "${tool.name}"`,
            ],
            discovered_at: now,
            discovery_method: 'rule',
          });
        }
      }
    }
    const prefEntitiesB = entitiesB.filter((e) => e.type === 'PROCESS');
    const toolsA = groupedA.get('TOOL') ?? [];
    for (const pref of prefEntitiesB) {
      for (const tool of toolsA) {
        if (
          pref.name.toLowerCase().includes(tool.name.toLowerCase()) ||
          tool.name.toLowerCase().includes(pref.name.toLowerCase())
        ) {
          relations.push({
            id: nextRelationId(),
            source_agent_id: agentA,
            target_agent_id: agentB,
            relation_type: 'preference_implies_usage',
            weight: 0.85,
            evidence: [
              `Agent B has preference "${pref.name}" which relates to Agent A's tool "${tool.name}"`,
            ],
            discovered_at: now,
            discovery_method: 'rule',
          });
        }
      }
    }

    // ── Rule 3: Same TECHNOLOGY → shared_tech_stack ────
    const techA = groupedA.get('TECHNOLOGY') ?? [];
    const techB = groupedB.get('TECHNOLOGY') ?? [];
    const techNamesA = new Set(techA.map((t) => t.name.toLowerCase()));
    for (const tech of techB) {
      if (techNamesA.has(tech.name.toLowerCase())) {
        relations.push({
          id: nextRelationId(),
          source_agent_id: agentA,
          target_agent_id: agentB,
          relation_type: 'shared_tech_stack',
          weight: 0.8,
          evidence: [`Both agents use "${tech.name}"`],
          discovered_at: now,
          discovery_method: 'rule',
        });
      }
    }

    // ── Rule 4: Same CONCEPT → shared_concept ─────────
    const conceptA = groupedA.get('CONCEPT') ?? [];
    const conceptB = groupedB.get('CONCEPT') ?? [];
    const conceptNamesA = new Set(conceptA.map((c) => c.name.toLowerCase()));
    for (const concept of conceptB) {
      if (conceptNamesA.has(concept.name.toLowerCase())) {
        relations.push({
          id: nextRelationId(),
          source_agent_id: agentA,
          target_agent_id: agentB,
          relation_type: 'shared_concept',
          weight: 0.75,
          evidence: [`Both agents work on "${concept.name}"`],
          discovered_at: now,
          discovery_method: 'rule',
        });
      }
    }

    // ── Rule 5: Same PROJECT → project_reference ──────
    const projA = entitiesA.filter((e) => e.type === 'PROJECT');
    const projB = entitiesB.filter((e) => e.type === 'PROJECT');
    const projNamesA = new Set(projA.map((p) => p.name.toLowerCase()));
    for (const proj of projB) {
      if (projNamesA.has(proj.name.toLowerCase())) {
        relations.push({
          id: nextRelationId(),
          source_agent_id: agentA,
          target_agent_id: agentB,
          relation_type: 'project_reference',
          weight: 0.7,
          evidence: [`Both agents reference project "${proj.name}"`],
          discovered_at: now,
          discovery_method: 'rule',
        });
      }
    }

    return relations;
  }

  /**
   * Infer relations from MemoryEntry types rather than entity content.
   * This provides a complementary signal — agents with similar memory
   * profiles may benefit from collaboration.
   */
  inferFromMemoryTypes(
    entriesA: MemoryEntry[],
    entriesB: MemoryEntry[],
  ): CrossAgentRelation[] {
    const now = Date.now();
    if (entriesA.length === 0 || entriesB.length === 0) return [];

    const agentA = entriesA[0].agent_id;
    const agentB = entriesB[0].agent_id;
    if (agentA === agentB) return [];

    // Build type frequency maps
    const typeCountA = new Map<string, number>();
    const typeCountB = new Map<string, number>();

    for (const e of entriesA) {
      typeCountA.set(e.memory_type, (typeCountA.get(e.memory_type) ?? 0) + 1);
    }
    for (const e of entriesB) {
      typeCountB.set(e.memory_type, (typeCountB.get(e.memory_type) ?? 0) + 1);
    }

    // Compute Jaccard similarity on memory types
    const allTypes = new Set([...typeCountA.keys(), ...typeCountB.keys()]);
    let intersection = 0;
    let union = 0;

    for (const t of allTypes) {
      const ca = typeCountA.get(t) ?? 0;
      const cb = typeCountB.get(t) ?? 0;
      if (ca > 0 && cb > 0) intersection += Math.min(ca, cb);
      union += Math.max(ca, cb);
    }

    const jaccard = union > 0 ? intersection / union : 0;

    const relations: CrossAgentRelation[] = [];

    if (jaccard > 0.3) {
      relations.push({
        id: nextRelationId(),
        source_agent_id: agentA,
        target_agent_id: agentB,
        relation_type: 'similar_memory_profile',
        weight: Math.round(jaccard * 100) / 100,
        evidence: [
          `Memory type Jaccard similarity: ${jaccard.toFixed(3)}`,
        ],
        discovered_at: now,
        discovery_method: 'rule',
      });
    }

    // Tag overlap signal
    const tagsA = new Set(entriesA.flatMap((e) => e.metadata.tags));
    const tagsB = new Set(entriesB.flatMap((e) => e.metadata.tags));
    const tagIntersection = [...tagsA].filter((t) => tagsB.has(t));
    if (tagIntersection.length >= 3) {
      relations.push({
        id: nextRelationId(),
        source_agent_id: agentA,
        target_agent_id: agentB,
        relation_type: 'shared_tag_space',
        weight: 0.65,
        evidence: [
          `Shared tags: ${tagIntersection.slice(0, 5).join(', ')}${tagIntersection.length > 5 ? '...' : ''}`,
        ],
        discovered_at: now,
        discovery_method: 'rule',
      });
    }

    return relations;
  }

  /**
   * Merge new relations into the graph with deduplication.
   * If a relation between the same agent pair with the same type
   * already exists, keep the one with higher weight.
   */
  mergeWithGraph(
    graph: CrossAgentGraph,
    newRelations: CrossAgentRelation[],
  ): void {
    for (const newRel of newRelations) {
      // Check if an existing relation covers the same pair+type
      const existing = graph.getRelations(newRel.source_agent_id).filter(
        (r) =>
          r.target_agent_id === newRel.target_agent_id &&
          r.relation_type === newRel.relation_type,
      );
      const existingRel = existing.length > 0 ? existing[0] : null;

      if (existingRel) {
        // Keep the higher weight; merge evidence
        if (newRel.weight > existingRel.weight) {
          existingRel.weight = newRel.weight;
          existingRel.discovered_at = newRel.discovered_at;
          existingRel.discovery_method = newRel.discovery_method;
        }
        // Merge evidence arrays
        const evidenceSet = new Set([
          ...existingRel.evidence,
          ...newRel.evidence,
        ]);
        existingRel.evidence = [...evidenceSet];
      } else {
        graph.addRelation(newRel);
      }
    }
  }

  /**
   * Calculate a weighted Jaccard similarity between two entity sets.
   * Returns a score in [0, 1].
   */
  calculateRelationWeight(entitiesA: Entity[], entitiesB: Entity[]): number {
    const setA = new Map<string, number>();
    const setB = new Map<string, number>();

    for (const e of entitiesA) {
      const key = `${e.name.toLowerCase()}::${e.type}`;
      setA.set(key, e.occurrences);
    }
    for (const e of entitiesB) {
      const key = `${e.name.toLowerCase()}::${e.type}`;
      setB.set(key, e.occurrences);
    }

    const allKeys = new Set([...setA.keys(), ...setB.keys()]);
    let intersection = 0;
    let union = 0;

    for (const key of allKeys) {
      const va = setA.get(key) ?? 0;
      const vb = setB.get(key) ?? 0;
      intersection += Math.min(va, vb);
      union += Math.max(va, vb);
    }

    if (union === 0) return 0;

    // Weighted — sqrt on intersection to dampen large counts
    return Math.sqrt(intersection) / Math.sqrt(union);
  }
}
