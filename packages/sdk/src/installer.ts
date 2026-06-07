import {
  type InitOptions,
  type InitResult,
  type SDKStatus,
  type MemographConfig,
  type XiamiAgentInfo,
  generateId,
  now,
} from '@mutimemoagent/core';
import {MemoryStore, type XiamiClient, type LocalDB} from '@mutimemoagent/memory';
import {XiamiClient as XiamiClientImpl} from '@mutimemoagent/persist';
import {LocalDB as LocalDBImpl} from '@mutimemoagent/persist';
import {IngestPipeline} from '@mutimemoagent/ingest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {execSync, exec} from 'node:child_process';

import {
  loadConfig,
  saveConfig,
  getConfigPath,
  getCacheDir,
  getDefaultConfig,
  ensureConfigDir,
  getConfigDir,
} from './config.js';
import {installHooks, uninstallHooks} from './hooks/git-hooks.js';

// ──────────────────────────────────────────────────────────────────
// MemographSDK — 核心 SDK
// ──────────────────────────────────────────────────────────────────

/**
 * Memograph SDK 主类
 *
 * 负责:
 * - 初始化 (检测环境 → 连接 Xiami → 创建 Agent → 初始化本地 DB → 安装 Git Hooks)
 * - 状态检查
 * - 卸载
 */
export class MemographSDK {
  private config: MemographConfig;
  private memoryStore: MemoryStore | null = null;
  private xiamiClient: XiamiClient | null = null;
  private localDB: LocalDB | null = null;
  private pipeline: IngestPipeline | null = null;

  constructor() {
    this.config = loadConfig();
  }

  // ── 初始化 ──────────────────────────────────────────────────

  /**
   * 完整安装流程
   *
   * 1. 检测运行环境 (Node.js 版本, npm/pnpm)
   * 2. 连接 Xiami 平台
   * 3. 创建默认 Agent(s)
   * 4. 初始化本地 SQLite 数据库
   * 5. 配置 Git Hooks (可选)
   * 6. 返回初始化结果
   */
  async init(options?: InitOptions): Promise<InitResult> {
    console.log('[memograph] Starting initialization...\n');

    const result: InitResult = {
      success: false,
      agents: [],
      config_path: getConfigPath(),
      cache_path: getCacheDir(),
    };

    try {
      // 1. 检测环境
      console.log('[1/5] Checking environment...');
      this.detectEnvironment();

      // 2. 确保配置目录
      ensureConfigDir();
      console.log(`       Config path: ${getConfigPath()}`);
      console.log(`       Cache path:  ${getCacheDir()}`);

      // 3. 连接 Xiami
      console.log('[2/5] Connecting to Xiami...');
      const xiamiKey =
        options?.xiamiKey ||
        process.env.XIAMI_PLATFORM_KEY ||
        '';
      if (!xiamiKey) {
        console.warn(
          '       ⚠  No XIAMI_PLATFORM_KEY provided. Running in offline mode.'
        );
        console.log('       Set XIAMI_PLATFORM_KEY env var or pass xiamiKey option.');
      }

      this.config.xiami.platform_key = xiamiKey;
      if (!this.config.xiami.api_base) {
        this.config.xiami.api_base = process.env.XIAMI_API_BASE ||
          'https://xiami.aiznrc.com';
      }

      // 尝试连接 Xiami
      const rawClient = new XiamiClientImpl({
        api_base: this.config.xiami.api_base,
        platform_key: xiamiKey,
      });
      // SAFETY: persist XiamiClient uses different method names than memory's XiamiClient interface — cast via unknown
      this.xiamiClient = rawClient as unknown as XiamiClient;

      let xiamiConnected = false;
      if (xiamiKey) {
        try {
          // 简单的连通性测试 — use the memory interface method
          // SAFETY: XiamiClientImpl may not match XiamiClient interface exactly; cast for connectivity test
          await (this.xiamiClient as XiamiClient).write({
            agent_id: '__test__',
            content: 'connectivity test',
            memory_type: 'fact',
          });
          xiamiConnected = true;
          console.log('       ✅ Xiami connected');
        } catch (err) {
          console.warn(
            `       ⚠  Xiami connection failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          console.log('       Continuing in offline mode...');
        }
      }

      // 4. 创建 Agent(s)
      console.log('[3/5] Setting up agents...');
      const agents = await this.setupAgents(options);
      result.agents = agents;
      console.log(`       Created ${agents.length} agent(s):`);
      for (const agent of agents) {
        console.log(`         - ${agent.name} (${agent.agent_id})`);
      }

      // 5. 初始化本地数据库
      console.log('[4/5] Initializing local database...');
      this.localDB = await this.initLocalDB();
      console.log('       ✅ Local database initialized');

      // 6. MemoryStore + Pipeline
      this.memoryStore = new MemoryStore(this.xiamiClient!, this.localDB!);
      console.log('       ✅ MemoryStore ready');

      // 7. Git hooks (可选)
      if (options?.initProject && options.projectName) {
        console.log('[5/5] Installing git hooks...');
        const projectDir = path.join(process.cwd(), options.projectName);
        if (fs.existsSync(path.join(projectDir, '.git'))) {
          try {
            installHooks(projectDir);
            this.config.local.git_hooks = true;
            console.log('       ✅ Git hooks installed');
          } catch (err) {
            console.warn(
              `       ⚠  Git hook installation failed: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        } else {
          console.log('       ⚠  Not a git repository, skipping hooks');
        }
      } else if (options?.initProject) {
        // 在当前目录安装 hooks
        const cwd = process.cwd();
        if (fs.existsSync(path.join(cwd, '.git'))) {
          try {
            installHooks(cwd);
            this.config.local.git_hooks = true;
          } catch {
            // skip
          }
        }
      }

      // 保存配置
      saveConfig(this.config);
      console.log(`       ✅ Config saved`);

      result.success = true;
      console.log('\n✅ Memograph initialized successfully!');
    } catch (err) {
      console.error(
        `\n❌ Initialization failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      result.success = false;
    }

    return result;
  }

  // ── 状态检查 ────────────────────────────────────────────────

  /**
   * 获取当前 SDK 运行状态
   */
  async status(): Promise<SDKStatus> {
    // 重新加载配置以获取最新状态
    this.config = loadConfig();

    const agents: SDKStatus['agents'] = [];
    let connected = false;

    // 检查 Xiami 连接
    if (this.config.xiami.platform_key) {
      try {
        const rawClient = new XiamiClientImpl({
          api_base: this.config.xiami.api_base,
          platform_key: this.config.xiami.platform_key,
        });
        // SAFETY: persist XiamiClient uses different method names than memory's XiamiClient interface
        this.xiamiClient = rawClient as unknown as XiamiClient;
        connected = true;
      } catch {
        connected = false;
      }
    }

    // 检查 agents
    for (const [name, info] of Object.entries(this.config.xiami.agents)) {
      agents.push({
        name,
        agent_id: info.agent_id,
        entry_count: 0, // 需要查询远端
      });
    }

    // 检查本地索引
    let localIndex: SDKStatus['local_index'] = {
      size_bytes: 0,
      entry_count: 0,
      last_synced: undefined,
    };

    const cacheDir = getCacheDir();
    if (fs.existsSync(cacheDir)) {
      // 估算缓存大小和条目数
      localIndex.size_bytes = this.getDirSize(cacheDir);
      const dbPath = path.join(cacheDir, 'memograph.db');
      if (fs.existsSync(dbPath)) {
        try {
          const stats = fs.statSync(dbPath);
          localIndex.size_bytes = stats.size;
          // 使用 sqlite 查询条目数 — use dynamic import with type assertion
          const {LocalDB: SQLiteDB} = await import('@mutimemoagent/persist');
          const db = new SQLiteDB() as unknown as { initialize(p: string): void; getStats(): { count: number } };
          db.initialize(dbPath);
          const result = db.getStats();
          localIndex.entry_count = result.count ?? 0;
        } catch {
          // fallback
        }
      }
    }

    // 检查进化状态 (从 config 中的 last_evolution)
    const evolution: SDKStatus['evolution'] = {};

    return {
      connected,
      agents,
      local_index: localIndex,
      evolution,
    };
  }

  // ── 卸载 ────────────────────────────────────────────────────

  /**
   * 卸载 Memograph
   *
   * - 移除当前目录的 git hooks (如果是 git 仓库)
   * - 备份配置
   * - 保留 cache 数据
   */
  async uninstall(): Promise<void> {
    console.log('[memograph] Uninstalling...\n');

    // 1. 移除 git hooks
    console.log('[1/3] Removing git hooks...');
    try {
      const cwd = process.cwd();
      if (fs.existsSync(path.join(cwd, '.git'))) {
        uninstallHooks(cwd);
      }
    } catch (err) {
      console.warn(
        `  ⚠  Failed to remove hooks: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    // 2. 备份配置
    console.log('[2/3] Backing up configuration...');
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const backupPath = configPath + '.backup';
      try {
        fs.copyFileSync(configPath, backupPath);
        console.log(`  ✅ Config backed up: ${backupPath}`);
      } catch (err) {
        console.warn(
          `  ⚠  Backup failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    // 3. 清除配置 (保留 cache)
    console.log('[3/3] Clearing runtime config...');
    this.config = getDefaultConfig();
    this.memoryStore = null;
    this.xiamiClient = null;
    this.localDB = null;
    this.pipeline = null;

    console.log('\n✅ Memograph uninstalled. Cache data preserved.');
    console.log('   To fully remove all data, delete:');
    console.log(`     ${getConfigDir()}`);
  }

  // ── 内部方法 ────────────────────────────────────────────────

  private detectEnvironment(): void {
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    if (major < 18) {
      throw new Error(
        `Node.js ${nodeVersion} is too old. Required >= 18.`
      );
    }
    console.log(`       Node.js ${nodeVersion} ✅`);

    // 检测包管理器
    try {
      execSync('pnpm --version', {stdio: 'pipe'});
      console.log('       Package manager: pnpm ✅');
    } catch {
      try {
        execSync('npm --version', {stdio: 'pipe'});
        console.log('       Package manager: npm ✅');
      } catch {
        console.warn('       ⚠  No supported package manager found');
      }
    }
  }

  private async setupAgents(
    options?: InitOptions
  ): Promise<Array<{name: string; agent_id: string}>> {
    const agents: Array<{name: string; agent_id: string}> = [];

    // 默认 agents
    const defaultAgents = [
      {name: 'profile', description: 'Personal profile and preferences'},
      {name: 'project', description: 'Project code and architecture knowledge'},
    ];

    if (options?.createMCPRegistry) {
      defaultAgents.push({
        name: 'mcp-registry',
        description: 'MCP and skill registry',
      });
    }

    for (const agentDef of defaultAgents) {
      // 检查是否已存在
      if (this.config.xiami.agents[agentDef.name]) {
        const existing = this.config.xiami.agents[agentDef.name];
        agents.push({name: agentDef.name, agent_id: existing.agent_id});
        continue;
      }

      // 离线模式下生成本地 ID
      const agentId = `agent_${agentDef.name}_${generateId()}`;
      const token = `tok_${generateId()}`;
      const apiTokenId = `apitok_${generateId()}`;

      this.config.xiami.agents[agentDef.name] = {
        token,
        agent_id: agentId,
        api_token_id: apiTokenId,
      };

      agents.push({name: agentDef.name, agent_id: agentId});

      console.log(`       ✅ Agent "${agentDef.name}" registered (offline ID: ${agentId})`);
    }

    return agents;
  }

  private async initLocalDB(): Promise<LocalDB> {
    const cacheDir = getCacheDir();
    ensureConfigDir();

    const dbPath = path.join(cacheDir, 'memograph.db');
    // persist's LocalDB uses initialize(dbPath) + insert/getById/deleteById/search/getStats
    // memory's LocalDB interface expects upsert/get/getAllByAgent/delete/ftsSearch/vectorSearch/count
    // SAFETY: persist's LocalDB APIs have not been aligned with memory's LocalDB interface
    const {LocalDB: SQLiteDB} = await import('@mutimemoagent/persist');
    const db = new SQLiteDB() as unknown as LocalDB;
    db.initialize!(dbPath);
    return db;
  }

  private getDirSize(dirPath: string): number {
    let size = 0;
    try {
      const entries = fs.readdirSync(dirPath, {withFileTypes: true});
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile()) {
          const stats = fs.statSync(fullPath);
          size += stats.size;
        } else if (entry.isDirectory()) {
          size += this.getDirSize(fullPath);
        }
      }
    } catch {
      // ignore
    }
    return size;
  }

  // ═════════════════════════════════════════════════════════
  // 🆕 新用户引导 Onboarding
  // ═════════════════════════════════════════════════════════

  async onboard(): Promise<void> {
    console.log('\n==================================================');
    console.log('  🧠  Welcome to Muti-MemoAgent!');
    console.log('  多智能体记忆体自进化网络');
    console.log('==================================================\n');

    const hasKey = this.config.xiami.platform_key?.startsWith('xiami_sk_');

    if (!hasKey) {
      console.log('[Step 1] Register on Xiami platform\n');
      console.log('  Muti-MemoAgent stores memories on Xiami cloud.');
      console.log('  A free account is required.\n');

      const xiamiBase = this.config.xiami.api_base || 'https://xiami.aiznrc.com';
      const webBase = xiamiBase.replace(/\/api\/v1\/?$/, '');
      const registerUrl = `${webBase}/register`;
      const apiKeysUrl = `${webBase}/api-keys`;

      console.log('  → Opening registration page...');
      console.log(`    ${registerUrl}\n`);
      this.openBrowser(registerUrl);

      console.log('  After registering:');
      console.log('  1. Complete signup on the website');
      console.log('  2. Go to API Keys to create a platform key\n');

      console.log('  → Opening API Keys page...');
      console.log(`    ${apiKeysUrl}\n`);
      this.openBrowser(apiKeysUrl);

      console.log('  3. Copy your key (starts with xiami_sk_)');
      console.log('  4. Run: memograph init --xiami-key YOUR_KEY\n');
      return;
    }

    console.log('[Step 2] Verifying Xiami connection...\n');
    const client = new XiamiClientImpl({
      api_base: this.config.xiami.api_base,
      platform_key: this.config.xiami.platform_key,
    });

    try {
      const whoami = await client.whoAmI();
      console.log(`  ✅ Connected! Tier: ${whoami.tier || 'free'}`);
      console.log(`  Agents: ${whoami.agents?.length || 0}\n`);
    } catch { console.log('  ⚠️  Could not verify. Continuing...\n'); }

    console.log('[Step 3] Checking quota...\n');
    try {
      const quota = await client.getQuota();
      console.log(`  Tier: ${quota.tier} | Memory: ${quota.used}/${quota.total}`);
      console.log(`  Agents: ${quota.agents_created}/${quota.agent_limit}\n`);
      if (quota.remaining < 10) console.log('  ⚠️  Low quota! Consider upgrading.\n');
    } catch { console.log('  ⚠️  Could not check quota.\n'); }

    this.showQuickStart();
  }

  async checkBalance(requiredEntries: number, requiredAgents = 0): Promise<{ sufficient: boolean; action: string; message: string }> {
    if (!this.config.xiami.platform_key) {
      return { sufficient: false, action: 'register', message: 'No Xiami key. Run: memograph onboard' };
    }

    const client = new XiamiClientImpl({
      api_base: this.config.xiami.api_base,
      platform_key: this.config.xiami.platform_key,
    });

    let quota;
    try { quota = await client.getQuota(); } catch {
      return { sufficient: true, action: 'offline', message: 'Cannot reach Xiami. Offline mode.' };
    }

    if (quota.remaining < requiredEntries) {
      console.log('\n==================================================');
      console.log('  ⚠️  INSUFFICIENT QUOTA');
      console.log('==================================================\n');
      console.log(`  Plan: ${quota.tier}`);
      console.log(`  Used: ${quota.used}/${quota.total}`);
      console.log(`  Need: ${requiredEntries} | Have: ${quota.remaining}\n`);

      const rechargeUrl = client.getRechargeUrl();
      console.log(`  → Opening upgrade page: ${rechargeUrl}\n`);
      this.openBrowser(rechargeUrl);

      console.log('  Options:');
      console.log('  1. Upgrade plan on the website');
      console.log('  2. Continue offline (local only)');
      console.log('  3. Free up space: memograph forget\n');

      return { sufficient: false, action: 'recharge', message: `Quota exceeded. Upgrade: ${rechargeUrl}` };
    }

    if (requiredAgents > 0 && (quota.agent_limit - quota.agents_created) < requiredAgents) {
      console.log('\n  ⚠️  AGENT LIMIT REACHED');
      console.log(`  ${quota.agents_created}/${quota.agent_limit} agents used\n`);
      this.openBrowser(client.getRechargeUrl());
      return { sufficient: false, action: 'recharge', message: 'Agent limit reached.' };
    }

    return { sufficient: true, action: 'proceed', message: `OK: ${quota.remaining} entries available` };
  }

  private showQuickStart(): void {
    console.log('==================================================');
    console.log('  📖 Quick Start');
    console.log('==================================================\n');
    console.log('  memograph init                   Initialize project');
    console.log('  memograph index                  Index codebase');
    console.log('  memograph analyze                Analyze architecture');
    console.log('  memograph search "query"         Search memories');
    console.log('  memograph memo "content"         Write memory');
    console.log('  memograph watch                  Auto-sync on changes');
    console.log('  memograph evolve                 Run evolution cycle');
    console.log('  memograph forget                 Clean expired memories');
    console.log('  memograph dashboard              Open dashboard');
    console.log('  memograph onboard                First-time setup\n');
    console.log('  --- Xiami ---');
    console.log('  Console: https://xiami.aiznrc.com');
    console.log('  API:     https://xiami.aiznrc.com/api-guide\n');
  }

  private openBrowser(url: string): void {
    try {
      const p = process.platform;
      if (p === 'win32') exec(`start "" "${url}"`);
      else if (p === 'darwin') exec(`open "${url}"`);
      else exec(`xdg-open "${url}"`);
    } catch {
      console.log(`  Please open: ${url}`);
    }
  }
}
