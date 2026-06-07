// ────────────────────────────────────────────────────────────────
// @mutimemoagent/collaboration — Discovery Engine
// Main orchestrator for cross-agent discovery. Coordinates NER,
// relation inference, multi-hop reasoning, and Xiami persistence.
// ────────────────────────────────────────────────────────────────

import type { CrossAgentRelation, Entity, MemoryEntry, SearchResult } from '@mutimemoagent/core';
import { XiamiClient } from '@mutimemoagent/persist';
import { CrossAgentGraph } from './cross-agent-graph.js';
import { NamedEntityRecognizer } from './ner.js';
import { RelationInference } from './relation-inference.js';
import { MultiHopReasoner } from './multi-hop.js';

// ── Types ──────────────────────────────────────────────────

export interface DiscoveryReport {
  timestamp: number;
  agents_processed: number;
  entities_found: number;
  direct_relations: number;
  inferred_relations: number;
  new_relations: CrossAgentRelation[];
  summary: string;
}

// ── DiscoveryEngine ────────────────────────────────────────

export class DiscoveryEngine {
  private readonly ner: NamedEntityRecognizer;
  private readonly inference: RelationInference;
  private readonly reasoner: MultiHopReasoner;

  constructor() {
    this.ner = new NamedEntityRecognizer();
    this.inference = new RelationInference();
    this.reasoner = new MultiHopReasoner();
  }

  /**
   * Run the full discovery pipeline:
   *
   * 1. Fetch all entries from all agents (via cross-agent search)
   * 2. Run NER on each agent's content
   * 3. Run RelationInference between all agent pairs
   * 4. Run MultiHopReasoner for transitive relations
   * 5. Write all new relations to Xiami via client.writeBatch
   * 6. Update the CrossAgentGraph
   * 7. Generate and return a DiscoveryReport
   */
  async run(
    client: XiamiClient,
    graph: CrossAgentGraph,
  ): Promise<DiscoveryReport> {
    const timestamp = Date.now();

    // ── Step 1: Fetch all entries from all agents ─────────
    // Use cross-agent search with a broad query to pull as much as possible
    const allResults = await client.searchCrossAgent('*');
    const allEntries = allResults.map((r: SearchResult) => r.entry);

    // Group entries by agent_id
    const agentEntries = new Map<string, MemoryEntry[]>();
    for (const entry of allEntries) {
      const list = agentEntries.get(entry.agent_id) ?? [];
      list.push(entry);
      agentEntries.set(entry.agent_id, list);
    }

    const agentIds = [...agentEntries.keys()];
    const entitiesByAgent = new Map<string, Entity[]>();
    let totalEntities = 0;

    // ── Step 2: NER on each agent's content ──────────────
    for (const [agentId, entries] of agentEntries) {
      const texts = entries.map((e) => e.content);
      const entities = this.ner.extractFromBatch(texts);

      // Assign agent_id to each entity
      for (const e of entities) {
        e.agent_id = agentId;
      }

      const merged = this.ner.mergeEntities(entities);
      entitiesByAgent.set(agentId, merged);
      totalEntities += merged.length;
    }

    // ── Step 3: RelationInference between all pairs ──────
    const directRelations: CrossAgentRelation[] = [];
    const processedPairs = new Set<string>();

    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const aId = agentIds[i];
        const bId = agentIds[j];
        const pairKey = `${aId}::${bId}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const entitiesA = entitiesByAgent.get(aId) ?? [];
        const entitiesB = entitiesByAgent.get(bId) ?? [];
        const entriesA = agentEntries.get(aId) ?? [];
        const entriesB = agentEntries.get(bId) ?? [];

        // Entity-based inference
        const entityRelations = this.inference.inferRelations(entitiesA, entitiesB);
        directRelations.push(...entityRelations);

        // Memory-type-based inference
        const typeRelations = this.inference.inferFromMemoryTypes(entriesA, entriesB);
        directRelations.push(...typeRelations);
      }
    }

    // ── Step 4: Multi-hop reasoning ──────────────────────
    // Build a temporary graph with direct relations for reasoning
    const tempGraph = new CrossAgentGraph();
    for (const rel of directRelations) {
      tempGraph.addRelation(rel);
    }

    const inferredRelations: CrossAgentRelation[] = [];
    for (const agentId of agentIds) {
      const inferred = this.reasoner.reason(tempGraph, agentId, 3);
      inferredRelations.push(...inferred);
    }

    // Validate inferred relations against actual entries
    const validatedInferred: CrossAgentRelation[] = [];
    for (const rel of inferredRelations) {
      const boost = this.reasoner.validateInferredRelation(rel, allEntries);
      if (boost > 0) {
        rel.weight = Math.min(1, rel.weight + boost);
        rel.evidence.push(`Validated: weight boosted by ${boost.toFixed(2)}`);
      }
      validatedInferred.push(rel);
    }

    const allNewRelations = [...directRelations, ...validatedInferred];

    // ── Step 5: Write new relations to Xiami ─────────────
    if (allNewRelations.length > 0) {
      const writeInputs = allNewRelations.map((rel) => ({
        agent_id: rel.source_agent_id,
        content: JSON.stringify(rel),
        memory_type: 'cross_agent_relation' as const,
        metadata: {
          target_agent_id: rel.target_agent_id,
          relation_type: rel.relation_type,
          weight: rel.weight,
          discovered_at: rel.discovered_at,
          discovery_method: rel.discovery_method,
        },
      }));

      // Write in batches of 100
      for (let i = 0; i < writeInputs.length; i += 100) {
        const batch = writeInputs.slice(i, i + 100);
        try {
          await client.writeBatch(batch);
        } catch {
          // Continue even if writing fails — graph is still updated in-memory
        }
      }
    }

    // ── Step 6: Update the graph ──────────────────────────
    for (const rel of allNewRelations) {
      graph.addRelation(rel);
    }

    // ── Step 7: Generate report ───────────────────────────
    const summary = this.generateSummary({
      timestamp,
      agents_processed: agentIds.length,
      entities_found: totalEntities,
      direct_relations: directRelations.length,
      inferred_relations: validatedInferred.length,
      new_relations: allNewRelations,
      summary: '',
    });

    return {
      timestamp,
      agents_processed: agentIds.length,
      entities_found: totalEntities,
      direct_relations: directRelations.length,
      inferred_relations: validatedInferred.length,
      new_relations: allNewRelations,
      summary,
    };
  }

  /**
   * Generate a natural-language summary of the discovery results.
   */
  generateSummary(report: DiscoveryReport): string {
    const lines: string[] = [];
    const date = new Date(report.timestamp).toISOString();

    lines.push(`# Discovery Run — ${date}`);
    lines.push('');
    lines.push(`**Agents processed:** ${report.agents_processed}`);
    lines.push(`**Entities found:** ${report.entities_found}`);
    lines.push(`**Direct relations discovered:** ${report.direct_relations}`);
    lines.push(`**Inferred relations (multi-hop):** ${report.inferred_relations}`);
    lines.push(`**Total new relations:** ${report.new_relations.length}`);
    lines.push('');

    if (report.new_relations.length > 0) {
      // Count by relation type
      const typeCount = new Map<string, number>();
      for (const rel of report.new_relations) {
        typeCount.set(rel.relation_type, (typeCount.get(rel.relation_type) ?? 0) + 1);
      }

      lines.push('### Relation Types');
      for (const [type, count] of typeCount) {
        lines.push(`- **${type}**: ${count}`);
      }
      lines.push('');

      // Top relations by weight
      const sorted = [...report.new_relations].sort((a, b) => b.weight - a.weight);
      lines.push('### Strongest Relations (top 5)');
      for (const rel of sorted.slice(0, 5)) {
        lines.push(
          `- \`${rel.source_agent_id}\` → \`${rel.target_agent_id}\` ` +
            `[${rel.relation_type}] weight=${rel.weight.toFixed(2)} ` +
            `(${rel.discovery_method})`,
        );
      }
    } else {
      lines.push('No new relations were discovered in this run.');
    }

    return lines.join('\n');
  }

  /**
   * Schedule periodic discovery.
   * Returns a NodeJS.Timeout that can be cleared with clearInterval().
   */
  scheduleDiscovery(
    client: XiamiClient,
    graph: CrossAgentGraph,
    intervalHours: number = 6,
  ): NodeJS.Timeout {
    const intervalMs = intervalHours * 60 * 60 * 1000;

    // Run immediately
    this.run(client, graph).catch((err) => {
      console.error('[DiscoveryEngine] Initial run failed:', err);
    });

    // Then schedule
    return setInterval(() => {
      this.run(client, graph).catch((err) => {
        console.error('[DiscoveryEngine] Scheduled run failed:', err);
      });
    }, intervalMs);
  }
}
