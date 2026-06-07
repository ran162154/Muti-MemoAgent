import {MemoryStore} from '@mutimemoagent/memory';
import {XiamiClient, LocalDB} from '@mutimemoagent/persist';
import {loadConfig, getCacheDir} from '@mutimemoagent/sdk';
import * as path from 'node:path';

export interface ForgetOptionsCLI {
  dryRun?: boolean;
}

/**
 * `memograph forget [agent]` — 运行遗忘周期
 *
 * 遗忘周期:
 * 1. 检测过期条目 (TTL 已到)
 * 2. 检测低访问条目 (长期未读取)
 * 3. 检测低置信度条目
 * 4. 根据策略决定: 保留/归档/遗忘
 * 5. 标记 conflict 条目
 */
export async function forgetCommand(
  agentArg: string | undefined,
  options: ForgetOptionsCLI
): Promise<void> {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║         Forgetting Engine                ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  if (options.dryRun) {
    console.log('  💤 DRY RUN — no changes will be made');
    console.log('');
  }

  try {
    const config = loadConfig();
    const cacheDir = getCacheDir();
    const db = new LocalDB();
    db.initialize(path.join(cacheDir, 'memograph.db'));
    const xiamiClient = new XiamiClient({
      api_base: config.xiami.api_base,
      platform_key: config.xiami.platform_key,
    });
    // SAFETY: XiamiClientImpl and LocalDBImpl need casting to match memory's interfaces
    const memoryStore = new MemoryStore(xiamiClient as unknown as import('@mutimemoagent/memory').XiamiClient, db as unknown as import('@mutimemoagent/memory').LocalDB);

    // 确定要处理的 agents
    let agentsToProcess: string[];

    if (agentArg) {
      // 处理特定 agent
      if (config.xiami.agents[agentArg]) {
        agentsToProcess = [agentArg];
      } else {
        console.error(`  ❌ Agent "${agentArg}" not found in configuration`);
        console.log(`     Available: ${Object.keys(config.xiami.agents).join(', ')}`);
        process.exit(1);
      }
    } else {
      // 处理所有 agents
      agentsToProcess = Object.keys(config.xiami.agents);
    }

    if (agentsToProcess.length === 0) {
      console.log('  ⚠️  No agents configured. Nothing to forget.');
      return;
    }

    console.log(`  💤 Processing ${agentsToProcess.length} agent(s)`);
    console.log('');

    let totalForgotten = 0;
    let totalArchived = 0;
    let totalFlagged = 0;

    for (const agentId of agentsToProcess) {
      const agentConfig = config.xiami.agents[agentId];
      if (!agentConfig) continue;

      console.log(`  📊 Agent: ${agentId}`);

      try {
        let entries = db.getEntriesIndexedSince(0);
        entries = entries.filter((e: any) => e.agent_id === agentConfig.agent_id);
        if (entries.length === 0) {
          console.log(`     No entries, skipping`);
          continue;
        }

        const now = Date.now();

        const forgotten: string[] = [];
        const archived: string[] = [];
        const flagged: string[] = [];

        for (const entry of entries) {
          // 1. TTL 检查
          if (entry.lifecycle?.ttl_ms && entry.lifecycle.ttl_ms > 0) {
            const age = now - entry.lifecycle.created_at;
            if (age > entry.lifecycle.ttl_ms) {
              forgotten.push(entry.id);
              continue;
            }
          }

          // 2. 低访问 + 长时间未读取 (超过 30 天未访问)
          const daysSinceAccess = entry.lifecycle?.last_accessed_at
            ? (now - entry.lifecycle.last_accessed_at) / 86400000
            : Infinity;
          const accessCount = entry.lifecycle?.access_count ?? 0;

          if (daysSinceAccess > 30 && accessCount < 3) {
            archived.push(entry.id);
            continue;
          }

          // 3. 低置信度检查 (confidence < 0.3)
          if ((entry.metadata?.confidence ?? 0.8) < 0.3) {
            if (daysSinceAccess > 7) {
              forgotten.push(entry.id);
            } else {
              flagged.push(entry.id);
            }
            continue;
          }

          // 4. 已标记为 conflict 的条目
          if (entry.relations?.conflicts_with && entry.relations.conflicts_with.length > 0) {
            flagged.push(entry.id);
          }
        }

        console.log(`     Total: ${entries.length}`);
        console.log(`     🗑️  To forget:  ${forgotten.length}`);
        console.log(`     📦 To archive: ${archived.length}`);
        console.log(`     🚩 Flagged:    ${flagged.length}`);

        if (!options.dryRun) {
          // 执行遗忘
          for (const id of forgotten) {
            try {
              await memoryStore.delete(id);
              totalForgotten++;
            } catch {
              // 单个失败不中断
            }
          }

          // 标记归档 (设置 stage = 'archived')
          for (const id of archived) {
            const entry = entries.find((e) => e.id === id);
            if (entry) {
              try {
                await memoryStore.update(id, {
                  ...entry,
                  lifecycle: {
                    ...entry.lifecycle,
                    stage: 'archived',
                  },
                });
                totalArchived++;
              } catch {
                // skip
              }
            }
          }

          totalFlagged += flagged.length;
        } else {
          // Dry run: 展示示例
          if (forgotten.length > 0) {
            console.log(`     Example forgotten: ${forgotten.slice(0, 3).map((id) => id.slice(0, 12)).join(', ')}`);
          }
          if (archived.length > 0) {
            console.log(`     Example archived: ${archived.slice(0, 3).map((id) => id.slice(0, 12)).join(', ')}`);
          }
        }
      } catch (err) {
        console.error(`     ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      console.log('');
    }

    if (options.dryRun) {
      console.log('  [DRY RUN] No changes were made.');
    } else {
      console.log(`  ✅ Forgetting cycle complete:`);
      console.log(`     • ${totalForgotten} entries forgotten`);
      console.log(`     • ${totalArchived} entries archived`);
      console.log(`     • ${totalFlagged} entries flagged for review`);
    }
    console.log('');
  } catch (err) {
    console.error('  ❌ Forgetting cycle failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
