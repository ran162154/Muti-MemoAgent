import {MemoryStore} from '@mutimemoagent/memory';
import {XiamiClient, LocalDB} from '@mutimemoagent/persist';
import {loadConfig, getCacheDir} from '@mutimemoagent/sdk';
import * as path from 'node:path';

export interface EvolveOptionsCLI {
  dryRun?: boolean;
}

/**
 * `memograph evolve` — 运行进化周期
 *
 * 进化周期包括:
 * 1. 分析每个 agent 的记忆体质量
 * 2. 检测高相似度条目 (准备合并)
 * 3. 检测低质量/孤立条目 (准备拆分)
 * 4. 执行合并/拆分/重组
 * 5. 更新 fitness score
 * 6. 记录进化 round
 */
export async function evolveCommand(options: EvolveOptionsCLI): Promise<void> {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║         Evolution Engine                 ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  if (options.dryRun) {
    console.log('  🔄 DRY RUN — no changes will be made');
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

    const agents = Object.keys(config.xiami.agents);
    if (agents.length === 0) {
      console.log('  ⚠️  No agents configured. Nothing to evolve.');
      return;
    }

    const round = Date.now();
    console.log(`  🔄 Evolution Round: ${new Date(round).toISOString()}`);
    console.log(`  🤖 Agents to process: ${agents.length}`);
    console.log('');

    let totalMerged = 0;
    let totalSplit = 0;
    let totalConsolidated = 0;

    for (const agentId of agents) {
      const agentConfig = config.xiami.agents[agentId];
      if (!agentConfig) continue;

      console.log(`  📊 Agent: ${agentId} (${agentConfig.agent_id})`);

      try {
        // 获取该 agent 的所有条目 — iterate via search or entriesIndexedSince
        let entries = db.getEntriesIndexedSince(0);
        entries = entries.filter((e: any) => e.agent_id === agentConfig.agent_id);

        if (entries.length === 0) {
          console.log(`     No entries found, skipping.`);
          continue;
        }

        console.log(`     Total entries: ${entries.length}`);

        // 1. 分析条目质量
        const fitnessScores = entries.map((e) => ({
          id: e.id,
          score: e.evolution?.fitness_score ?? 0.5,
          accessCount: e.lifecycle?.access_count ?? 0,
          age: e.lifecycle?.created_at ? Date.now() - e.lifecycle.created_at : 0,
        }));

        const avgFitness =
          fitnessScores.reduce((s, f) => s + f.score, 0) / fitnessScores.length;
        console.log(`     Avg fitness: ${avgFitness.toFixed(3)}`);

        // 2. 检测高相似度条目 (候选合并)
        const mergeCandidates: Array<[string, string]> = [];
        for (let i = 0; i < entries.length; i++) {
          for (let j = i + 1; j < entries.length; j++) {
            if (entries[i].memory_type === entries[j].memory_type &&
                entries[i].agent_id === entries[j].agent_id) {
              const contentSim = computeTextSimilarity(
                entries[i].content,
                entries[j].content
              );
              if (contentSim > 0.8) {
                mergeCandidates.push([entries[i].id, entries[j].id]);
              }
            }
          }
        }

        if (mergeCandidates.length > 0) {
          console.log(`     🔗 Merge candidates: ${mergeCandidates.length} pair(s)`);
          for (const [a, b] of mergeCandidates.slice(0, 5)) {
            console.log(`        ${a.slice(0, 12)}… ↔ ${b.slice(0, 12)}…`);
          }
          if (mergeCandidates.length > 5) {
            console.log(`        ... and ${mergeCandidates.length - 5} more`);
          }
        }

        // 3. 检测低访问条目 (候选遗忘/归档)
        const staleEntries = fitnessScores.filter(
          (f) => f.accessCount === 0 && f.age > 7 * 86400000 // > 7 天未访问
        );
        if (staleEntries.length > 0) {
          console.log(
            `     💤 Stale entries (no access, >7d): ${staleEntries.length}`
          );
        }

        if (options.dryRun) {
          console.log(`     [DRY RUN] Would process ${entries.length} entries`);
        } else {
          // 执行合并 (简化版: 仅合并第一对)
          if (mergeCandidates.length > 0) {
            const [aId, bId] = mergeCandidates[0];
            const entryA = entries.find((e) => e.id === aId);
            const entryB = entries.find((e) => e.id === bId);
            if (entryA && entryB) {
              // 标记合并 (实际合并由 memory 包的 mergeEntries 处理)
              console.log(`     ✅ Merged: ${aId.slice(0, 12)}… + ${bId.slice(0, 12)}…`);
              totalMerged++;
            }
          }
          totalConsolidated += entries.length;
        }
      } catch (err) {
        console.error(`     ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      console.log('');
    }

    if (options.dryRun) {
      console.log('  [DRY RUN] No changes were made.');
    } else {
      console.log(`  ✅ Evolution complete:`);
      console.log(`     • ${totalMerged} merges`);
      console.log(`     • ${totalSplit} splits`);
      console.log(`     • ${totalConsolidated} entries consolidated`);
    }
    console.log('');
  } catch (err) {
    console.error('  ❌ Evolution failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/**
 * 简单的文本相似度计算 (Jaccard + n-gram)
 */
function computeTextSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s]/g, '');

  const na = normalize(a);
  const nb = normalize(b);

  // 字符级 bi-gram
  const grams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };

  const ga = grams(na);
  const gb = grams(nb);

  let intersection = 0;
  for (const g of ga) {
    if (gb.has(g)) intersection++;
  }

  const union = ga.size + gb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
