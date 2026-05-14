# Session Search SQLite / FTS Upgrade Plan

## Status

当前状态：

- SQLite / FTS 升级规划已建立
- `SQLiteSessionRepository` 已有首版实现
- 示例宿主 Agent 默认 backend 已切到 SQLite
- `source / user_id` 的 metadata enrichment 已开始落地
- 轻量版 `title` metadata 已开始落地
- ranking refinement 已开始落地
- context slice improvement 已开始落地
- context slice 的噪声消息裁剪规则已开始落地
- 当前处于 Phase A / Phase B 已开始落地、Phase C 以后仍待继续的状态

## 1. Goal

当前 `session_search` 已有 file-based MVP。下一阶段的目标是把它升级为更接近 Hermes 官方能力模型的 backend：

- SQLite metadata store
- FTS full-text search
- session-level grouping
- transcript slice loading

一句话概括：

> 把当前基于 JSON transcript 扫描的 `session_search` MVP，升级为一个更可扩展、更高性能、结构更接近 Hermes 官方实现的 SQLite / FTS 检索层。

---

## 2. Why Upgrade

当前 file-based MVP 已经能证明能力链路成立，但有明显上限：

- 搜索要扫所有 session 文件
- 没有倒排索引
- 无法有效支撑更大规模历史
- ranking 只能靠自定义字符串匹配
- 不利于未来扩展更丰富的 metadata filters

Hermes 官方 `session_search` 的关键差异在于：

- session metadata 存在 SQLite
- message content 使用 FTS5
- 检索后按 session 聚合
- 再围绕命中位置加载上下文

因此，升级的重点不是“再做一个新的工具”，而是替换底层检索基础设施。

---

## 3. Scope

### 3.1 In Scope

本轮升级覆盖：

- SQLite session repository
- message table + FTS table
- archive path 切换策略
- FTS query execution
- session-level grouping and ranking
- transcript slice loading
- tests and docs

### 3.2 Out of Scope

本轮先不做：

- summarization model
- full Hermes `state.db` schema 复刻
- gateway transcript JSONL 完整兼容
- advanced query parser beyond SQLite FTS syntax
- pruning / retention policy automation

---

## 4. Recommended Architecture

建议在 `src/session-search/` 下新增 SQLite backend，而不是直接替换 file backend。

推荐目录：

```text
src/session-search/
  session-repository.ts
  file-session-repository.ts
  sqlite-session-repository.ts
  session-search-service.ts
  sqlite/
    schema.ts
    migrations.ts
```

`SessionSearchService` 继续只依赖 `SessionRepository` 抽象。

这样可以保留：

- file-based MVP
- SQLite backend

两条实现并存，方便迁移、对照和回退。

---

## 5. Storage Target

### 5.1 Database Path

建议：

- `${baseDir}/sessions/state.db`

而不是直接写到 memory 的 `memories/` 目录中。

### 5.2 Core Tables

MVP 升级建议至少包含：

#### `sessions`

字段建议：

首版必需：

- `session_id`
- `updated_at`

首版建议支持：

- `source`
- `user_id`

预留字段：

- `title`

#### `messages`

字段建议：

- `id`
- `session_id`
- `idx`
- `timestamp`
- `role`
- `content`

#### `messages_fts`

建议使用 FTS5：

- 索引 `content`
- 可关联 `messages.rowid`

---

## 6. Search Flow

建议升级后的 `search()` 流程：

1. 对 query 执行 FTS full-text search
2. 按 relevance 拿到 message hits
3. 按 `session_id` 聚合
4. 每个 session 选最佳 hit 作为代表
5. 读取该 session 附近上下文窗口
6. 生成 lightweight summary
7. 返回 top N sessions

MVP 升级版仍可不引入模型摘要，只做规则化 summary。

首版查询语法建议明确收敛为：

- 普通关键词 query
- quoted phrase query

首版不承诺：

- Boolean 组合
- `NEAR`
- 复杂嵌套 FTS 表达式
- 查询改写 / 拼写纠错

---

## 7. Migration Strategy

建议不要“一步切换”，而是分阶段：

### Phase 1

- 引入 `SQLiteSessionRepository`
- 保持 file-based repository 不删
- 新测试覆盖 SQLite backend

### Phase 2

- 让 `SessionSearchService` 可通过构造参数选择 backend
- 示例宿主 Agent 默认切到 SQLite backend

### Phase 3

- 如有需要，再决定是否保留 file backend 作为 fallback

### Default Migration Strategy

为保持迁移边界清晰，建议本轮明确采用：

- SQLite 作为默认 backend
- file-based backend 保留为 fallback / test fixture
- 本轮不做双写

这样可以降低：

- archive 源数据歧义
- 排障复杂度
- 宿主接线的不确定性

---

## 8. Delivery Phases

### 8.1 Phase A: Repository and Schema

目标：

- 实现 SQLite repository
- 自动初始化 schema
- 支持 archive message rows

当前状态：

- 已开始实现

### 8.2 Phase B: FTS Search

目标：

- 用 FTS 做 message retrieval
- 支持按 session 聚合
- 保留 top N 限制

当前状态：

- 已开始实现

### 8.3 Phase C: Context Slice Reconstruction

目标：

- 从命中 message 附近恢复上下文窗口
- 形成 lightweight contextual excerpt

这里的 `summary` 在本轮中应理解为：

- 命中附近上下文的规则化摘录
- 而不是模型生成摘要

当前状态：

- 已有基础版本
- 噪声消息裁剪规则已开始实现

### 8.4 Phase D: Host Integration Switch

目标：

- 示例宿主 Agent 切换到 SQLite backend
- 保证 tool loop 不变

当前状态：

- 已开始实现

### 8.5 Phase E: Docs / Comparison Update

目标：

- README 更新
- comparison 文档把 `session_search` 从 file-based MVP 提升到 SQLite/FTS tier

### 8.6 Phase F: Metadata Enrichment

目标：

- 真正写入 `source`
- 真正写入 `user_id`
- 明确 `title` 是否本轮落地或继续保留为预留字段

建议顺序：

1. schema 字段启用
2. archive 写入链路补 metadata
3. search result 回传 metadata

为什么优先：

- 它是 ranking refinement 的前置条件
- 也是未来多用户 / 多来源隔离的基础

当前状态：

- 已开始实现
- 轻量版 `title` 已支持宿主显式传入

### 8.7 Phase G: Ranking Refinement

目标：

- 不只依赖 FTS `bm25`
- 引入 recency boost
- 引入 metadata-based boost

建议首版 ranking 结构：

1. FTS relevance
2. recency boost
3. source / user match boost

为什么第二个做：

- 先保证“搜对”
- 再决定“展示什么”

当前状态：

- 已开始实现

### 8.8 Phase H: Context Slice Improvement

目标：

- 不再只是机械窗口摘录
- 对多命中点做更稳定的 excerpt 合并
- 控制 excerpt 最大长度
- 视情况跳过低价值噪声消息

为什么最后做：

- 它建立在 metadata 和 ranking 已更稳的前提上
- 否则只是把可能还没排对的结果包装得更好看

当前状态：

- 已开始实现

---

## 9. Acceptance Goals

升级完成后，至少满足：

1. session archive 可写入 SQLite
2. 可通过 FTS 搜索历史消息
3. 返回结果按 session 聚合
4. 宿主无须改 tool loop 仍可使用 `session_search`
5. file-based MVP 可以作为对照或 fallback 保留

在继续推进下一阶段时，建议按以下顺序实施：

1. metadata enrichment
2. ranking refinement
3. context slice improvement

---

## 10. End State

完成后，`session_search` 的状态应从：

- file-based MVP

升级为：

- SQLite-backed searchable session history
- FTS-powered retrieval
- 更接近 Hermes 官方 `session_search` 的 backend architecture
