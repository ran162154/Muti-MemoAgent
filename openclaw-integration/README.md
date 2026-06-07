# Muti-MemoAgent OpenClaw Integration

Easily integrate Multi-MemoAgent memory management into your OpenClaw workspace. Memories are automatically synced, indexed, and searchable across sessions.

## Quick Start

### macOS / Linux

```bash
# From this directory:
bash install.sh

# Or specify a custom workspace:
bash install.sh /path/to/openclaw/workspace
```

### Windows (PowerShell)

```powershell
# From this directory (right-click → "Run with PowerShell"):
.\install.ps1

# Or specify a custom workspace:
.\install.ps1 -Workspace C:\path\to\openclaw\workspace
```

## What Gets Installed

| File | Purpose |
|------|---------|
| `install.sh` / `install.ps1` | One-click setup script |
| `memograph-hook.sh` | Runs on OpenClaw session start — syncs last session's memories |
| `memograph-message-hook.sh` | Message preprocessor — selectively writes important dialogue to memory |

## How Hooks Work

### Startup Hook (`memograph-hook.sh`)
On every OpenClaw session start, this hook runs `memograph sync --since-last` to pull any memories that weren't synced during the previous session. This ensures continuity even if the agent was interrupted.

### Message Hook (`memograph-message-hook.sh`)
This hook intercepts messages and writes important ones to memory using two criteria:
- **Long messages** (>100 characters): assumed to contain meaningful content
- **Trigger keywords**: Chinese/English words like 记住 (remember), 偏好 (preferences), 喜欢 (like), 不喜欢 (dislike), 习惯 (habits), 流程 (process), 配置 (config), 密码 (password), token, key

Triggered messages are written as `fact` type memories with `dialogue` source.

## Manual Setup

If you prefer to set up manually:

1. **Add MCP server** to OpenClaw config:

   ```yaml
   # ~/.openclaw/config.yaml
   tools:
     mcpServers:
       memograph:
         command: npx
         args:
           - "@mutimemoagent/mcp-server"
   ```

2. **Serve the dashboard**:

   ```bash
   npx serve dashboard/dist
   # or
   cd path/to/memograph && npx pnpm --filter @mutimemoagent/dashboard dev
   ```

3. **Run the dashboard server** (provides API for agent data):

   ```bash
   node path/to/memograph/dashboard/dist/api/server.js
   ```

## Components

- **MCP Server** (`@mutimemoagent/mcp-server`): stdio-based MCP server exposing memory_search, memory_write, symbol_search, impact_analysis, cross_agent_search, and evolution_report tools
- **Dashboard**: React-based web UI at `http://localhost:5173` (dev) or served from `dashboard/dist/`
- **CLI** (`@mutimemoagent/cli`): general-purpose CLI for managing memories
- **Hooks**: OpenClaw lifecycle hooks for auto-memory management

## Troubleshooting

- **`npx @mutimemoagent/cli init` fails**: Ensure Node.js 18+ is installed and available in PATH
- **Hooks not running**: Check that files are in `~/.openclaw/workspace/hooks/` and have execute permissions
- **Dashboard not connecting**: Make sure the API server (`server.ts`) is running on port 3456
