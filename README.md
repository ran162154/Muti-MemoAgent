# Muti-MemoAgent 🧠

> Multi-Agent Memory Self-Evolution Network — memories that grow on their own.

[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)]()

[中文文档 →](./README_zh.md)

---

## What is it?

Muti-MemoAgent gives your AI agents a **self-growing memory system**. It watches your code, listens to your conversations, and automatically builds a knowledge graph that gets smarter over time — without you doing anything.

**It's like giving your AI a long-term memory that organizes itself.**

---

## Why?

| Pain Point | How Muti-MemoAgent Solves It |
|---|---|
| 🐌 AI re-explains your code from scratch every session | Auto-indexes code once → symbols, call chains, and search instantly available forever |
| 🏝️ Knowledge from different projects never connects | Cross-agent graph discovers that "auth in Project A" is the same pattern as "auth in Project B" |
| 🗑️ Memory piles up endlessly, never cleaned | Forgetting engine auto-cleans stale memories, keeps only what matters |
| 🧩 Each AI agent works in isolation | Self-evolution network splits, merges, and migrates knowledge between agents |
| 👶 New team members can't navigate the codebase | Cognitive pipeline generates guided tours — learn the codebase in dependency order |

---

## Features

### 🧠 Auto-Ingest — Zero Effort Memory

**What it does:** Catches everything automatically — git commits, file saves, conversations. Filters noise, removes duplicates, detects conflicts, then routes content to the right memory agent.

**Effect:** After `memograph init`, you literally do nothing. Every time you code or talk, relevant knowledge is captured.

**Why better:** Unlike manual note-taking, you don't decide what's important — the system does. 5-stage pipeline ensures only meaningful content is stored.

---

### 👤 User Profile — Knows You

**What it does:** Extracts your preferences, habits, workflows, and lessons learned from conversations and code patterns. No forms, no manual input.

**Effect:** When you ask "how should I deploy this?", the agent already knows you use Docker + k8s, not Vercel.

**Why better:** Profiles evolve automatically. If you switch from yarn to pnpm, it detects the change — no need to update settings.

---

### 🔍 Code Intelligence — Understands Your Code

**What it does:** Parses 20+ languages into a searchable knowledge graph. Finds functions, classes, call chains, framework routes, and cross-language bridges.

**Effect:** Search "how does payment work?" → returns the exact functions, their callers, their dependencies, and similar implementations in your other projects.

**Why better:** AI agents spend 58% fewer tool calls understanding code. No more reading 50 files to find one handler.

---

### 🤝 Cross-Agent Collaboration — Projects Talk to Each Other

**What it does:** Automatically discovers hidden relationships between different memory agents. If Profile says "prefers pnpm" and Project A uses pnpm, it links them.

**Effect:** Search "authentication module" → sees your implementation in Project A, a similar pattern in Project B, and your Auth0 preference from Profile — all in one result.

**Why better:** Multi-hop reasoning finds chains like A→B→C even when no direct connection exists. Knowledge emerges across silos.

---

### 🌱 Self-Evolution — Gets Smarter Over Time

**What it does:** Evaluates every memory agent's health across 4 dimensions. Automatically splits bloated agents, merges overlapping ones, consolidates short-term into long-term memory.

**Effect:** A project that starts with 1 agent might evolve into 3 specialized agents (API, Database, Frontend) — automatically, based on actual usage patterns.

**Why better:** Competition mechanism: if two agents cover the same domain, they compete on real queries. The winner survives, the loser's knowledge is merged in.

---

### 🧹 Forgetting Engine — Remembers What Matters

**What it does:** Applies time decay, importance scoring, and dream consolidation. Stale, low-importance memories fade. High-value memories get reinforced.

**Effect:** Your memory bank stays lean. After 3 months, only ~20% of original entries remain — the valuable 20%.

**Why better:** Unlike a database that only grows, this mimics human memory. The system runs a nightly "dream" cycle that distills low-score entries into summaries before removing them.

---

### 🧪 Cognitive Pipeline — Makes Code Readable

**What it does:** Runs 7 specialized AI agents that analyze code structure, identify architectural layers, extract business domains, and build guided learning tours.

**Effect:** A new developer runs `memograph analyze` and gets: a layered architecture map, a step-by-step onboarding tour, and a domain model showing how code maps to business processes.

**Why better:** Three audience modes — Junior devs get explanations with code snippets. PMs get high-level domain flows. Senior devs get architectural decision trade-offs.

---

## Quick Start

### One-command onboard (recommended)

```bash
git clone https://github.com/ran162154/Muti-MemoAgent.git
cd Muti-MemoAgent
pnpm install
# → Auto-opens browser to xiami.aiznrc.com/register
# → Guides you through key setup
# → Then just run:
npx memograph init --xiami-key xiami_sk_xxx
```

### For AI Agents

```bash
# First time
memograph onboard

# Initialize a project
memograph init --xiami-key xiami_sk_xxx

# Index & analyze
memograph index && memograph analyze

# Search anything
memograph search "payment flow implementation"
```

### For Humans

```bash
memograph init --xiami-key xiami_sk_xxx    # One-time setup
memograph index                              # Index your code
memograph analyze                            # Understand architecture
memograph search "authentication"           # Find anything
memograph memo "deploy: docker → k8s"        # Save a memory
memograph watch                              # Auto-sync on save
memograph dashboard                          # Visual graph UI
```

### All Commands

```
onboard     First-time setup wizard (register → key → configure)
init        Initialize project & auto-create memory agents
index       Index codebase into searchable memory
analyze     Run cognitive analysis pipeline
search      Search across all memory agents
memo        Manually save a memory entry
watch       Auto-index on every file save
evolve      Trigger self-evolution cycle
forget      Clean stale memories
status      Show connection & agent health
check       Check cloud quota
dashboard   Open visual knowledge graph
```

---

## Architecture (simplified)

```
Every search hits two layers simultaneously:

  L1 — Local SQLite (0.5ms)
  → Your current project, always available, zero latency

  L2 — Xiami Cloud (200ms)
  → All your projects, user profile, cross-agent links

  Results merged & ranked by relevance
```

---

## License

Copyright © 2026 Muti-MemoAgent Contributors. See [LICENSE](./LICENSE).

---

<p align="center">
  <em>Memories that don't just store — they think, connect, and evolve.</em>
</p>
