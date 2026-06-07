// ─────────────────────────────────────────────────────────────────
// @memograph/persist — Xiami REST API Client
// ─────────────────────────────────────────────────────────────────

import type {
  MemoryEntry,
  XiamiWriteInput,
  XiamiSearchInput,
  XiamiAgentInfo,
  SearchResult,
  MemoryType,
} from '@memograph/core';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface XiamiClientConfig {
  api_base: string;
  platform_key: string;
}

export interface XiamiWriteResponse {
  id: string;
}

export interface XiamiBatchWriteResponse {
  ids: string[];
}

export interface XiamiAgentCreateRequest {
  name: string;
  description?: string;
}

// ── Quota / Balance ────────────────────────────────────

export interface XiamiQuotaInfo {
  total: number;          // 套餐总记忆条数
  used: number;           // 已用条数
  remaining: number;      // 剩余额度
  tier: string;           // 套餐等级 (free/basic/pro/enterprise)
  agent_limit: number;    // 最大记忆体数量
  agents_created: number; // 已创建记忆体数
}

export class QuotaExceededError extends Error {
  constructor(
    public readonly quota: XiamiQuotaInfo,
    public readonly required: number,
  ) {
    super(
      `Quota exceeded: need ${required} items, only ${quota.remaining} remaining (${quota.tier} tier)`,
    );
    this.name = 'QuotaExceededError';
  }
}

// ─────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────

export class XiamiApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body?: unknown,
  ) {
    super(`Xiami API error ${status} ${statusText}`);
    this.name = 'XiamiApiError';
  }
}

// ─────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BATCH_SIZE = 100;

export class XiamiClient {
  private readonly apiBase: string;
  private readonly platformKey: string;

  constructor(config: XiamiClientConfig) {
    this.apiBase = config.api_base.replace(/\/+$/, '');
    this.platformKey = config.platform_key;
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Execute an authenticated HTTP request against the Xiami API
   * with automatic retry on 429 (rate-limit) responses.
   */
  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    attempt = 0,
  ): Promise<T> {
    const url = `${this.apiBase}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + this.platformKey,
      'User-Agent': '@memograph/persist/0.1.0',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // ── Rate-limit: exponential backoff ──────────────────────
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get('Retry-After');
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1_000
        : INITIAL_BACKOFF_MS * Math.pow(2, attempt);

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return this.request<T>(method, path, body, attempt + 1);
    }

    // ── Success (2xx) ────────────────────────────────────────
    if (res.ok) {
      // 204 No Content
      if (res.status === 204) {
        return undefined as T;
      }
      return (await res.json()) as T;
    }

    // ── Error ──────────────────────────────────────────────────
    let errorBody: unknown;
    try {
      errorBody = await res.json();
    } catch {
      try {
        errorBody = await res.text();
      } catch {
        errorBody = null;
      }
    }

    throw new XiamiApiError(res.status, res.statusText, errorBody);
  }

  // ── Memory: write ─────────────────────────────────────────

  /**
   * Write a single memory entry to the Xiami cloud.
   */
  async write(input: XiamiWriteInput): Promise<XiamiWriteResponse> {
    return this.request<XiamiWriteResponse>('POST', '/memory/write', input);
  }

  /**
   * Write up to 100 memory entries in a single batch call.
   * Throws if the batch exceeds the maximum size.
   */
  async writeBatch(inputs: XiamiWriteInput[]): Promise<XiamiBatchWriteResponse> {
    if (inputs.length > MAX_BATCH_SIZE) {
      throw new Error(
        `Batch size ${inputs.length} exceeds maximum of ${MAX_BATCH_SIZE}`,
      );
    }
    return this.request<XiamiBatchWriteResponse>(
      'POST',
      '/memory/write-batch',
      inputs,
    );
  }

  // ── Memory: search ───────────────────────────────────────

  /**
   * Search memory entries. Supports text, embedding, and
   * filter-based searches via XiamiSearchInput.
   */
  async search(input: XiamiSearchInput): Promise<MemoryEntry[]> {
    return this.request<MemoryEntry[]>('POST', '/search', input);
  }

  /**
   * Cross-agent search — queries memory across all agents
   * registered under this platform key.
   */
  async searchCrossAgent(query: string): Promise<SearchResult[]> {
    return this.request<SearchResult[]>('POST', '/search/cross-agent', {
      query,
    });
  }

  // ── Agent management ─────────────────────────────────────

  /**
   * Create a new agent on the Xiami platform.
   * Returns the agent info including its API token.
   */
  async createAgent(
    name: string,
    description?: string,
  ): Promise<XiamiAgentInfo> {
    const body: XiamiAgentCreateRequest = { name };
    if (description !== undefined) {
      body.description = description;
    }
    return this.request<XiamiAgentInfo>('POST', '/agents/json', body);
  }

  /**
   * List all agents associated with this platform key.
   */
  async listAgents(): Promise<XiamiAgentInfo[]> {
    return this.request<XiamiAgentInfo[]>(
      'GET',
      '/third-party/memory/integration-manifest',
    );
  }

  // ── Knowledge base ───────────────────────────────────────

  /**
   * Synchronize a batch of text entries into the agent's
   * knowledge base for grounding LLM responses.
   */
  async syncKnowledgeBase(
    entries: Array<{ content: string; type: MemoryType }>,
  ): Promise<void> {
    await this.request<void>(
      'POST',
      '/ai/knowledge-base/sync-text',
      { entries },
    );
  }

  // ── Forgetting ───────────────────────────────────────────

  /**
   * Trigger a forgetting (memory consolidation / decay) cycle
   * for the specified agent. The Xiami server evaluates each
   * entry's fitness and applies retention, consolidation, or
   * decay accordingly.
   */
  async runForgetting(agentId: string): Promise<void> {
    await this.request<void>('POST', '/memory/forgetting/dream', {
      agent_id: agentId,
    });
  }

  // ── Statistics ───────────────────────────────────────────

  /**
   * Retrieve memory statistics for the given agent.
   * Returns a flat key-value map — exact keys are server-defined.
   */
  async getStats(
    agentId: string,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'POST',
      '/ai/memory/stats',
      { agent_id: agentId },
    );
  }

  // ═════════════════════════════════════════════════════════
  // 🆕 Quota / Balance / Onboarding
  // ═════════════════════════════════════════════════════════

  /**
   * Validate the platform key and get account info.
   */
  async whoAmI(): Promise<{
    account_id: string;
    tier: string;
    agents: Array<{ id: string; name: string; entry_count: number }>;
  }> {
    return this.request('GET', '/auth/whoami');
  }

  /**
   * Get account quota — memory limits and agent limits.
   */
  async getQuota(): Promise<XiamiQuotaInfo> {
    try {
      const manifest = await this.request<any>(
        'GET',
        '/third-party/memory/integration-manifest',
      );
      // Extract quota info from manifest
      return {
        total: manifest?.quota?.memory_limit ?? manifest?.max_memories ?? 100,
        used: manifest?.quota?.memory_used ?? manifest?.memory_count ?? 0,
        remaining:
          (manifest?.quota?.memory_limit ?? 100) -
          (manifest?.quota?.memory_used ?? 0),
        tier: manifest?.quota?.tier ?? manifest?.plan ?? 'free',
        agent_limit: manifest?.quota?.agent_limit ?? 5,
        agents_created: manifest?.agents?.length ?? 0,
      };
    } catch {
      // Fallback: try agents endpoint
      try {
        const agents = await this.listAgents();
        return {
          total: 100,
          used: 0,
          remaining: 100,
          tier: 'free',
          agent_limit: 5,
          agents_created: agents.length,
        };
      } catch {
        return {
          total: 0,
          used: 0,
          remaining: 0,
          tier: 'unknown',
          agent_limit: 0,
          agents_created: 0,
        };
      }
    }
  }

  /**
   * Check if there's enough quota for the requested operation.
   * Throws QuotaExceededError if insufficient.
   */
  async checkQuota(requiredEntries: number, requiredAgents = 0): Promise<void> {
    const quota = await this.getQuota();

    if (requiredEntries > 0 && quota.remaining < requiredEntries) {
      throw new QuotaExceededError(quota, requiredEntries);
    }

    if (requiredAgents > 0) {
      const remainingAgents = quota.agent_limit - quota.agents_created;
      if (remainingAgents < requiredAgents) {
        throw new QuotaExceededError(quota, requiredAgents);
      }
    }
  }

  /**
   * Get the Xiami recharge/pricing page URL.
   */
  getRechargeUrl(): string {
    // Strip /api/v1 to get the web console base
    const webBase = this.apiBase.replace(/\/api\/v1$/, '');
    return `${webBase}/pricing`;
  }

  /**
   * Get the Xiami registration page URL.
   */
  getRegisterUrl(): string {
    const webBase = this.apiBase.replace(/\/api\/v1$/, '');
    return `${webBase}/register`;
  }

  /**
   * Get the Xiami API keys management page URL.
   */
  getApiKeysUrl(): string {
    const webBase = this.apiBase.replace(/\/api\/v1$/, '');
    return `${webBase}/api-keys`;
  }
}
