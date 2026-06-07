import * as fs from 'node:fs';
import * as path from 'node:path';

// ──────────────────────────────────────────────────────────────────
// Git Hooks 安装与管理
// ──────────────────────────────────────────────────────────────────

const HOOKS_DIR = '.git/hooks';

/**
 * 生成 hook 脚本内容
 *
 * @param event - git hook 事件名 (post-commit, post-merge, post-checkout)
 * @returns shell 脚本内容
 */
export function generateHookScript(event: string): string {
  const hookVarName = event.replace(/-/g, '_');

  return `#!/bin/sh
# Memograph ${event} hook — auto-index memory on git operations
# Installed by @mutimemoagent/sdk

MEMOGRAPH_BIN="$(command -v memograph 2>/dev/null)"
if [ -z "$MEMOGRAPH_BIN" ]; then
  # Try local node_modules
  if [ -f "./node_modules/.bin/memograph" ]; then
    MEMOGRAPH_BIN="./node_modules/.bin/memograph"
  elif [ -f "../node_modules/.bin/memograph" ]; then
    MEMOGRAPH_BIN="../node_modules/.bin/memograph"
  else
    exit 0
  fi
fi

# Only run if memograph is configured for this project
if [ -f ".memograph.json" ]; then
  case "${event}" in
    post-commit)
      # Index changed files
      "$MEMOGRAPH_BIN" index --quiet 2>/dev/null &
      ;;
    post-merge)
      # Index new files from merge
      "$MEMOGRAPH_BIN" index --quiet 2>/dev/null &
      ;;
    post-checkout)
      # Only on branch switch, not file checkout
      if [ "$1" = "1" ]; then
        "$MEMOGRAPH_BIN" index --quiet 2>/dev/null &
      fi
      ;;
  esac
fi
`;
}

/**
 * 安装 husky 兼容的 git hooks
 *
 * @param projectDir - 项目根目录
 */
export function installHooks(projectDir: string): void {
  const hooksDir = path.join(projectDir, HOOKS_DIR);

  // 检查是否是 git 仓库
  if (!fs.existsSync(hooksDir)) {
    throw new Error(
      `Not a git repository: ${projectDir} (no .git/hooks directory)`
    );
  }

  const events = ['post-commit', 'post-merge', 'post-checkout'];

  for (const event of events) {
    const hookPath = path.join(hooksDir, event);
    const script = generateHookScript(event);

    try {
      fs.writeFileSync(hookPath, script, {mode: 0o755});
      console.log(`[memograph] Installed git hook: ${event}`);
    } catch (err) {
      throw new Error(
        `Failed to install hook "${event}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
}

/**
 * 卸载 git hooks
 *
 * @param projectDir - 项目根目录
 */
export function uninstallHooks(projectDir: string): void {
  const hooksDir = path.join(projectDir, HOOKS_DIR);

  if (!fs.existsSync(hooksDir)) return;

  const events = ['post-commit', 'post-merge', 'post-checkout'];
  let uninstalled = 0;

  for (const event of events) {
    const hookPath = path.join(hooksDir, event);
    try {
      if (fs.existsSync(hookPath)) {
        const content = fs.readFileSync(hookPath, 'utf-8');

        // 只删除由 memograph 安装的 hook (包含标识头)
        if (content.includes('Memograph')) {
          fs.unlinkSync(hookPath);
          console.log(`[memograph] Removed git hook: ${event}`);
          uninstalled++;
        }
      }
    } catch (err) {
      console.warn(
        `[memograph] Failed to remove hook "${event}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  if (uninstalled === 0) {
    console.log('[memograph] No memograph git hooks found to uninstall');
  }
}

/**
 * 加载 .memograph.json 项目配置文件
 */
export function loadProjectConfig(projectDir: string): Record<string, unknown> | null {
  const configPath = path.join(projectDir, '.memograph.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw) as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 保存 .memograph.json 项目配置文件
 */
export function saveProjectConfig(
  projectDir: string,
  config: Record<string, unknown>
): void {
  const configPath = path.join(projectDir, '.memograph.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`[memograph] Project config saved: ${configPath}`);
}
