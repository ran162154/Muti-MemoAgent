# @mutimemoagent/mcp-server

MCP (Model Context Protocol) server for Multi-MemoAgent. Exposes Memograph's memory tools to any MCP-compatible client (Claude Desktop, VS Code extensions, Cursor, OpenClaw, etc.).

## Tools

| Tool                | Description                                                |
|---------------------|------------------------------------------------------------|
| `memory_search`     | Query the knowledge base with semantic or text search      |
| `memory_write`      | Write a new memory entry to an agent                       |
| `symbol_search`     | Find code symbols (functions, classes, types)              |
| `impact_analysis`   | Analyze downstream impact of changing a code symbol        |
| `cross_agent_search`| Search across all agents for relevant memories             |
| `evolution_report`  | Get evolution status and fitness scores                    |

## Usage

### Direct invocation

```bash
npx @mutimemoagent/mcp-server
```

### With auto-init

```bash
AUTO_INIT=1 npx @mutimemoagent/mcp-server
```

## MCP Client Registration

### OpenClaw

Add to your `~/.openclaw/config.yaml` or OpenClaw settings:

```yaml
tools:
  mcpServers:
    memograph:
      command: npx
      args:
        - "@mutimemoagent/mcp-server"
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "memograph": {
      "command": "npx",
      "args": ["@mutimemoagent/mcp-server"]
    }
  }
}
```

### Cursor

In Cursor settings → Features → MCP Servers:

```
Name: memograph
Type: command
Command: npx @mutimemoagent/mcp-server
```

### VS Code (w/ MCP extension)

```json
{
  "mcp.servers": {
    "memograph": {
      "command": "npx",
      "args": ["@mutimemoagent/mcp-server"]
    }
  }
}
```

## Development

```bash
# Build
pnpm build

# Output goes to dist/
# Run locally
node ./dist/index.js
```

## Architecture

The server uses the `@modelcontextprotocol/sdk` stdio transport. Backend wiring is provided via `setWiring()` for runtime integration with actual memory stores. When no wiring is set, tools return empty results with descriptive messages.

## License

See LICENSE in repository root.
