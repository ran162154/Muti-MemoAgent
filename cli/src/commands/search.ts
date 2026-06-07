import {MemoryStore} from '@mutimemoagent/memory';
import {XiamiClient, LocalDB} from '@mutimemoagent/persist';
import {loadConfig, getCacheDir} from '@mutimemoagent/sdk';
import type {SearchQuery, SearchResult} from '@mutimemoagent/core';
import * as path from 'node:path';

export interface SearchOptionsCLI {
  agent?: string;
  type?: string;
  maxResults?: string;
  mode?: string;
}

/**
 * `memograph search <query>` — 搜索记忆体
 */
export async function searchCommand(
  query: string,
  options: SearchOptionsCLI
): Promise<void> {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║            Memory Search                 ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  if (!query || query.trim().length === 0) {
    console.error('  ❌ Search query is required');
    process.exit(1);
  }

  try {
    const config = loadConfig();
    const cacheDir = getCacheDir();
    const db = new LocalDB();
    db.initialize(path.join(cacheDir, 'memograph.db'));

    // 先尝试 FTS5 全文搜索
    const ftsResults = db.search(query, parseInt(options.maxResults || '10', 10));

    if (ftsResults.length === 0) {
      console.log('  🔍 No results found for:', query);
      console.log('');
      console.log('  💡 Tips:');
      console.log('     • Try a different query');
      console.log('     • Use "memograph index" to index your project first');
      console.log('     • Use "memograph memo" to add memories manually');
      console.log('');
      return;
    }

    console.log(`  🔍 Found ${ftsResults.length} result(s) for: "${query}"`);
    console.log('');

    for (let i = 0; i < ftsResults.length; i++) {
      const entry = ftsResults[i];
      const agentPrefix = entry.agent_id?.slice(0, 12) ?? 'unknown';
      const type = entry.memory_type ?? 'fact';
      const confidence = entry.metadata?.confidence ?? 0;
      const createdAt = entry.lifecycle?.created_at
        ? new Date(entry.lifecycle.created_at).toLocaleDateString()
        : '?';

      console.log(`  ${i + 1}. [${type}] ${entry.content.slice(0, 120)}${entry.content.length > 120 ? '...' : ''}`);
      console.log(`     Agent: ${agentPrefix}  |  Confidence: ${(confidence * 100).toFixed(0)}%  |  Created: ${createdAt}`);
      if (entry.metadata?.tags && entry.metadata.tags.length > 0) {
        console.log(`     Tags: ${entry.metadata.tags.slice(0, 6).join(', ')}`);
      }
      console.log('');
    }
  } catch (err) {
    console.error('  ❌ Search failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
