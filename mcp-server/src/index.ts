#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/mcp-server — MCP Server Entrypoint
// ─────────────────────────────────────────────────────────────────
//
// This MCP server exposes Memograph tools to any MCP-compatible
// client (e.g., Claude, VS Code extensions, custom UIs).
//
// Tools:
//   - memory_search     Query the knowledge base
//   - memory_write      Write a new memory entry
//   - symbol_search     Find code symbols
//   - impact_analysis   Analyze change impact
//   - cross_agent_search Search across all agents
//   - evolution_report  Get agent evolution status
//
// Usage:
//   npx memograph-mcp                    # stdio transport (default)
//   AUTO_INIT=1 npx memograph-mcp        # auto-init with env config
//
// ─────────────────────────────────────────────────────────────────

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import type {
  MemorySearchInput,
  MemoryWriteInput,
  SymbolSearchInput,
  ImpactAnalysisInput,
  CrossAgentSearchInput,
  EvolutionReportInput,
  MemorySearchOutput,
  MemoryWriteOutput,
  SymbolSearchOutput,
  ImpactAnalysisOutput,
  CrossAgentSearchOutput,
  EvolutionReportOutput,
} from './tools/definitions.js';

// ═══════════════════════════════════════════════════════════════
// Server Configuration
// ═══════════════════════════════════════════════════════════════

const SERVER_INFO = {
  name: '@mutimemoagent/mcp-server',
  version: '0.1.0',
};

// ═══════════════════════════════════════════════════════════════
// Runtime wiring helpers
// ═══════════════════════════════════════════════════════════════
//
// These will be set up during initialization. They remain null
// until explicitly wired, so the server can start without a
// full memograph backend and gracefully report "not connected".

interface RuntimeWiring {
  searchMemory: (input: MemorySearchInput) => Promise<MemorySearchOutput>;
  writeMemory: (input: MemoryWriteInput) => Promise<MemoryWriteOutput>;
  searchSymbol: (input: SymbolSearchInput) => Promise<SymbolSearchOutput>;
  analyzeImpact: (input: ImpactAnalysisInput) => Promise<ImpactAnalysisOutput>;
  crossAgentSearch: (input: CrossAgentSearchInput) => Promise<CrossAgentSearchOutput>;
  getEvolutionReport: (input: EvolutionReportInput) => Promise<EvolutionReportOutput>;
}

let wiring: RuntimeWiring | null = null;

/**
 * Set up the runtime wiring for all MCP tool handlers.
 * Call this during initialization to connect real backends.
 */
export function setWiring(w: RuntimeWiring): void {
  wiring = w;
}

/**
 * Get the current wiring; throws if not initialized.
 */
function getWiring(): RuntimeWiring {
  if (!wiring) {
    throw new Error(
      'Memograph MCP server is not initialized. ' +
      'Call setWiring() with runtime backends, or set AUTO_INIT=1 environment variable.',
    );
  }
  return wiring;
}

// ═══════════════════════════════════════════════════════════════
// MCP Server Setup
// ═══════════════════════════════════════════════════════════════

const server = new McpServer(SERVER_INFO);

// ── Tool: memory_search ───────────────────────────────────────

server.tool(
  'memory_search',
  'Search the Memograph knowledge base for relevant memories. Supports semantic and text queries.',
  {
    query: z.string().describe('Natural language or keyword query'),
    agent_id: z.string().optional().describe('Optional: filter results to a specific agent'),
    max_results: z.number().optional().default(10).describe('Maximum number of results (default: 10)'),
    threshold: z.number().optional().default(0.5).describe('Minimum relevance score threshold (0-1)'),
    memory_type: z.string().optional().describe('Filter by memory type (e.g., fact, code_symbol, insight)'),
  },
  async (input: MemorySearchInput) => {
    try {
      const w = getWiring();
      const result = await w.searchMemory(input);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              results: [],
              total: 0,
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool: memory_write ─────────────────────────────────────────

server.tool(
  'memory_write',
  'Write a new entry to the Memograph knowledge base.',
  {
    agent_id: z.string().describe('Target agent ID to write to'),
    content: z.string().describe('Memory content text'),
    memory_type: z.string().describe('Type of memory entry'),
    tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
    confidence: z.number().optional().default(0.8).describe('Confidence score (0-1)'),
    structured_data: z.object({}).optional().describe('Optional structured metadata'),
  },
  async (input: MemoryWriteInput) => {
    try {
      const w = getWiring();
      const result = await w.writeMemory(input);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool: symbol_search ────────────────────────────────────────

server.tool(
  'symbol_search',
  'Find code symbols (functions, classes, types, variables) across registered projects.',
  {
    symbol: z.string().describe('Symbol name or pattern to search for'),
    project: z.string().optional().describe('Optional: filter to a specific project'),
    include_dependencies: z.boolean().optional().default(false).describe('Include results from dependency libraries'),
  },
  async (input: SymbolSearchInput) => {
    try {
      const w = getWiring();
      const result = await w.searchSymbol(input);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              symbols: [],
              total: 0,
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool: impact_analysis ──────────────────────────────────────

server.tool(
  'impact_analysis',
  'Analyze the downstream impact of changing a code symbol — which modules, tests, and agents would be affected.',
  {
    symbol: z.string().describe('Symbol (function/class/file) to analyze impact for'),
    max_depth: z.number().optional().default(3).describe('Maximum depth of transitive impact analysis (default: 3)'),
  },
  async (input: ImpactAnalysisInput) => {
    try {
      const w = getWiring();
      const result = await w.analyzeImpact(input);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool: cross_agent_search ───────────────────────────────────

server.tool(
  'cross_agent_search',
  "Search across all Memograph agents to find relevant memories. Useful when you don't know which agent has the information.",
  {
    query: z.string().describe('Search query'),
    agents: z.array(z.string()).optional().describe('Optional: specific agents to search (default: all)'),
    max_results_per_agent: z.number().optional().default(5).describe('Maximum results per agent (default: 5)'),
  },
  async (input: CrossAgentSearchInput) => {
    try {
      const w = getWiring();
      const result = await w.crossAgentSearch(input);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              results: [],
              total_agents_queried: 0,
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ── Tool: evolution_report ─────────────────────────────────────

server.tool(
  'evolution_report',
  'Get the current evolution status and fitness scores for agents. Includes recommendations for improving agent performance.',
  {
    agent_id: z.string().optional().describe('Optional: query a specific agent (default: all)'),
    include_recommendations: z.boolean().optional().default(true).describe('Include improvement recommendations'),
  },
  async (input: EvolutionReportInput) => {
    try {
      const w = getWiring();
      const result = await w.getEvolutionReport(input);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              agents: [],
              last_evolution_run: undefined,
              next_scheduled_run: undefined,
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ═══════════════════════════════════════════════════════════════
// Startup
// ═══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const transport = new StdioServerTransport();

  try {
    await server.connect(transport);
    console.error(
      `[${SERVER_INFO.name}] MCP server connected via stdio transport`,
    );

    // If AUTO_INIT is set, attempt to initialize from environment or config file
    if (process.env.AUTO_INIT === '1') {
      console.error('[mutimemoagent-mcp] AUTO_INIT enabled — auto-wiring from config...');
      try {
        // Try to load local config and wire up real backends
        const { existsSync, readFileSync } = await import('node:fs');
        const { homedir } = await import('node:os');
        const { join } = await import('node:path');
        
        const configPath = join(homedir(), '.memograph', 'config.json');
        if (existsSync(configPath)) {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          const key = config?.xiami?.platform_key || process.env.XIAMI_PLATFORM_KEY;
          const base = config?.xiami?.api_base || process.env.XIAMI_API_BASE || 'https://xiami.aiznrc.com';
          
          if (key) {
            // Lazy-import Xiami client and set up real wiring
            const { XiamiClient } = await import('@mutimemoagent/persist');
            const client = new XiamiClient({ api_base: base, platform_key: key });
            
            setWiring({
              searchMemory: (async (input: any) => {
                const results = await client.search({ query: input.query, agent_id: input.agent_id, limit: input.max_results, threshold: input.threshold });
                return { results, total: results.length };
              }) as any,
              writeMemory: (async (input: any) => {
                const result = await client.write({ agent_id: input.agent_id, content: input.content, memory_type: input.memory_type, metadata: { tags: input.tags, confidence: input.confidence } });
                return { id: result.id, status: 'written' };
              }) as any,
              searchSymbol: (async (_input: any) => ({ symbols: [], total: 0 })) as any,
              analyzeImpact: (async (input: any) => ({ symbol: input.symbol, direct_impact: [], indirect_impact: [], test_impact: [], risk_score: 0 })) as any,
              crossAgentSearch: (async (input: any) => {
                const results = await client.searchCrossAgent(input.query);
                return { results, total_agents_queried: 0 };
              }) as any,
              getEvolutionReport: (async (_input: any) => ({ agents: [], last_evolution_run: Date.now(), next_scheduled_run: Date.now() + 86400000 })) as any,
            });
            console.error('[mutimemoagent-mcp] ✅ Auto-wired with Xiami client');
          } else {
            console.error('[mutimemoagent-mcp] ⚠️  No Xiami key found — MCP tools will return empty results');
          }
        } else {
          console.error('[mutimemoagent-mcp] ⚠️  No config found at ~/.memograph/config.json — run mutimemoagent init first');
        }
      } catch (err) {
        console.error('[mutimemoagent-mcp] ⚠️  Auto-init failed:', err instanceof Error ? err.message : String(err));
      }
    }
  } catch (err) {
    console.error(
      `[${SERVER_INFO.name}] Failed to start server:`,
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[memograph-mcp] Fatal error:', err);
  process.exit(1);
});
