// ────────────────────────────────────────────────────────────────
// @mutimemoagent/collaboration — Named Entity Recognizer
// Regex + keyword-based entity extraction for agent memory content.
// ────────────────────────────────────────────────────────────────

import type { Entity } from '@mutimemoagent/core';

// ── Keyword Dictionaries ────────────────────────────────────

const TOOL_DICT = new Set([
  'npm', 'pnpm', 'yarn', 'webpack', 'vite', 'docker',
  'git', 'eslint', 'prettier', 'jest', 'vitest', 'mocha',
  'cypress', 'playwright', 'karma', 'babel', 'swc', 'turbo',
  'nx', 'lerna', 'gulp', 'grunt', 'rollup', 'parcel',
  'postcss', 'sass', 'less', 'tailwind', 'bootstrap',
  'kubernetes', 'k8s', 'terraform', 'ansible', 'helm',
  'prometheus', 'grafana', 'datadog', 'sentry', 'logstash',
  'cmake', 'make', 'gradle', 'maven',
  'claude', 'chatgpt', 'copilot', 'vercel', 'netlify',
  'ngrok', 'insomnia', 'postman', 'swagger', 'jira',
  'confluence', 'notion', 'obsidian', 'slack', 'discord',
  'figma', 'sketch', 'photoshop',
  'redis-cli', 'psql', 'mysql', 'sqlite',
]);

const TECHNOLOGY_DICT = new Set([
  'TypeScript', 'JavaScript', 'React', 'Vue', 'Svelte', 'Angular',
  'Node.js', 'Deno', 'Bun',
  'Python', 'Rust', 'Go', 'Ruby', 'Java', 'Kotlin',
  'Swift', 'C++', 'C#', 'PHP', 'Scala', 'Elixir',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite',
  'DynamoDB', 'Cassandra', 'Elasticsearch', 'ClickHouse',
  'GraphQL', 'REST', 'gRPC', 'WebSocket',
  'Next.js', 'Nuxt', 'NestJS', 'Express', 'Fastify', 'Flask',
  'Django', 'Spring', 'Laravel', 'Rails', 'Rocket',
  'AWS', 'GCP', 'Azure', 'Cloudflare', 'DigitalOcean',
  'Docker', 'Kubernetes', 'ECS', 'Lambda', 'S3',
  'Kafka', 'RabbitMQ', 'NATS', 'ZeroMQ',
  'TensorFlow', 'PyTorch', 'JAX', 'LangChain', 'OpenAI',
  'WebAssembly', 'WASI',
  'Tailwind', 'Chakra UI', 'MUI', 'Ant Design', 'shadcn',
  'Rollup', 'Vite', 'Webpack', 'esbuild', 'SWC',
  'Hono', 'elysia', 'itty-router',
  'Turborepo', 'Nx', 'Lerna', 'pnpm workspaces',
  'Zig', 'Haskell', 'Clojure', 'Erlang', 'OCaml',
]);

const CONCEPT_DICT = new Set([
  'auth', 'authentication', 'authorization', 'OAuth', 'JWT',
  'caching', 'cache', 'routing', 'route', 'middleware',
  'ORM', 'API', 'microservice', 'monorepo', 'polyrepo',
  'CI/CD', 'CD/CI',
  'dependency injection', 'inversion of control', 'IoC',
  'event sourcing', 'CQRS', 'DDD', 'hexagonal', 'clean architecture',
  'serverless', 'edge computing',
  'load balancing', 'rate limiting', 'throttling',
  'serialization', 'deserialization',
  'observability', 'telemetry', 'tracing', 'logging', 'metrics',
  'i18n', 'l10n', 'localization', 'internationalization',
  'state management', 'state machine',
  'reactive', 'streaming', 'pub/sub', 'event bus',
  'design patterns', 'SOLID', 'DRY', 'KISS', 'YAGNI',
  'immutability', 'idempotency', 'idempotent',
  'ACID', 'BASE', 'CAP theorem',
  'sharding', 'replication', 'partitioning',
  'containerization', 'orchestration',
  'migration', 'schema', 'indexing',
  'webhook', 'SSE', 'long polling',
  'A/B testing', 'feature flag',
  'memoization', 'lazy loading', 'tree-shaking',
  'code splitting', 'hot reload', 'HMR',
]);

const PROCESS_DICT = new Set([
  'code review', 'testing', 'deployment', 'rollout',
  'migration', 'refactoring', 'debugging', 'profiling',
  'code generation', 'scaffolding', 'bootstrapping',
  'onboarding', 'offboarding',
  'code freeze', 'release', 'hotfix', 'patch',
  'sprint', 'standup', 'retrospective', 'planning',
  'pair programming', 'mobbing',
  'incident management', 'postmortem', 'runbook',
  'performance tuning', 'optimization',
  'security audit', 'penetration testing',
  'data migration', 'schema migration',
  'continuous integration', 'continuous deployment',
  'monitoring', 'alerting', 'escalation',
]);

// ── Regex Patterns ─────────────────────────────────────────

/** Match CamelCase identifiers (at least 2 words joined) */
const CAMEL_CASE_RE = /\b[A-Z][a-z]+[A-Z][A-Za-z0-9]*\b/g;

/** Match snake_case identifiers */
const SNAKE_CASE_RE = /\b[a-z]+(?:_[a-z0-9]+)+\b/g;

/** Match kebab-case identifiers */
const KEBAB_CASE_RE = /\b[a-z]+(?:-[a-z0-9]+)+\b/g;

/** Match scoped package names e.g. @scope/package */
const SCOPED_PKG_RE = /@[a-z0-9_][a-z0-9._-]*\/[a-z0-9._-]+/gi;

/** Match version strings like v1.2.3, 1.2.3-alpha */
const VERSION_RE = /\bv?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?\b/g;

/** Match file extensions */
const FILE_EXT_RE = /\.(ts|tsx|js|jsx|py|rs|go|vue|svelte|css|scss|json|yaml|yml|md|toml)\b/gi;

// ── NamedEntityRecognizer ──────────────────────────────────

export class NamedEntityRecognizer {
  /**
   * Extract all entities from a single text string.
   */
  extractEntities(text: string): Entity[] {
    const entityMap = new Map<string, Entity>();

    const addEntity = (name: string, agentId: string = 'unknown') => {
      const type = this.classifyEntity(name);
      const key = name.toLowerCase();
      const existing = entityMap.get(key);
      if (existing) {
        existing.occurrences++;
      } else {
        entityMap.set(key, {
          name,
          type,
          agent_id: agentId,
          occurrences: 1,
        });
      }
    };

    // 1. Keyword-based matches (TOOLS, TECHNOLOGIES, CONCEPTS, PROCESSES)
    this.matchKeywords(text, TOOL_DICT, (m) => addEntity(m));
    this.matchKeywords(text, TECHNOLOGY_DICT, (m) => addEntity(m));
    this.matchKeywords(text, CONCEPT_DICT, (m) => addEntity(m));
    this.matchKeywords(text, PROCESS_DICT, (m) => addEntity(m));

    // 2. Regex patterns
    for (const match of text.matchAll(CAMEL_CASE_RE)) {
      // Skip if it looks like a version or pure uppercase
      if (match[0] === match[0].toUpperCase()) continue;
      addEntity(match[0]);
    }

    for (const match of text.matchAll(SNAKE_CASE_RE)) {
      addEntity(match[0]);
    }

    for (const match of text.matchAll(KEBAB_CASE_RE)) {
      addEntity(match[0]);
    }

    for (const match of text.matchAll(SCOPED_PKG_RE)) {
      addEntity(match[0]);
    }

    // 3. PERSON detection via honorific patterns
    const personPatterns = [
      /\b(?:Mr|Ms|Mrs|Dr|Prof)\.?\s+[A-Z][a-z]+\b/g,
      /\b(?:user|user_name|username)[=:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
      /@[A-Z][a-z]+\b/g,
    ];

    for (const pattern of personPatterns) {
      for (const match of text.matchAll(pattern)) {
        let name = match[0];
        // Strip @ prefix for mentions
        if (name.startsWith('@')) name = name.slice(1);
        // Strip label prefix
        const colonIdx = name.indexOf(':');
        if (colonIdx !== -1) name = name.slice(colonIdx + 1).trim();
        const eqIdx = name.indexOf('=');
        if (eqIdx !== -1) name = name.slice(eqIdx + 1).trim();
        if (name.length >= 2) {
          entityMap.set(`person:${name.toLowerCase()}`, {
            name,
            type: 'PERSON',
            agent_id: 'unknown',
            occurrences: 1 + (entityMap.get(`person:${name.toLowerCase()}`)?.occurrences ?? 0),
          });
        }
      }
    }

    return [...entityMap.values()];
  }

  /**
   * Classify a single entity name into its type.
   * Returns the best-guess classification.
   */
  classifyEntity(name: string): Entity['type'] {
    const lower = name.toLowerCase();

    if (TOOL_DICT.has(lower) || TOOL_DICT.has(name)) return 'TOOL';
    if (TECHNOLOGY_DICT.has(name)) return 'TECHNOLOGY';
    if (CONCEPT_DICT.has(lower)) return 'CONCEPT';
    if (PROCESS_DICT.has(lower)) return 'PROCESS';

    // Scoped packages → TOOL
    if (/^@[a-z0-9]+\//.test(name)) return 'TOOL';

    // @ mentions → PERSON
    if (name.startsWith('@') && /^@[A-Z]/.test(name)) return 'PERSON';

    // Version numbers → TECHNOLOGY (?)
    if (/^\d+\.\d+\.\d+/.test(name)) return 'TECHNOLOGY';

    // File extensions → TECHNOLOGY
    if (name.startsWith('.')) return 'TECHNOLOGY';

    // snake_case / kebab-case → CONCEPT
    if (/^[a-z]+(?:_[a-z0-9]+)+$/.test(name)) return 'CONCEPT';
    if (/^[a-z]+(?:-[a-z0-9]+)+$/.test(name)) return 'CONCEPT';

    // CamelCase with uppercase → TECHNOLOGY
    if (/^[A-Z][a-z]+[A-Z]/.test(name)) return 'TECHNOLOGY';

    return 'CONCEPT';
  }

  /**
   * Extract entities across multiple texts with deduplication.
   * Agent ID is assigned per-entity from the input batch context.
   */
  extractFromBatch(texts: string[]): Entity[] {
    const entityMap = new Map<string, Entity>();

    for (const text of texts) {
      const entities = this.extractEntities(text);
      for (const e of entities) {
        const key = this.entityKey(e);
        const existing = entityMap.get(key);
        if (existing) {
          existing.occurrences += e.occurrences;
        } else {
          entityMap.set(key, { ...e });
        }
      }
    }

    return [...entityMap.values()];
  }

  /**
   * Merge duplicate entities (same name+type+agent_id),
   * summing occurrences.
   */
  mergeEntities(entities: Entity[]): Entity[] {
    const merged = new Map<string, Entity>();

    for (const e of entities) {
      const key = this.entityKey(e);
      const existing = merged.get(key);
      if (existing) {
        existing.occurrences += e.occurrences;
      } else {
        merged.set(key, { ...e });
      }
    }

    return [...merged.values()];
  }

  // ── Private ───────────────────────────────────────────────

  private entityKey(e: Entity): string {
    return `${e.name}::${e.type}::${e.agent_id}`;
  }

  /**
   * Match keywords from a set inside the text (case-insensitive
   * for tool/concept/process dicts, case-sensitive for technology).
   */
  private matchKeywords(
    text: string,
    dict: Set<string>,
    onMatch: (match: string) => void,
  ): void {
    const lowerText = text.toLowerCase();

    for (const keyword of dict) {
      const lowerKw = keyword.toLowerCase();
      // Word-boundary matching
      const escaped = lowerKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      if (re.test(lowerText)) {
        // Preserve original casing from the input
        const origRe = new RegExp(`\\b${escaped}\\b`, 'i');
        const match = text.match(origRe);
        onMatch(match ? match[0] : keyword);
      }
    }
  }
}
