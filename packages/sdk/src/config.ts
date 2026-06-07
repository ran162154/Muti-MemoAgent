import {type MemographConfig} from '@mutimemoagent/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ──────────────────────────────────────────────────────────────────
// 配置管理
// ──────────────────────────────────────────────────────────────────

const CONFIG_DIRNAME = '.memograph';
const CONFIG_FILENAME = 'config.json';

/**
 * 获取配置目录路径
 */
export function getConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIRNAME);
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILENAME);
}

/**
 * 获取缓存目录路径
 */
export function getCacheDir(): string {
  return path.join(getConfigDir(), 'cache');
}

/**
 * 获取日志目录路径
 */
export function getLogDir(): string {
  return path.join(getConfigDir(), 'logs');
}

/**
 * 加载配置
 *
 * 从 ~/.memograph/config.json 加载配置。
 * 如果文件不存在，返回默认配置。
 */
export function loadConfig(): MemographConfig {
  const configPath = getConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      return getDefaultConfig();
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as MemographConfig;

    // 验证必要字段
    if (!config.xiami || !config.local) {
      console.warn('[memograph] Config file missing required sections, using defaults');
      return getDefaultConfig();
    }

    return config;
  } catch (err) {
    console.warn(
      `[memograph] Failed to load config from ${configPath}:`,
      err instanceof Error ? err.message : String(err)
    );
    return getDefaultConfig();
  }
}

/**
 * 保存配置到 ~/.memograph/config.json
 */
export function saveConfig(config: MemographConfig): void {
  const configDir = getConfigDir();

  // 确保目录存在
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, {recursive: true});
  }

  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 获取默认配置
 */
export function getDefaultConfig(): MemographConfig {
  return {
    xiami: {
      platform_key: '',
      api_base: 'https://xiami.aiznrc.com',
      agents: {},
    },
    local: {
      cache_dir: getCacheDir(),
      git_hooks: false,
      auto_sync: true,
    },
  };
}

/**
 * 检查配置是否已初始化 (至少有一个 agent 配好了)
 */
export function isConfigInitialized(config: MemographConfig): boolean {
  return (
    config.xiami.platform_key.length > 0 &&
    Object.keys(config.xiami.agents).length > 0
  );
}

/**
 * 确保配置目录存在
 */
export function ensureConfigDir(): void {
  const dirs = [getConfigDir(), getCacheDir(), getLogDir()];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }
  }
}

/**
 * 从项目根目录加载 .memographignore 文件（gitignore 格式）
 * 并合并默认排除模式。
 *
 * @param projectDir - 项目根目录
 * @returns 排除模式列表
 */
export function loadIgnorePatterns(projectDir: string): string[] {
  const ignorePath = path.join(projectDir, '.memographignore');
  const patterns: string[] = [];

  try {
    if (!fs.existsSync(ignorePath)) {
      return patterns;
    }

    const content = fs.readFileSync(ignorePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith('#')) continue;

      // 处理转义注释前缀（以 \# 开头）
      if (trimmed.startsWith('\\#')) {
        patterns.push(trimmed.slice(1));
        continue;
      }

      // 忽略 negate 模式（! 开头的行），因为我们的 glob 匹配不支持否定
      if (trimmed.startsWith('!')) continue;

      patterns.push(trimmed);
    }
  } catch {
    // 文件不可读时静默处理
  }

  return patterns;
}
