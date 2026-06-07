# Muti-MemoAgent — 智能体使用快速指南

> 给 AI Agent / Claude Code / Cursor / Copilot 使用的快速参考

---

## 零、接入（一行命令）

```bash
npx @mutimemoagent/cli onboard
```

自动流程：打开浏览器注册 Xiami → 获取密钥 → 自动配置 → 显示帮助。

已有密钥：
```bash
npx @mutimemoagent/cli init --xiami-key xiami_sk_xxx
```

---

## 一、日常使用（Agent 最常用的 5 个操作）

### 1. 搜索记忆（跨所有 Agent）
```bash
mutimemoagent search "认证模块怎么实现的"
mutimemoagent search --agent profile "用户的偏好"
mutimemoagent search --mode symbol "authenticateUser"
mutimemoagent search --mode impact "src/auth/login.ts"
```
→ 返回：记忆条目 + 调用链 + 跨 Agent 关联

### 2. 写入记忆
```bash
mutimemoagent memo "用户偏好使用 pnpm 管理依赖"
mutimemoagent memo --type preference "用户不喜欢 yarn"
mutimemoagent memo --agent project "新增 OAuth2 认证模块"
```

### 3. 索引代码
```bash
mutimemoagent index          # 增量索引（只解析变更文件）
mutimemoagent index --full   # 全量重建
mutimemoagent watch          # 监控文件变更，自动索引
```
→ 自动提取：函数/类/接口/导入/调用链/框架路由

### 4. 分析代码架构
```bash
mutimemoagent analyze                     # 完整认知流水线
mutimemoagent analyze --domain            # + 提取业务领域模型
mutimemoagent analyze --language zh       # 中文输出
```

### 5. 查看状态
```bash
mutimemoagent status        # 连接状态 / Agent 列表 / 记忆条数 / 本地索引
mutimemoagent check         # Xiami 配额检查
```

---

## 二、记忆操作

| 操作 | 命令 | 说明 |
|------|------|------|
| 写入 | `mutimemoagent memo "内容" -a agent -t type` | 支持 fact/preference/procedure/event/error |
| 搜索 | `mutimemoagent search "关键词"` | 穿透所有 Agent |
| 索引 | `mutimemoagent index` | 代码→符号→调用图 |
| 分析 | `mutimemoagent analyze` | 架构分层+导览+领域 |
| 进化 | `mutimemoagent evolve` | Agent 自动拆分/合并/巩固 |
| 遗忘 | `mutimemoagent forget` | 清理过期记忆 |
| 仪表盘 | `mutimemoagent dashboard` | Web UI → http://localhost:3456 |
| 监控 | `mutimemoagent watch` | 保存即同步 |

---

## 三、记忆类型速查

| 类型 | 用途 | 示例 |
|------|------|------|
| `fact` | 客观事实 | "项目使用 PostgreSQL 数据库" |
| `preference` | 用户偏好 | "用户偏好 Tailwind CSS 而非 styled-components" |
| `procedure` | 流程/习惯 | "部署流程：pnpm build → docker build → k8s apply" |
| `event` | 事件 | "2026-06-07 迁移到 Node.js 24" |
| `error` | 踩坑记录 | "Prisma 6.x migrate 与 PostgreSQL 15 不兼容" |
| `code_file` | 文件节点 | 自动生成 |
| `code_symbol` | 符号（函数/类） | 自动生成 |
| `insight` | 自动发现 | 进化引擎产出 |

---

## 四、核心架构（10 秒理解）

```
Agent 发起搜索 "支付流程"
  │
  ├─ L1: 本地 SQLite (0.5ms)        ← 热数据，毫秒返回
  │   └─ FTS5 + 向量 + 符号索引
  │
  ├─ L2: Xiami 云端 (200ms)         ← 冷数据，跨项目
  │   └─ Neo4j 图谱 + RAG 增强
  │
  └─ 返回融合结果
      ├─ 当前项目代码匹配 (70%)
      ├─ 其他项目类似实现 (20%)
      └─ 用户画像/偏好注入 (10%)
```

---

## 五、MCP Server 使用

```
工具列表 (6 个):
  memory_search       搜索记忆（跨Agent）
  memory_write        写入记忆
  symbol_search       代码符号精确搜索
  impact_analysis     变更影响分析
  cross_agent_search  跨 Agent 联合搜索
  evolution_report    获取 Agent 健康报告
```

---

## 六、记忆体体系

| 记忆体 | 用途 | 创建方式 |
|--------|------|---------|
| `profile` | 用户画像（偏好/习惯/踩坑） | `mutimemoagent init` 自动创建 |
| `mcp-registry` | MCP/Skill 注册表 | `mutimemoagent init --mcp` |
| `project-{name}` | 项目代码图谱 | `mutimemoagent init` 自动创建 |
| `domain` | 业务领域模型 | `mutimemoagent analyze --domain` |
| 自定义 | 按需创建 | Xiami 控制台或 API |

---

## 七、自动化（零人工）

| 触发方式 | 做什么 | 配置 |
|---------|--------|------|
| `git commit` | 增量索引 → 同步到 Xiami | `mutimemoagent init` 自动安装 hook |
| `git checkout` | 切换分支后重建索引 | 同上 |
| `文件保存` | 2 秒防抖后自动索引 | `mutimemoagent watch` |
| 每 6 小时 | Agent 自进化评估 | `mutimemoagent evolve` (cron) |
| 每周日 2AM | 遗忘清理周期 | `mutimemoagent forget` (cron) |
| 每周一 8AM | 跨 Agent 关系发现 | 自动 |

---

## 八、故障排查

| 问题 | 解决 |
|------|------|
| 连不上 Xiami | 自动降级离线模式，仅用本地 SQLite |
| 配额不足 | 自动打开充值页面 `https://xiami.aiznrc.com/pricing` |
| 没有密钥 | `mutimemoagent onboard` 引导注册 |
| better-sqlite3 报错 | `pnpm rebuild better-sqlite3`（需 C++ 编译工具） |
| 搜索无结果 | 先运行 `mutimemoagent index` 构建索引 |
| 想清除重来 | `mutimemoagent forget --agent profile` + `mutimemoagent init` |
