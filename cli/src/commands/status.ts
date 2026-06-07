import {MemographSDK, loadConfig} from '@mutimemoagent/sdk';

/**
 * `memograph status` — 显示状态
 */
export async function statusCommand(): Promise<void> {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║           Memograph Status              ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  try {
    const sdk = new MemographSDK();
    const status = await sdk.status();

    // 连接状态
    console.log(`  🔌 Connection:  ${status.connected ? '✅ Connected' : '⚠️  Offline'}`);

    // Agent 列表
    console.log(`  🤖 Agents:      ${status.agents.length > 0 ? '' : 'None configured'}`);
    for (const agent of status.agents) {
      console.log(`     • ${agent.name}`);
      console.log(`       ID: ${agent.agent_id}`);
      console.log(`       Entries: ${agent.entry_count}`);
    }

    // 本地索引
    console.log(`  💾 Local Index:`);
    console.log(`     Size:     ${formatBytes(status.local_index.size_bytes)}`);
    console.log(`     Entries:  ${status.local_index.entry_count}`);
    if (status.local_index.last_synced) {
      const lastSync = new Date(status.local_index.last_synced);
      console.log(`     Synced:   ${lastSync.toLocaleString()}`);
    }

    // 进化
    if (status.evolution.last_run) {
      console.log(`  🔄 Evolution:`);
      console.log(`     Last run: ${new Date(status.evolution.last_run).toLocaleString()}`);
      if (status.evolution.next_run) {
        console.log(`     Next run: ${new Date(status.evolution.next_run).toLocaleString()}`);
      }
    }

    console.log('');
  } catch (err) {
    console.error('  ❌ Failed to get status:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
