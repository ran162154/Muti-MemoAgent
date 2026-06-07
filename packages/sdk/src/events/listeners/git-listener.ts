// ─────────────────────────────────────────────────────────────────
// @mutimemoagent/events — GitListener
// Install/uninstall git hooks that trigger memograph events.
// ─────────────────────────────────────────────────────────────────

import * as fs from 'node:fs';
import * as path from 'node:path';

const HOOKS_DIR = '.git/hooks';

/**
 * Shell script template for the git hook callout.
 * Writes to a temporary file and executes it so the hook can run
 * non-blocking in the background.
 */
function buildHookScript(cmd: string): string {
  return `#!/bin/sh
# memograph hook — auto-generated, do not edit manually
# Trigger: ${cmd}

# Run in background so git doesn't block
nohup memograph trigger ${cmd} > /dev/null 2>&1 &
`;
}

/**
 * Manages installation and removal of git hooks that fire memograph events.
 *
 * Hooks installed:
 *  - post-commit  → fires 'git:commit'
 *  - post-merge   → fires 'git:commit' (merge is a commit event)
 *  - post-checkout → fires 'git:checkout'
 */
export class GitListener {
  private projectDir: string = '';
  private installed: boolean = false;

  /**
   * Install git hooks into the given project directory.
   * Creates the .git/hooks directory if it doesn't exist.
   */
  install(projectDir: string): void {
    this.projectDir = projectDir;
    const hooksPath = path.join(projectDir, HOOKS_DIR);

    if (!fs.existsSync(hooksPath)) {
      throw new Error(
        `Git hooks directory not found: ${hooksPath}. Is this a git repository?`
      );
    }

    this.writeHook(hooksPath, 'post-commit', 'git:commit');
    this.writeHook(hooksPath, 'post-merge', 'git:commit');
    this.writeHook(hooksPath, 'post-checkout', 'git:checkout');

    this.installed = true;
  }

  /**
   * Remove hooks previously installed by memograph.
   */
  uninstall(projectDir: string): void {
    const hooksPath = path.join(projectDir, HOOKS_DIR);
    const hooks = ['post-commit', 'post-merge', 'post-checkout'];

    for (const hook of hooks) {
      const hookFile = path.join(hooksPath, hook);
      if (fs.existsSync(hookFile)) {
        const content = fs.readFileSync(hookFile, 'utf-8');
        // Only remove if it looks like one of our hooks
        if (content.includes('memograph trigger')) {
          fs.unlinkSync(hookFile);
        }
      }
    }

    this.installed = false;
  }

  /**
   * Returns whether hooks are currently installed.
   */
  isInstalled(): boolean {
    return this.installed;
  }

  private writeHook(hooksPath: string, hookName: string, eventName: string): void {
    const hookFile = path.join(hooksPath, hookName);
    const script = buildHookScript(eventName);

    fs.writeFileSync(hookFile, script, { mode: 0o755 });
  }
}
