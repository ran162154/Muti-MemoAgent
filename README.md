# Muti-MemoAgent 🧠

> 多智能体记忆体自进化网络 — 让记忆学会自己成长。
>
> Multi-Agent Memory Self-Evolution Network — memories that grow on their own.

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)]()

---

## What is it? / 这是什么？

**EN:** Muti-MemoAgent is a multi-agent memory system. It automatically indexes your code, extracts your preferences from conversations, discovers hidden relationships between projects, and self-evolves by splitting, merging and consolidating memories. Think of it as a **self-growing brain for your AI agents**.

**ZH:** Muti-MemoAgent 是一个多智能体记忆系统。自动索引代码、从对话中提取画像、发现项目间的隐藏关联、并自我进化（拆分/合并/巩固记忆）。**就是给 AI Agent 装一个会自己长大的人。**

---

## Why? / 为什么需要？

| Problem / 痛点 | Solution / 解法 |
|---|---|
| AI Agent 每次都重新理解代码 | CodeGraph 引擎预索引 → 符号 + 调用链 + FTS5 搜索 |
| 不同项目的记忆互不相通 | Cross-Agent 图谱 → 自动发现跨项目关联 |
| 记忆越存越多，从不清理 | 遗忘引擎 → 时间衰减 + 重要性评分 + 梦境巩固 |
| Agent 之间知识孤立 | 自进化网络 → 拆分/合并/迁移/竞争 |
| 新成员入职看不懂项目 | 认知流水线 → 架构分层 + 引导式导览 |

---

## Core Features / 核心功能

### 🧠 Memory Intelligence / 记忆智能

| Feature | Description |
|---|---|
| **Auto-Ingest 自动接入** | 5-stage pipeline: filter → dedup → conflict check → route → write |
| **User Profile 用户画像** | Auto-extract facts/preferences/procedures from conversations |
| **Code Indexing 代码索引** | 20+ languages, symbol extraction, call graph, FTS5 search |
| **Forgetting Engine 遗忘引擎** | Time-decay + importance scoring + dream consolidation |
| **Conflict Detection 冲突检测** | "likes TS" vs "dislikes TS" → flagged for resolution |

### 🤝 Multi-Agent Collaboration / 多智能体协作

| Feature | Description |
|---|---|
| **Cross-Agent Graph 跨Agent图谱** | Weighted directed graph connecting all memory agents |
| **Relation Discovery 关系发现** | NER + LLM inference + multi-hop reasoning (A→B→C → A→C) |
| **Collaborative Search 协作搜索** | One query searches primary + related + profile + MCP registry |

### 🌱 Self-Evolution / 自进化

| Feature | Description |
|---|---|
| **Fitness Evaluation 适应度评估** | 4-dimension scoring: quality + utility + activity + collaboration |
| **5 Mutation Ops 5种变异** | Split / Merge / Reorganize / Consolidate / Migrate |
| **Competition 竞争选择** | Agents covering same domain compete → weakest archived |

### 🧪 Cognitive Analysis / 认知分析

| Feature | Description |
|---|---|
| **7-Agent Pipeline** | Scanner → FileAnalyzer → Architecture → Tour → Reviewer → Domain → Article |
| **Architecture Layers** | 7 layers auto-detected: API / Service / Data / UI / Utility / Config / Test |
| **Guided Tours 引导导览** | 3 audiences: Junior / PM / Power User |
| **Domain Modeling** | 14 predefined domains + business flow extraction |

---

## Quick Start / 快速开始

### For AI Agents / 给 AI Agent 用

```bash
# 1. First-time setup (opens browser for registration)
npx @memograph/cli onboard

# 2. Initialize a project
cd your-project
memograph init --xiami-key xiami_sk_xxx

# 3. Index & analyze
memograph index && memograph analyze

# 4. Search across all memories
memograph search "authentication flow"

# 5. Write a memory
memograph memo "user prefers pnpm over npm" --type preference

# 6. Auto-sync on every git commit (hooks installed automatically)
git commit -m "add feature"
```

### For Humans / 给人用

```bash
# 安装 / Install
npm install -g @memograph/cli

# 初始化 / Initialize
cd my-project
memograph init --xiami-key xiami_sk_xxx
# → 自动创建: profile / mcp-registry / project-{name} 三个记忆体

# 索引代码 / Index code
memograph index          # 增量索引
memograph index --full   # 全量重建

# 分析架构 / Analyze
memograph analyze              # 认知流水线
memograph analyze --domain     # + 业务领域提取
memograph analyze --language zh # 中文输出

# 搜索 / Search
memograph search "支付流程"
memograph search --mode symbol "authenticateUser"
memograph search --mode impact "src/auth/login.ts"

# 写记忆 / Write memory
memograph memo "部署流程: build → docker → k8s"
memograph memo --type preference "用户喜欢 tailwind"

# 监控模式 / Watch mode
memograph watch           # 文件保存即自动索引

# 进化 / Evolve
memograph evolve           # 自动拆分/合并/巩固 Agent
memograph forget            # 清理过期记忆

# 仪表盘 / Dashboard
memograph dashboard        # http://localhost:3456

# 检查配额 / Check quota
memograph check             # Xiami 余额查询
```

### All Commands / 全部命令

```
init          Initialize project & create memory agents
onboard       First-time setup: register → get key → configure
index         Index codebase into memory
analyze       Run cognitive analysis pipeline
search        Search across all memory agents
memo          Manually write a memory entry
watch         Auto-index on file changes
evolve        Run evolution cycle (split/merge/consolidate)
forget        Run forgetting cycle (decay & prune)
status        Show connection & agent status
check         Check Xiami quota & balance
dashboard     Start web dashboard
trigger       Manually trigger events
```

---

## Architecture / 架构

```
Agent Query "支付流程"
  │
  ├─ L1: Local SQLite (0.5ms) ─── FTS5 + Vector + Symbol index
  │   → Current project code matches (70% weight)
  │
  ├─ L2: Xiami Cloud (200ms) ─── Neo4j Graph + RAG
  │   → Cross-project similarities (20%)
  │   → User profile/preferences (10%)
  │
  └─ Merged & ranked results
```

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Indexer    │  │   Ingest     │  │  Cognitive   │
│  Code→Graph  │  │ Text→Memory  │  │ Code→Insight  │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ Tree-sitter  │  │ SignalFilter │  │ 7-Agent Pipe │
│ 20+ Lang     │  │ Dedup/Route  │  │ Architecture │
│ FTS5 Search  │  │ 5 Extractors │  │ Guided Tours │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       └─────────────────┼─────────────────┘
                         ▼
              ┌─────────────────────┐
              │    Memory Store      │
              │  L1 Local + L2 Cloud │
              └──────────┬──────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  ┌──────────┐   ┌────────────┐   ┌────────────┐
  │Evolution │   │Collaboration│   │  Search     │
  │ Engine   │   │  Network    │   │  Layer      │
  ├──────────┤   ├────────────┤   ├────────────┤
  │ Fitness  │   │ Cross-Agent│   │ FTS5+Vector │
  │ Mutate   │   │ NER+Infer  │   │ +Symbol     │
  │ Compete  │   │ Multi-Hop  │   │ +Graph      │
  └──────────┘   └────────────┘   └────────────┘
```

---

## Tech Stack / 技术栈

| Layer | Tech |
|---|---|
| Language | TypeScript (monorepo) |
| Package Manager | pnpm workspace |
| Code Parsing | Tree-sitter + regex extractors |
| Local Storage | SQLite + FTS5 + better-sqlite3 |
| Cloud Storage | Xiami API (Neo4j + Memory + RAG) |
| CLI | Commander.js |
| Dashboard | React + Vite |
| MCP Server | @modelcontextprotocol/sdk |

---

## License / 许可证

Copyright © 2026 Muti-MemoAgent Contributors. All rights reserved.

See [LICENSE](./LICENSE) for details.

---

<p align="center">
  <em>Memories that don't just store — they think, connect, and evolve.</em><br>
  <em>记忆不只是存储 — 它们会思考、关联、进化。</em>
</p>
