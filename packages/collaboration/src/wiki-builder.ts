// ────────────────────────────────────────────────────────────────
// @mutimemoagent/collaboration — Wiki Builder
// Generates a cross-referenceable markdown wiki from agent memory
// entries, with wiki-links for shared entities.
// ────────────────────────────────────────────────────────────────

import type { MemoryEntry } from '@mutimemoagent/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ── Types ──────────────────────────────────────────────────

export interface WikiResult {
  /** Content for the root index.md */
  indexContent: string;
  /** Map of agent-id → markdown page content */
  agentPages: Map<string, string>;
  /** Cross-reference notes (e.g., "Agent X mentions 'React' also in Agent Y") */
  crossRefs: string[];
}

interface AgentData {
  agentId: string;
  name: string;
  entries: MemoryEntry[];
  tags: string[];
}

// ── WikiBuilder ────────────────────────────────────────────

export class WikiBuilder {
  /**
   * Build a complete wiki structure from agent data.
   *
   * 1. Organise entries by memory_type into markdown sections.
   * 2. Add [[wiki-links]] between entries that share entity names.
   * 3. Generate an index page with agent summaries.
   * 4. Generate cross-reference sections.
   */
  buildWiki(agentsData: AgentData[]): WikiResult {
    const agentPages = new Map<string, string>();
    const allCrossRefs: string[] = [];
    const summaries: string[] = [];

    // Build a map of entity names → set of agent IDs that mention them
    const entityAgents = this.buildEntityAgentMap(agentsData);

    for (const agent of agentsData) {
      const pageContent = this.buildAgentPage(agent, entityAgents);
      agentPages.set(agent.agentId, pageContent.content);

      allCrossRefs.push(...pageContent.crossRefs);

      summaries.push(
        `- **${agent.name}** (\`${agent.agentId}\`) — ` +
          `${agent.entries.length} entries, ` +
          `${agent.tags.length} tags`,
      );
    }

    // Index
    const indexContent = [
      `# Multi-MemoAgent Wiki\n`,
      `> Auto-generated wiki from agent memory entries.\n`,
      `**Generated:** ${new Date().toISOString()}\n`,
      `**Agents:** ${agentsData.length}\n`,
      `**Total entries:** ${agentsData.reduce((s, a) => s + a.entries.length, 0)}\n`,
      `---\n`,
      `## Agents\n`,
      ...summaries,
      ``,
      `---\n`,
      `## Cross-References\n`,
      ...(allCrossRefs.length > 0
        ? allCrossRefs.map((r) => `- ${r}`)
        : ['_No cross-references found._']),
      ``,
      `---\n`,
      `## Entity Index\n`,
      ...this.buildEntityIndex(entityAgents),
    ].join('\n');

    return {
      indexContent,
      agentPages,
      crossRefs: allCrossRefs,
    };
  }

  /**
   * Write the wiki to disk as markdown files.
   * Structure:
   *   outputDir/
   *     index.md
   *     agents/
   *       {agentId}.md
   */
  async writeWiki(wiki: WikiResult, outputDir: string): Promise<void> {
    const agentsDir = path.join(outputDir, 'agents');
    await fs.mkdir(agentsDir, { recursive: true });

    // Write index
    await fs.writeFile(
      path.join(outputDir, 'index.md'),
      wiki.indexContent,
      'utf-8',
    );

    // Write agent pages
    for (const [agentId, content] of wiki.agentPages) {
      await fs.writeFile(
        path.join(agentsDir, `${agentId}.md`),
        content,
        'utf-8',
      );
    }
  }

  /**
   * Remove all previously generated wiki files from outputDir.
   */
  async cleanWiki(outputDir: string): Promise<void> {
    const agentsDir = path.join(outputDir, 'agents');

    try {
      await fs.rm(agentsDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist — it's fine
    }

    try {
      await fs.rm(path.join(outputDir, 'index.md'), { force: true });
    } catch {
      // May not exist
    }
  }

  // ── Private ───────────────────────────────────────────────

  /**
   * For each entity name, collect all agent IDs that reference it.
   */
  private buildEntityAgentMap(
    agentsData: AgentData[],
  ): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();

    for (const agent of agentsData) {
      for (const entry of agent.entries) {
        // Extract "entity-like" words from content
        const words = this.extractWikiWords(entry.content);
        for (const word of words) {
          const lower = word.toLowerCase();
          if (!map.has(lower)) map.set(lower, new Set());
          map.get(lower)!.add(agent.agentId);
        }
      }
    }

    return map;
  }

  /**
   * Extract wiki-linkable words from text: CamelCase + @scoped/packages.
   */
  private extractWikiWords(text: string): string[] {
    const words: string[] = [];

    // CamelCase words (potential entity names)
    const camelMatch = text.match(/\b[A-Z][a-z]+[A-Z][A-Za-z0-9]*\b/g);
    if (camelMatch) words.push(...camelMatch);

    // Scoped packages
    const scopedMatch = text.match(/@[a-z0-9_]+\/[a-z0-9._-]+/gi);
    if (scopedMatch) words.push(...scopedMatch);

    // Uppercase acronyms
    const acronymMatch = text.match(/\b[A-Z]{2,}\b/g);
    if (acronymMatch) words.push(...acronymMatch);

    return [...new Set(words)];
  }

  /**
   * Build the markdown page for a single agent.
   */
  private buildAgentPage(
    agent: AgentData,
    entityAgents: Map<string, Set<string>>,
  ): { content: string; crossRefs: string[] } {
    const crossRefs: string[] = [];
    const sections = new Map<string, string[]>();

    // Group entries by memory_type
    for (const entry of agent.entries) {
      const type = entry.memory_type;
      const section = sections.get(type) ?? [];
      section.push(this.formatEntry(entry, agent.agentId, entityAgents, crossRefs));
      sections.set(type, section);
    }

    const lines: string[] = [
      `# ${agent.name}\n`,
      `> Agent ID: \`${agent.agentId}\`\n`,
      `- Tags: ${agent.tags.map((t) => `\`${t}\``).join(', ') || '_none_'}`,
      `- Total entries: ${agent.entries.length}`,
      ``,
      `---\n`,
    ];

    // Emit sections in a canonical order
    const sectionOrder = [
      'fact', 'preference', 'procedure', 'event', 'error',
      'insight', 'code_file', 'code_symbol', 'code_dependency',
      'code_architecture', 'code_hotspot',
      'mcp_registry', 'mcp_tool', 'mcp_example',
      'cross_agent_relation', 'conflict_flag', 'merge_result',
    ];

    for (const type of sectionOrder) {
      const items = sections.get(type);
      if (!items || items.length === 0) continue;
      lines.push(`## ${type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}\n`);
      lines.push(...items.map((item) => `${item}\n`));
    }

    // Any remaining types not in canonical order
    for (const [type, items] of sections) {
      if (sectionOrder.includes(type)) continue;
      lines.push(`## ${type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}\n`);
      lines.push(...items.map((item) => `${item}\n`));
    }

    return { content: lines.join('\n'), crossRefs };
  }

  /**
   * Format a single memory entry as markdown.
   * Injects [[wiki-links]] for entity names that appear in other agents.
   */
  private formatEntry(
    entry: MemoryEntry,
    currentAgentId: string,
    entityAgents: Map<string, Set<string>>,
    crossRefs: string[],
  ): string {
    let content = entry.content;

    // Replace entity names with wiki-links if they appear in >1 agent
    const words = this.extractWikiWords(content);
    for (const word of words) {
      const lower = word.toLowerCase();
      const agents = entityAgents.get(lower);
      if (agents && agents.size > 1) {
        // Create wiki-link: [[word]]
        // But only if not already a wiki-link
        content = content.replace(
          new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'g'),
          `[[${word}]]`,
        );

        // Track cross-reference
        const otherAgents = [...agents].filter((a) => a !== currentAgentId);
        crossRefs.push(
          `Agent \`${currentAgentId}\` mentions "${word}" — also in: ` +
            otherAgents.map((a) => `\`${a}\``).join(', '),
        );
      }
    }

    // Build metadata line
    const metaParts: string[] = [
      `_confidence: ${entry.metadata.confidence}_`,
      `_source: ${entry.metadata.source}_`,
      `_stage: ${entry.lifecycle.stage}_`,
    ];

    if (entry.metadata.tags.length > 0) {
      metaParts.push(`tags: ${entry.metadata.tags.map((t) => `\`${t}\``).join(' ')}`);
    }

    return [
      `- **ID:** \`${entry.id}\``,
      `  ${content}`,
      `  ${metaParts.join(' · ')}`,
    ].join('\n');
  }

  /**
   * Build an entity index section listing every entity and which
   * agents mention it.
   */
  private buildEntityIndex(
    entityAgents: Map<string, Set<string>>,
  ): string[] {
    const lines: string[] = [];

    // Sort by number of referencing agents (most cross-ref first)
    const sorted = [...entityAgents.entries()]
      .filter(([_, agents]) => agents.size > 1)
      .sort((a, b) => b[1].size - a[1].size);

    for (const [entity, agents] of sorted) {
      lines.push(
        `- **${entity}** — ${[...agents].map((a) => `\`${a}\``).join(', ')}`,
      );
    }

    if (sorted.length === 0) {
      lines.push('_No shared entities found._');
    }

    return lines;
  }

  /**
   * Escape special regex characters from a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
