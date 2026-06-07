// Muti-MemoAgent — First-run setup check (CommonJS)
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');
const { execSync } = require('node:child_process');

const CONFIG_DIR = join(homedir(), '.memograph');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function hasConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) return false;
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(raw);
    return config && config.xiami && config.xiami.platform_key && config.xiami.platform_key.startsWith('xiami_sk_');
  } catch { return false; }
}

function openBrowser(url) {
  try {
    const p = process.platform;
    if (p === 'win32') execSync('start "" "' + url + '"');
    else if (p === 'darwin') execSync('open "' + url + '"');
    else execSync('xdg-open "' + url + '"');
  } catch (e) { /* best-effort */ }
}

if (hasConfig()) {
  console.log('Muti-MemoAgent: already configured');
  process.exit(0);
}

console.log('==================================================');
console.log('  Welcome to Muti-MemoAgent!');
console.log('  Multi-Agent Memory Self-Evolution Network');
console.log('==================================================\n');
console.log('First-time setup:\n');
console.log('  1. Register on Xiami cloud (free)');
console.log('  2. Create an API platform key');
console.log('  3. Run: memograph init --xiami-key YOUR_KEY\n');

const XIAMI_BASE = 'https://xiami.aiznrc.com';
console.log('  Opening Xiami registration page...');
openBrowser(XIAMI_BASE + '/register');
console.log('  Opening API keys page...');
openBrowser(XIAMI_BASE + '/api-keys');

console.log('--------------------------------------------------');
console.log('  After registering:');
console.log('    npx memograph init --xiami-key xiami_sk_xxx');
console.log('');
console.log('  Auto-creates:');
console.log('    - profile agent (user preferences/habits)');
console.log('    - mcp-registry agent (MCP/Skill registry)');
console.log('    - project agent (code knowledge graph)');
console.log('--------------------------------------------------\n');

try { mkdirSync(CONFIG_DIR, { recursive: true }); } catch (e) {}
