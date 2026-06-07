import fs from 'fs';
import path from 'path';

import {
  type IngestEvent,
  type MemoryEntry,
  type WriteResult,
  type ClassifiedItem,
  type EventSourceType,
  type Embedder,
  type LLMClient,
  generateId,
  now,
} from '@mutimemoagent/core';
import type {MemoryStore} from '@mutimemoagent/memory';
import {CodeIndexer} from '@mutimemoagent/indexer';
import type {MemoryEntry as IndexerMemoryEntry} from '@mutimemoagent/indexer';

import {SignalFilter} from './filter/signal-filter.js';
import {DedupDetector} from './filter/dedup.js';
import {clean} from './filter/cleaner.js';
import {SmartRouter} from './router/smart-router.js';
import {ProfileExtractor} from './extractor/profile.js';
import {CodeExtractor} from './extractor/code.js';
import {MCPExtractor} from './extractor/mcp.js';

// ──────────────────────────────────────────────────────────────────
// IngestPipeline — 记忆摄入管道
// ──────────────────────────────────────────────────────────────────

export interface PipelineConfig {
  embedder: Embedder;
  llm: LLMClient;
  memoryStore: MemoryStore;
  dedupThreshold?: number;
  enableDedup?: boolean;
  enableFilter?: boolean;
}

export type PipelineStep = (event: IngestEvent) => Promise<IngestEvent | null>;
export type ClassifierStep = (event: IngestEvent) => Promise<ClassifiedItem[]>;

/**
 * 记忆摄入管道
 *
 * 处理流程:
 *   1. SignalFilter     — 信号过滤 (拒绝噪音)
 *   2. DedupDetector    — 去重检测 (与已有条目比较)
 *   3. ConflictCheck    — 冲突检测 (委托给 MemoryStore)
 *   4. SmartRouter      — 智能路由 (确定目标 agent)
 *   5. ContentClassifier — 内容分类与提取 (按路由目标)
 *   6. MemoryStore.write — 写入持久化
 */
export class IngestPipeline {
  private config: PipelineConfig;
  private steps: PipelineStep[];
  private classifier: ClassifierStep;

  constructor(config: PipelineConfig) {
    this.config = config;

    // 组装管道步骤
    this.steps = [
      this.stepSignalFilter.bind(this),
      this.stepDedupDetector.bind(this),
      this.stepConflictCheck.bind(this),
      this.stepSmartRouter.bind(this),
    ];
    this.classifier = this.stepContentClassifier.bind(this);
  }

  /**
   * 处理单个摄入事件
   * @param event - 摄入事件
   * @returns 写入结果
   */
  async process(event: IngestEvent): Promise<WriteResult> {
    try {
      // 管道式处理: 每个步骤可以提前终止 (返回 null)
      let current: IngestEvent | null = { ...event };
      let classifiedItems: ClassifiedItem[] = [];

      for (const step of this.steps) {
        current = await step(current);
        if (current === null) {
          return {
            written: [],
            indexed: [],
            failed: [{
              item: { target_agent: '', type: 'fact', content: event.payload, confidence: 0, source: event.source, tags: [] },
              error: `Pipeline rejected at step ${step.name}`,
            }],
          };
        }
      }

      // 步骤5: 内容分类 (单独处理，因为返回类型不同)
      if (current) {
        classifiedItems = await this.classifier(current);
        if (classifiedItems.length === 0) {
          return {
            written: [],
            indexed: [],
            failed: [{
              item: { target_agent: '', type: 'fact', content: event.payload, confidence: 0, source: event.source, tags: [] },
              error: 'No items classified from input',
            }],
          };
        }
      }

      // 写入每个分类后的条目
      const result: WriteResult = { written: [], indexed: [], failed: [] };

      for (const item of classifiedItems) {
        try {
          const result_entry = await this.config.memoryStore.write(item);
          result.written.push(result_entry.entry.id);
          result.indexed.push(result_entry.entry.id);
        } catch (err) {
          result.failed.push({
            item,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return result;
    } catch (err) {
      return {
        written: [],
        indexed: [],
        failed: [{
          item: {
            target_agent: '',
            type: 'fact',
            content: event.payload,
            confidence: 0,
            source: event.source,
            tags: [],
          },
          error: err instanceof Error ? err.message : String(err),
        }],
      };
    }
  }

  /**
   * 批量处理多个摄入事件
   * @param events - 摄入事件列表
   * @returns 写入结果列表
   */
  async processBatch(events: IngestEvent[]): Promise<WriteResult[]> {
    return Promise.all(events.map(e => this.process(e)));
  }

  // ── Code Indexing Integration ────────────────────────────────

  /**
   * Process code files through the indexer, then route extracted symbols
   * through the ingest pipeline ONCE (no double processing).
   *
   * 1. Routes code files to the indexer for symbol extraction
   * 2. Routes extracted symbols through the ingest pipeline
   * 3. Adds a `source: 'code'` tag to prevent duplicate processing
   * 4. Checks for existing entries with same file+symbol before writing
   */
  async processCode(files: string[]): Promise<WriteResult> {
    const result: WriteResult = { written: [], indexed: [], failed: [] };

    // 1. Index code files
    const indexer = new CodeIndexer();
    const projectRoot = this.detectProjectRoot(files[0]);

    // Run incremental index on the given files
    const indexResult = await indexer.incrementalIndex(files);

    // 2. Export graph to memory entries
    const memoryEntries: IndexerMemoryEntry[] = indexer.exportGraphToMemory();

    // 3. Process each memory entry through the pipeline
    for (const memEntry of memoryEntries) {
      try {
        // 4. Check for duplicates (same file + symbol already exists)
        if (indexer.deduplicateSymbol(memEntry.symbol, memEntry.file)) {
          continue; // Skip duplicate
        }

        // Build an ingest event with source: 'code' tag
        const event: IngestEvent = {
          id: generateId(),
          source: 'code',
          timestamp: now(),
          payload: memEntry.content,
          metadata: {
            tags: memEntry.tags,
            file: memEntry.file,
            symbol: memEntry.symbol,
            symbol_kind: memEntry.symbol_kind,
            line: memEntry.line,
            endLine: memEntry.endLine,
            importance_score: memEntry.importance_score,
            source: 'code',
          },
        };

        const writeResult = await this.process(event);
        result.written.push(...writeResult.written);
        result.indexed.push(...writeResult.indexed);
        result.failed.push(...writeResult.failed);
      } catch (err) {
        result.failed.push({
          item: {
            target_agent: 'code-index',
            type: 'code_symbol',
            content: memEntry.content,
            confidence: 0.8,
            source: 'code',
            tags: ['code'],
          },
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  /**
   * Check if a symbol from a file already exists in the local DB.
   * Delegates to the indexer's deduplicateSymbol method.
   */
  deduplicateSymbol(symbol: string, file: string): boolean {
    try {
      const indexer = new CodeIndexer();
      return indexer.deduplicateSymbol(symbol, file);
    } catch {
      return false;
    }
  }

  /**
   * Detect project root from a file path (walks up to find .memograph or package.json).
   */
  private detectProjectRoot(filePath: string): string {
    let dir = filePath;
    try {
      const stat = fs.statSync(dir);
      if (!stat.isDirectory()) {
        dir = path.dirname(dir);
      }
    } catch {
      dir = path.dirname(dir);
    }

    // Walk up to find a marker
    let current = dir;
    for (let i = 0; i < 20; i++) {
      if (fs.existsSync(path.join(current, '.memograph')) ||
          fs.existsSync(path.join(current, 'package.json')) ||
          fs.existsSync(path.join(current, '.git'))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return dir;
  }

  // ── 管道步骤 ──────────────────────────────────────────────────

  /**
   * 步骤1: 信号过滤
   */
  private async stepSignalFilter(event: IngestEvent): Promise<IngestEvent | null> {
    if (this.config.enableFilter === false) return event;

    const filter = new SignalFilter();
    const result = filter.filter(event.payload);

    if (!result.pass) {
      return null; // 被过滤掉
    }

    // 清洗后继续
    return {
      ...event,
      payload: clean(event.payload),
    };
  }

  /**
   * 步骤2: 去重检测
   */
  private async stepDedupDetector(event: IngestEvent): Promise<IngestEvent | null> {
    if (this.config.enableDedup === false) return event;

    const dedup = new DedupDetector(
      this.config.embedder,
      this.config.dedupThreshold ?? 0.95
    );

    // 获取已有条目用于去重
    let existingEntries: MemoryEntry[] = [];
    try {
      // 使用 Agent 范围获取条目
      const targetAgent = event.source === 'code' ? 'project' : 'profile';
      // SAFETY: memoryStore may be any store implementing LocalDB interface with getAllByAgent
      const store = this.config.memoryStore as unknown as { getAllByAgent?(agentId: string): Promise<MemoryEntry[]> };
      if (store && typeof store.getAllByAgent === 'function') {
        existingEntries = await store.getAllByAgent(targetAgent);
      }
    } catch {
      // 如果失败，跳过去重
      return event;
    }

    const result = await dedup.detectDuplicate(event.payload, existingEntries);

    if (result.isDuplicate) {
      return null; // 重复，丢弃
    }

    return event;
  }

  /**
   * 步骤3: 冲突检测 (委托给 MemoryStore)
   */
  private async stepConflictCheck(event: IngestEvent): Promise<IngestEvent | null> {
    try {
      // 简单的冲突检测: 检查是否有已有条目与输入冲突
      // 委托给 MemoryStore 通过查询进行冲突检测
      // SAFETY: memoryStore may be any store implementing LocalDB interface with getAllByAgent
      const store = this.config.memoryStore as unknown as { getAllByAgent?(agentId: string): Promise<MemoryEntry[]> };
      if (typeof store.getAllByAgent === 'function') {
        const existing = await store.getAllByAgent('profile');
        const conflict = existing.find(
          (e: MemoryEntry) => e.content === event.payload && e.memory_type === 'conflict_flag'
        );
        if (conflict) {
          return {
            ...event,
            metadata: {
              ...(event.metadata ?? {}),
              conflictFlagged: true,
            },
          };
        }
      }
      return event;
    } catch {
      // 如果冲突检测不可用，继续处理
      return event;
    }
  }

  /**
   * 步骤4: 智能路由
   */
  private async stepSmartRouter(event: IngestEvent): Promise<IngestEvent | null> {
    const router = new SmartRouter();
    const routes = router.route(event.payload, event.source, event.metadata);

    if (routes.length === 0) {
      return null; // 没有可路由的目标，丢弃
    }

    return {
      ...event,
      metadata: {
        ...(event.metadata ?? {}),
        routes: routes,
        primaryRoute: routes[0].agent_id,
      },
    };
  }

  /**
   * 步骤5: 内容分类与提取
   */
  private async stepContentClassifier(event: IngestEvent): Promise<ClassifiedItem[]> {
    const primaryRoute = (
      event.metadata?.routes as Array<{agent_id: string; weight: number}> | undefined
    )?.[0]?.agent_id ?? 'profile';
    const source = event.source;

    // 根据 source + route 选择合适的提取器
    if (source === 'code' || primaryRoute === 'code-index' || primaryRoute === 'project') {
      const extractor = new CodeExtractor(this.config.llm);
      return extractor.extract(event.payload);
    }

    if (source === 'mcp_install' || primaryRoute === 'mcp-registry') {
      const extractor = new MCPExtractor(this.config.llm);
      return extractor.extract(event.payload);
    }

    if (source === 'dialogue' || primaryRoute === 'profile' || primaryRoute === 'preference') {
      const extractor = new ProfileExtractor(this.config.llm);
      return extractor.extract(event.payload);
    }

    // 默认使用 profile 提取
    const extractor = new ProfileExtractor(this.config.llm);
    return extractor.extract(event.payload);
  }
}
