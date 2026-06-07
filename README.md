<p align="center">
  <h1 align="center">Muti-MemoAgent 🧠</h1>
  <p align="center"><strong>The Self-Evolving Memory Layer for AI Agents</strong></p>
  <p align="center">Auto-index code · Extract user profiles · Discover hidden connections · Self-evolve</p>
</p>

<p align="center">
  <a href="./README_zh.md">中文文档</a> ·
  <a href="./AGENTS.md">Agent Guide</a> ·
  <a href="https://xiami.aiznrc.com">Cloud Platform</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Language-TypeScript-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-Custom-orange" alt="License" />
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen" alt="PRs Welcome" />
</p>

---

## ✨ What It Does

Muti-MemoAgent is a **self-evolving memory system** for AI agents. Install it once — it watches your code, learns your preferences, connects project knowledge, and gets smarter every day.

| Before | After |
|---|---|
| "What does our auth system look like?" → Agent reads 47 files | Agent queries memory → instant answer with call chains |
| Switch from yarn to pnpm → Agent keeps suggesting yarn | Profile auto-detects change → suggests pnpm |
| 10 projects, zero shared knowledge | Cross-agent graph links auth in Project A to auth in Project B |
| Memory piles up forever | Forgetting engine keeps only what matters |

---

## 🚀 Quickstart

### One Command

```bash
git clone https://github.com/ping/Muti-MemoAgent.git
cd Muti-MemoAgent && pnpm install
# → Browser opens → Register on Xiami → Get API key
npx mutimemoagent init --xiami-key xiami_sk_xxx
```

### Daily Use

```bash
mutimemoagent onboard                              # First-time setup wizard
mutimemoagent init --xiami-key xiami_sk_xxx        # Initialize project
mutimemoagent index && mutimemoagent analyze            # Index + understand code
mutimemoagent search "payment flow"                 # Search memories
mutimemoagent memo "deploy: docker → k8s"           # Save a memory
mutimemoagent watch                                 # Auto-sync on save
mutimemoagent dashboard                             # Visual graph
```

### For AI Agents

```bash
mutimemoagent onboard
mutimemoagent search "authentication implementation"
mutimemoagent memo "user prefers pnpm over npm" --type preference
```

---

## 📦 Deployment Options

| | Library | Self-Hosted | Cloud |
|---|---|---|---|
| **Best for** | Local dev, testing | Team infrastructure | Zero-ops production |
| **Setup** | `pnpm install` | `pnpm install` + Xiami account | [app.xiami.aiznrc.com](https://xiami.aiznrc.com) |
| **Storage** | SQLite (local) | SQLite + Xiami API | Xiami (Neo4j + RAG) |
| **Multi-Project** | Manual | ✅ Automatic | ✅ Automatic |
| **Cross-Agent** | — | ✅ Discovery engine | ✅ Discovery + Evolution |

---

## 🔧 Key Features

| Feature | What | Impact |
|---|---|---|
| 🧠 **Auto-Ingest** | Git hooks + file watch + dialogue sampling | Zero-effort memory capture |
| 👤 **User Profile** | Auto-extract preferences, habits, lessons | AI knows you without forms |
| 🔍 **Code Index** | 20+ languages, call graphs, FTS5 search | 58% fewer tool calls* |
| 🤝 **Cross-Agent** | Auto-discover hidden project links | One search finds all related code |
| 🌱 **Self-Evolution** | Split, merge, consolidate agents | Memory organizes itself |
| 🧹 **Forgetting** | Time-decay + dream consolidation | Stays lean automatically |
| 🧪 **Cognitive** | 7-agent analysis pipeline | Architecture maps + guided tours |

---

## 🎯 Use Cases

| Scenario | How It Helps |
|---|---|
| **AI Coding Agents** (Claude Code, Cursor, Copilot) | Pre-indexed code graph → instant answers, token savings |
| **Multi-Project Teams** | Cross-project knowledge sharing → no reinventing |
| **Onboarding** | Guided tours + architecture maps → ramp up in hours |
| **Personal AI Assistant** | Profile auto-learns preferences → personalized responses |
| **Knowledge Management** | Wiki analysis → force-directed knowledge graphs |

---

## 🏗️ Architecture

```
Search "payment" → Local SQLite (0.5ms) + Xiami Cloud (200ms) → Merged results
```

| Layer | Role | Latency |
|---|---|---|
| L1: Local SQLite | Current project, always available | <1ms |
| L2: Xiami Cloud | All projects, profiles, relations | ~200ms |
| Evolution Engine | Nightly auto-optimize agent structure | Scheduled |
| Cognitive Pipeline | On-demand deep code analysis | Per analysis |

---

## 📋 Commands

```
onboard     First-time setup (register → key → configure)
init        Initialize project, auto-create agents
index       Index code into searchable memory
analyze     Run cognitive analysis pipeline
search      Search across all agents
memo        Save a memory entry
watch       Auto-index on file save
evolve      Trigger self-evolution
forget      Clean stale memories
status      Connection & agent health
check       Cloud quota check
dashboard   Open visual graph UI
```

---

## 📄 License

Copyright © 2026 Muti-MemoAgent Contributors. See [LICENSE](./LICENSE).

<p align="center">
  <sub>*Based on CodeGraph benchmark: 16% cheaper, 58% fewer tool calls, 22% faster</sub>
</p>
