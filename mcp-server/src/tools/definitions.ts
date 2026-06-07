// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/mcp-server — Tool Definitions
// ─────────────────────────────────────────────────────────────────

import type { MemoryEntry, SearchResult } from '@mutimemoagent/core';

// ═══════════════════════════════════════════════════════════════
// Base tool shape
// ═══════════════════════════════════════════════════════════════

export interface McpToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

// ═══════════════════════════════════════════════════════════════
// Tool: memory_search
// ═══════════════════════════════════════════════════════════════

export interface MemorySearchInput {
  query: string;
  agent_id?: string;
  max_results?: number;
  threshold?: number;
  memory_type?: string;
}

export interface MemorySearchOutput {
  results: Array<{
    id: string;
    content: string;
    memory_type: string;
    agent_id: string;
    score: number;
    tags: string[];
    confidence: number;
    created_at: number;
  }>;
  total: number;
}

export const memorySearchTool: McpToolDefinition<MemorySearchInput, MemorySearchOutput> = {
  name: 'memory_search',
  description: 'Search the Memograph knowledge base for relevant memories. Supports semantic and text queries.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language or keyword query',
      },
      agent_id: {
        type: 'string',
        description: 'Optional: filter results to a specific agent',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results (default: 10)',
        default: 10,
      },
      threshold: {
        type: 'number',
        description: 'Minimum relevance score threshold (0-1)',
        default: 0.5,
      },
      memory_type: {
        type: 'string',
        description: 'Filter by memory type (e.g., fact, code_symbol, insight)',
      },
    },
    required: ['query'],
  },
  handler: async (input: MemorySearchInput): Promise<MemorySearchOutput> => {
    // Inject query string for runtime wiring
    return {
      results: [],
      total: 0,
    };
  },
};

// ═══════════════════════════════════════════════════════════════
// Tool: memory_write
// ═══════════════════════════════════════════════════════════════

export interface MemoryWriteInput {
  agent_id: string;
  content: string;
  memory_type: string;
  tags?: string[];
  confidence?: number;
  structured_data?: Record<string, unknown>;
}

export interface MemoryWriteOutput {
  id: string;
  status: 'written' | 'error';
  error?: string;
}

export const memoryWriteTool: McpToolDefinition<MemoryWriteInput, MemoryWriteOutput> = {
  name: 'memory_write',
  description: 'Write a new entry to the Memograph knowledge base.',
  inputSchema: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'Target agent ID to write to',
      },
      content: {
        type: 'string',
        description: 'Memory content text',
      },
      memory_type: {
        type: 'string',
        description: 'Type of memory entry',
        enum: [
          'fact', 'preference', 'procedure', 'event', 'error',
          'code_file', 'code_symbol', 'code_dependency', 'insight',
          'cross_agent_relation', 'conflict_flag',
        ],
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization',
      },
      confidence: {
        type: 'number',
        description: 'Confidence score (0-1)',
        default: 0.8,
      },
      structured_data: {
        type: 'object',
        description: 'Optional structured metadata',
      },
    },
    required: ['agent_id', 'content', 'memory_type'],
  },
  handler: async (input: MemoryWriteInput): Promise<MemoryWriteOutput> => {
    return { id: '', status: 'error', error: 'Not implemented: runtime wiring required' };
  },
};

// ═══════════════════════════════════════════════════════════════
// Tool: symbol_search
// ═══════════════════════════════════════════════════════════════

export interface SymbolSearchInput {
  symbol: string;
  project?: string;
  include_dependencies?: boolean;
}

export interface SymbolSearchOutput {
  symbols: Array<{
    name: string;
    path: string;
    kind: string;
    language: string;
    agent_id: string;
    signature?: string;
    complexity?: number;
  }>;
  total: number;
}

export const symbolSearchTool: McpToolDefinition<SymbolSearchInput, SymbolSearchOutput> = {
  name: 'symbol_search',
  description: 'Find code symbols (functions, classes, types, variables) across registered projects.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Symbol name or pattern to search for',
      },
      project: {
        type: 'string',
        description: 'Optional: filter to a specific project',
      },
      include_dependencies: {
        type: 'boolean',
        description: 'Include results from dependency libraries',
        default: false,
      },
    },
    required: ['symbol'],
  },
  handler: async (input: SymbolSearchInput): Promise<SymbolSearchOutput> => {
    return { symbols: [], total: 0 };
  },
};

// ═══════════════════════════════════════════════════════════════
// Tool: impact_analysis
// ═══════════════════════════════════════════════════════════════

export interface ImpactAnalysisInput {
  symbol: string;
  max_depth?: number;
}

export interface ImpactAnalysisOutput {
  symbol: string;
  direct_impact: string[];
  indirect_impact: string[];
  test_impact: string[];
  risk_score: number;
  warning?: string;
}

export const impactAnalysisTool: McpToolDefinition<ImpactAnalysisInput, ImpactAnalysisOutput> = {
  name: 'impact_analysis',
  description: 'Analyze the downstream impact of changing a code symbol — which modules, tests, and agents would be affected.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Symbol (function/class/file) to analyze impact for',
      },
      max_depth: {
        type: 'number',
        description: 'Maximum depth of transitive impact analysis (default: 3)',
        default: 3,
      },
    },
    required: ['symbol'],
  },
  handler: async (input: ImpactAnalysisInput): Promise<ImpactAnalysisOutput> => {
    return {
      symbol: input.symbol,
      direct_impact: [],
      indirect_impact: [],
      test_impact: [],
      risk_score: 0,
      warning: 'Impact analysis requires a populated code graph',
    };
  },
};

// ═══════════════════════════════════════════════════════════════
// Tool: cross_agent_search
// ═══════════════════════════════════════════════════════════════

export interface CrossAgentSearchInput {
  query: string;
  agents?: string[];
  max_results_per_agent?: number;
}

export interface CrossAgentSearchOutput {
  results: Array<{
    agent_id: string;
    agent_name: string;
    entries: Array<{
      id: string;
      content: string;
      memory_type: string;
      score: number;
    }>;
  }>;
  total_agents_queried: number;
}

export const crossAgentSearchTool: McpToolDefinition<CrossAgentSearchInput, CrossAgentSearchOutput> = {
  name: 'cross_agent_search',
  description: 'Search across all Memograph agents to find relevant memories. Useful when you don\'t know which agent has the information.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      agents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: specific agents to search (default: all)',
      },
      max_results_per_agent: {
        type: 'number',
        description: 'Maximum results per agent (default: 5)',
        default: 5,
      },
    },
    required: ['query'],
  },
  handler: async (input: CrossAgentSearchInput): Promise<CrossAgentSearchOutput> => {
    return { results: [], total_agents_queried: 0 };
  },
};

// ═══════════════════════════════════════════════════════════════
// Tool: evolution_report
// ═══════════════════════════════════════════════════════════════

export interface EvolutionReportInput {
  agent_id?: string;
  include_recommendations?: boolean;
}

export interface EvolutionReportOutput {
  agents: Array<{
    agent_id: string;
    fitness_score: number;
    state: string;
    recommendations: string[];
    dimensions: Record<string, { score: number; metrics: Record<string, number> }>;
  }>;
  last_evolution_run?: number;
  next_scheduled_run?: number;
}

export const evolutionReportTool: McpToolDefinition<EvolutionReportInput, EvolutionReportOutput> = {
  name: 'evolution_report',
  description: 'Get the current evolution status and fitness scores for agents. Includes recommendations for improving agent performance.',
  inputSchema: {
    type: 'object',
    properties: {
      agent_id: {
        type: 'string',
        description: 'Optional: query a specific agent (default: all)',
      },
      include_recommendations: {
        type: 'boolean',
        description: 'Include improvement recommendations',
        default: true,
      },
    },
  },
  handler: async (input: EvolutionReportInput): Promise<EvolutionReportOutput> => {
    return {
      agents: [],
      last_evolution_run: undefined,
      next_scheduled_run: undefined,
    };
  },
};

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

export const ALL_TOOLS = [
  memorySearchTool,
  memoryWriteTool,
  symbolSearchTool,
  impactAnalysisTool,
  crossAgentSearchTool,
  evolutionReportTool,
];
