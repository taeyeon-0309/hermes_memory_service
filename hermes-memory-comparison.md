# Current Implementation vs Hermes Agent Memory

## Overview

这份文档用于对比当前仓库实现与 Hermes Agent 官方 Memory 能力的对齐情况。

对比基准主要参考：

- Hermes 官方 Persistent Memory 文档
- Hermes 官方 Prompt Assembly 文档
- 当前仓库已实现代码与测试

参考来源：

- [Persistent Memory | Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/)
- [Prompt Assembly | Hermes Agent](https://hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly)

---

## Capability Matrix

| 能力项 | Hermes 官方 Memory | 当前实现 | 对齐状态 | 说明 |
|---|---|---|---|---|
| 双存储模型 | `MEMORY.md` + `USER.md` | `MEMORY.md` + `USER.md` | 已对齐 | 当前实现保持 Hermes 的双目标设计 |
| 存储上限 | `memory=2200`，`user=1375` | `memory=2200`，`user=1375` 默认值 | 已对齐 | 与 Hermes 官方默认值一致 |
| frozen snapshot | session start 注入 system prompt，mid-session 不刷新 | `loadFromDisk()` 生成 frozen snapshot，`buildSystemPrompt()` 不自动刷新 | 已对齐 | 当前实现已具备同样语义 |
| memory tool action | `add / replace / remove` | `add / replace / remove` | 已对齐 | 无 `read` action |
| substring replace/remove | `old_text` 唯一子串匹配 | `old_text` 唯一子串匹配 | 已对齐 | 歧义时返回错误 |
| duplicate prevention | exact duplicate 不重复写入 | exact duplicate 不重复写入 | 已对齐 | 行为与 Hermes 一致 |
| live write persistence | 会话中写入立即落盘 | 写入立即落盘 | 已对齐 | 当前实现同样实时持久化 |
| tool response live state | tool 返回当前 live state | tool 返回当前 live entries / usage | 已对齐 | 虽不逐字一致，但语义一致 |
| security scanning | prompt injection / exfiltration / hidden unicode 拦截 | 同类 threat pattern + invisible unicode 拦截 | 已对齐 | 当前实现完成度较高 |
| recall context fencing | 有 recall block 概念 | `buildMemoryContextBlock()` | 已对齐 | 当前实现已可用于 prompt 注入 |
| built-in recall/query | 官方 memory 文档核心是 frozen memory，动态 recall 更多由其它层补足 | 当前实现已有 built-in deterministic recall MVP | 部分超前 / 部分偏离 | 当前实现比最小 built-in memory 更主动，但还不是 Hermes 的 `session_search` |
| dynamic recall after writes | 文档强调 frozen snapshot；更完整 history recall 由 `session_search` 承担 | 同 session 中 recall 可见新写入内容 | 部分对齐 | 当前实现明确区分 snapshot 与 recall 两层 |
| session search | 有 `session_search`，基于 SQLite + FTS + summarization | 已有 file-based `session_search` MVP，但不含 SQLite / FTS / summarization | 部分对齐 | 当前已补上 session-history retrieval 的雏形，但仍弱于 Hermes 官方实现 |
| external memory providers | 官方支持多个 provider 生态 | 仅有 provider 抽象，无真实 external provider | 部分对齐 | 架构已留口，生态未复刻 |
| provider orchestration | built-in + external 并存 | built-in + 最多一个 external | 部分对齐 | 方向一致，但功能规模更小 |
| prompt assembly memory lane | frozen MEMORY / USER 注入 + tool guidance + recall layers | `buildMemoryGuidancePrompt()` + `buildSystemPrompt()` + `buildPromptParts()` | 已对齐（memory lane） | 当前实现已覆盖 memory 相关 prompt plumbing |
| full prompt assembly | SOUL、skills、context files、timestamp、platform hint 等完整层次 | 未实现完整 prompt assembly，仅实现 memory lane | 未覆盖 | 这是宿主 Agent 层，不只是 memory 模块 |
| host integration contract | 官方更多是 runtime 内部实现 | 当前实现提供 `buildPromptParts()` 和宿主示例 | 部分超前 | 当前仓库在“可嵌入性”上其实更显式 |
| example host agent | 官方是完整 Hermes runtime | 当前仓库提供最小宿主 Agent 示例 | 部分超前 | 适合作为第三方嵌入参考 |

---

## Summary by Category

### 1. 高度对齐的部分

这些能力已经非常接近 Hermes 官方 Memory 核心机制：

- `MEMORY/USER` 双存储模型
- 默认字符上限
- frozen snapshot 语义
- `memory` tool 三个 action
- `old_text` substring matching
- duplicate prevention
- 写入即时落盘
- 写入前安全扫描
- recall context fencing

### 2. 部分对齐的部分

这些能力在设计方向上与 Hermes 相近，但规模、深度或边界仍不同：

- built-in recall/query
- provider orchestration
- external provider contract
- memory lane 的 prompt assembly

说明：

- 当前实现的 built-in recall 比最初的 Hermes local memory 更主动，但还没有 Hermes `session_search` 那种跨会话检索体系。
- 当前 `MemoryProvider` / `MemoryManager` 抽象已经很适合后续扩展，但还没有真实外部 provider 落地。

### 3. 尚未覆盖的部分

这些能力仍然不在当前实现范围内：

- conversation archive 的 Hermes-style SQLite / FTS 版本
- 多 external provider 生态
- 完整 Hermes prompt assembly（SOUL / skills / context files / timestamp / platform hint）
- 自动 memory 提炼 / 合并策略

---

## Official Description of External Memory Providers

Hermes 官方目前将 `external memory providers` 描述为：

- 用于提供超出 `MEMORY.md` 和 `USER.md` 的更深层持久记忆能力
- 与 built-in memory 并行运行，而不是替换 built-in memory
- 为 Hermes 增加：
  - knowledge graphs
  - semantic search
  - automatic fact extraction
  - cross-session user modeling

官方还明确提到 Hermes 提供了一组 external memory provider plugins，包括：

- Honcho
- OpenViking
- Mem0
- Hindsight
- Holographic
- RetainDB
- ByteRover
- Supermemory

官方对用户的操作入口是：

```bash
hermes memory setup
hermes memory status
```

对应含义：

- `hermes memory setup`：选择并配置 external memory provider
- `hermes memory status`：查看当前启用状态

参考来源：

- [Persistent Memory | Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/)

对照当前仓库实现，可以更清楚地看到：

- 当前项目已经实现了 external provider 的抽象接口与 manager 编排方向
- 但还没有真正接上 Hermes 官方所说的 external provider 生态能力
- 因此差距不在“有没有 provider 抽象”，而在“有没有 provider 实现及其高级记忆能力”

---

## Official Description of Prompt Assembly Memory Lane

Hermes 官方并没有单独把它命名为 “memory lane”，但在 Prompt Assembly 文档里，memory 相关的 prompt 机制被明确放在两类层次中描述：

1. `cached system prompt state`
2. `ephemeral API-call-time additions`

官方首先强调，Hermes 会刻意区分这两类内容，以保证：

- token usage 可控
- prompt caching 稳定
- session continuity 正确
- memory semantics 清晰

参考来源：

- [Prompt Assembly | Hermes Agent](https://hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly)

### Cached system prompt 中与 memory 最相关的层

官方列出的 cached system prompt 顺序中，和 memory 最直接相关的是：

1. tool-aware behavior guidance
2. frozen `MEMORY` snapshot
3. frozen `USER` profile snapshot

它们处于更大的 cached system prompt 顺序中：

1. agent identity
2. tool-aware behavior guidance
3. Honcho static block
4. optional system message
5. frozen `MEMORY` snapshot
6. frozen `USER` profile snapshot
7. skills index
8. context files
9. timestamp / optional session ID
10. platform hint

从 memory 模块视角理解，官方实际上是在说：

- memory 使用规则（guidance）属于稳定系统前缀
- `MEMORY` / `USER` 都属于 frozen snapshot
- 它们一起构成 Hermes prompt plumbing 中 memory 最核心的 cached 部分

### 官方对 frozen memory snapshot 的描述

官方明确说：

- local memory 和 user profile 会在 session start 作为 frozen snapshots 注入
- mid-session writes 会更新磁盘
- 但不会修改已构建好的 system prompt
- 要等新 session 或 forced rebuild 才刷新

这意味着 Hermes 的 memory snapshot 是明确的 cached prompt layer，而不是每轮动态重建。

### 官方对 recall / dynamic additions 的描述

在 `API-call-time-only layers` 里，官方列出了一些不属于 cached prompt 的动态层，例如：

- `ephemeral_system_prompt`
- prefill messages
- gateway-derived session context overlays
- later-turn Honcho recall injected into the current-turn user message

这说明 Hermes 的设计是：

- frozen memory snapshot 放在 cached lane
- 某些 recall / overlay / turn-scoped context 放在 ephemeral lane

### 对照当前仓库实现

当前仓库已经实现出一个非常接近 Hermes memory lane 的结构：

- `buildMemoryGuidancePrompt()`
  - 对应 Hermes 的 tool-aware behavior guidance
- `buildSystemPrompt()`
  - 对应 frozen `MEMORY` / `USER` snapshot
- `buildPromptParts()`
  - 对应宿主接入时对 memory-related prompt layers 的结构化抽象
- `prefetch()` + `buildMemoryContextBlock()`
  - 对应 Hermes 中 turn-scoped dynamic recall / ephemeral additions 的方向

差异在于：

- 当前实现的 dynamic recall 是 built-in deterministic recall
- Hermes 官方更完整的跨会话 recall 还包括 `session_search`、Honcho recall 等更大体系

所以更准确的总结是：

> 当前实现已经较好复刻了 Hermes Prompt Assembly 中 memory 相关的 cached lane，并补上了一个可运行的 dynamic recall 层；真正的主要差距在于 Hermes 官方更丰富的 ephemeral recall 体系和更完整的 runtime prompt assembly。

---

## Official Description of Session Search

Hermes 官方将 `session_search` 描述为：

- 一个内建工具（built-in tool）
- 用于搜索所有过去会话中的长期对话记忆
- 是对 `MEMORY.md` / `USER.md` 之外的“会话历史 recall”补充

官方文档明确说，Hermes 会自动保存每一段对话为 session，并使用两套持久化介质：

1. SQLite 数据库：`~/.hermes/state.db`
2. JSONL transcripts：`~/.hermes/sessions/`

其中 SQLite 用于：

- 结构化 session metadata
- FTS5 full-text search
- 支撑 `session_search`

参考来源：

- [Sessions | Hermes Agent](https://hermes-agent.nousresearch.com/docs/zh-Hans/user-guide/sessions)
- [Persistent Memory | Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/)
- [Tools Reference | Hermes Agent](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/tools-reference.md)

### 官方对 `session_search` 工作方式的描述

官方文档给出的工作流程是：

1. FTS5 对过去消息做 full-text 检索，并按相关性排序
2. 按 session 分组，取 top N 个唯一 session（默认 3）
3. 加载每个 session 的会话内容，并围绕命中位置截取约 `100K` 字符上下文
4. 发送给一个快速 summarization model 做聚焦总结
5. 返回带 metadata 和周边上下文的 session-level summaries

也就是说，Hermes 的 `session_search` 不是简单的“grep 历史聊天”，而是：

- 先做全文检索
- 再做 session 粒度聚合
- 再做模型总结

### 官方对 `session_search` 使用时机的描述

官方明确提示模型应主动使用它：

> “When the user references something from a past conversation or you suspect relevant prior context exists, use session_search to recall it before asking them to repeat themselves.”

这说明在 Hermes 体系里：

- `memory` 负责小而稳定、人工 curate 的长期事实
- `session_search` 负责跨历史会话的回忆与找回

### 官方对 `session_search` 与 persistent memory 的区分

官方文档明确区分了两者：

- Persistent Memory
  - 小
  - curated
  - stable
  - 固定注入 prompt
- Session Search
  - 面向完整历史会话
  - 全文搜索
  - 用于 recall past conversations
  - 不等同于 `MEMORY.md` / `USER.md`

因此，Hermes 的记忆体系不是只有一层，而是至少有两层：

1. curated persistent memory
2. searchable session history

### 对照当前仓库实现

当前仓库已经具备 `session_search` MVP，但尚未覆盖 Hermes 官方 `session_search` 的关键增强能力：

- 没有 SQLite session store
- 没有 FTS5 检索
- 没有 summarization-based recall
- 没有更完整的 metadata / ranking pipeline

当前仓库已经实现的 `session_search` MVP 具备：

- file-based transcript archive
- session-level grouping
- `session_search` tool
- deterministic query matching
- lightweight contextual summary

当前仓库已有的 built-in memory recall：

- 只在 `MEMORY.md` / `USER.md` 内做 deterministic recall
- 不等价于 `session_search`

所以这里的差距很明确：

- 当前实现已经有 memory-layer recall
- 也已经有 `session_search` 的 MVP 原型
- 但仍没有 Hermes 官方那套 SQLite + FTS + summarization 的完整 session-history retrieval system

更准确地说：

> 当前实现已经复刻了 Hermes curated memory 核心，并补上了 `session_search` 的 MVP 雏形；现在与 Hermes 官方的主要差距，已经从“有没有 session_search”变成了“session_search 的底层与检索质量是否达到 Hermes 官方规模”。

---

## Practical Positioning

如果只对标 **Hermes 的 built-in local memory subsystem**，当前实现已经具备很高相似度：

- 约 `80%~90%` 对齐

如果对标 **Hermes Memory 全量能力**（包含 `session_search`、external providers、完整 prompt assembly）：

- 约 `50%~60%` 对齐

---

## Best One-Line Summary

> 当前实现已经比较完整地复刻了 Hermes Agent 的 built-in memory 核心语义，并在宿主接入 contract 上做得更显式；真正的主要差距集中在 `session_search`、external provider 生态，以及完整 runtime prompt assembly。

---

## Suggested Next Gap If Continuing

如果后续还想继续向 Hermes 官方能力靠拢，最优先的缺口是：

1. `session_search` / conversation history retrieval
2. 至少一个真实可用的 external memory provider
3. 更完整的宿主 prompt assembly 上下文层
