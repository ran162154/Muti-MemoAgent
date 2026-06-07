import {IngestPipeline} from '@mutimemoagent/ingest';
import {MemoryStore} from '@mutimemoagent/memory';
import {XiamiClient, LocalDB} from '@mutimemoagent/persist';
import {loadConfig, getCacheDir} from '@mutimemoagent/sdk';
import {createEmbedder, BaseLLMClient, generateId} from '@mutimemoagent/core';
import * as path from 'node:path';

export interface MemoOptionsCLI {
  agent?: string;
  type?: string;
  tags?: string;
}

/**
 * `memograph memo <content>` — 手动写入记忆
 */
export async function memoCommand(
  content: string,
  options: MemoOptionsCLI
): Promise<void> {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║           Manual Memory Write            ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  if (!content || content.trim().length === 0) {
    console.error('  ❌ Memory content is required');
    process.exit(1);
  }

  try {
    const config = loadConfig();
    const cacheDir = getCacheDir();
    const db = new LocalDB();
    db.initialize(path.join(cacheDir, 'memograph.db'));

    // 检查是否有 agents 配置
    const agentKeys = Object.keys(config.xiami.agents);
    if (agentKeys.length === 0) {
      console.log('  ⚠️  No agents configured. Run "memograph init" first.');
      console.log('  💡 Writing in offline mode — memory will be stored locally only.');
    }

    const xiamiClient = new XiamiClient({
      api_base: config.xiami.api_base,
      platform_key: config.xiami.platform_key,
    });
    // SAFETY: XiamiClientImpl and LocalDBImpl need casting to match memory's interfaces
    const memoryStore = new MemoryStore(xiamiClient as unknown as import('@mutimemoagent/memory').XiamiClient, db as unknown as import('@mutimemoagent/memory').LocalDB);
    const embedder = createEmbedder(256);
    const llmClient = new BaseLLMClient({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY || process.env.XIAMI_LLM_KEY,
    });

    const pipeline = new IngestPipeline({
      embedder,
      llm: llmClient,
      memoryStore,
      enableDedup: false, // 手动写入不进行去重
    });

    // 解析 tags
    let tags: string[] = [];
    if (options.tags) {
      tags = options.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }

    const memoEvent = {
      id: `memo_${generateId()}`,
      source: 'manual' as const,
      timestamp: Date.now(),
      payload: content,
      metadata: {
        agent_override: options.agent || 'profile',
        type_override: options.type || 'fact',
        tags,
      },
    };

    const result = await pipeline.process(memoEvent);

    if (result.written.length > 0) {
      console.log(`  ✅ Written ${result.written.length} memory entr${result.written.length === 1 ? 'y' : 'ies'}:`);
      for (const id of result.written) {
        console.log(`     • ${id}`);
      }
    }

    if (result.failed.length > 0) {
      console.log(`  ⚠️  ${result.failed.length} failure(s):`);
      for (const f of result.failed) {
        console.log(`     • ${f.error}`);
      }
    }

    console.log('');
  } catch (err) {
    console.error('  ❌ Failed to write memory:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
