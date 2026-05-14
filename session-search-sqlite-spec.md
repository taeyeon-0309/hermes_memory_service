# Session Search SQLite / FTS Spec

## Status

当前状态：

- 本文档定义 SQLite / FTS 升级目标
- 当前仓库已存在 `SQLiteSessionRepository` 首版实现
- 当前实现已覆盖 archive / FTS search / host backend switch 的基础路径
- 当前实现已开始支持 `source / user_id` metadata 写入与回传
- 当前实现已开始支持宿主显式传入 `title`
- 当前实现已开始支持 ranking refinement 与基础 context slice improvement
- 当前实现已开始支持 excerpt 中的低价值噪声消息裁剪
- 更高阶的 title / excerpt 质量与文档同步仍待继续

## 1. Purpose

本规格用于定义 `session_search` 从 file-based MVP 升级到 SQLite / FTS backend 的目标结构与行为。

---

## 2. Backend Contract

新 backend 继续实现：

```ts
interface SessionRepository {
  appendEntries(sessionId: string, entries: SessionTranscriptEntry[]): Promise<void>;
  loadSession(sessionId: string): Promise<SessionTranscript>;
  search(query: string, options?: SessionSearchOptions): Promise<SessionSearchResult[]>;
}
```

也就是说，宿主和 service 层不应因 backend 升级而修改公开接口。

---

## 3. Storage Layout

### 3.1 Path

建议：

- `${baseDir}/sessions/state.db`

### 3.2 Tables

#### `sessions`

首版必需：

- `session_id TEXT PRIMARY KEY`
- `updated_at TEXT NOT NULL`

首版建议支持：

- `source TEXT NULL`
- `user_id TEXT NULL`

预留字段：

- `title TEXT NULL`

下一阶段实现重点：

- `source`
- `user_id`

当前建议：

- 先把 `source / user_id` 从“建议支持”推进为“实际写入”
- `title` 目前采用轻量版支持：宿主可显式传入，但不做自动生成

#### `messages`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `session_id TEXT NOT NULL`
- `idx INTEGER NOT NULL`
- `timestamp TEXT NOT NULL`
- `role TEXT NOT NULL`
- `content TEXT NOT NULL`

#### `messages_fts`

建议：

- FTS5 virtual table
- 索引 `content`
- 与 `messages.rowid` 对齐

---

## 4. Search Behavior

### 4.1 Query Flow

1. 对 `messages_fts` 执行 FTS query
2. 获取 message hits
3. 按 `session_id` 聚合
4. 每个 session 选最佳命中
5. 读取命中附近上下文
6. 生成 summary
7. 返回 top N session results

### 4.2 Supported Query Scope

首版仅保证：

- 普通关键词 query
- quoted phrase query

首版不要求：

- Boolean 逻辑组合
- `NEAR`
- 复杂嵌套 FTS 表达式
- 拼写纠错 / 查询改写

### 4.3 Output

```ts
interface SessionSearchResult {
  sessionId: string;
  score: number;
  updatedAt: string;
  summary: string;
}
```

这里的 `summary` 在本轮升级中明确指：

- 命中 message 附近上下文窗口的规则化摘录
- 而不是模型生成摘要

### 4.4 Next Upgrade Focus

在 SQLite / FTS 首版完成后，下一轮建议重点推进：

1. metadata enrichment
2. ranking refinement
3. context slice improvement

它们之间的依赖关系是：

- metadata enrichment 为 ranking 提供更多信号
- ranking refinement 先提升命中结果质量
- context slice improvement 再提升结果展示质量

### 4.5 Migration Default

本轮升级默认采用：

- SQLite 作为默认 backend
- file-based backend 保留为 fallback / 测试用途
- 不做双写

---

## 5. MVP Upgrade Constraints

本轮升级仍然不要求：

- 模型摘要
- cross-session semantic retrieval
- ACL
- pruning
- gateway transcript compatibility

---

## 6. Acceptance

至少满足：

1. archive 数据可落入 SQLite
2. FTS query 可返回结果
3. 结果按 session 聚合
4. 宿主 Agent 不需改 public tool loop
