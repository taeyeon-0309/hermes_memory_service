# Session Search Spec

## Status

当前状态：

- 本文档为 V3 MVP 规格说明
- 当前仓库已存在 `session_search` MVP 原型实现
- 当前实现已覆盖：
  - file-based transcript archive
  - session-level search
  - `session_search` tool schema + executor
  - host-agent example wiring
- 当前仍需继续补齐文档同步与更高阶 Hermes 对齐能力

## 1. Purpose

`session_search` 用于搜索过去会话中的对话历史，并将结果以 session-level recall 的形式提供给宿主 Agent 或模型。

它补足的是：

- `MEMORY.md` / `USER.md` 之外的历史会话找回能力

它不替代：

- curated persistent memory

---

## 2. Relationship to Memory

系统中应区分两层能力：

### 2.1 Persistent Memory

特点：

- curated
- stable
- small
- 会注入 frozen system prompt

对应：

- `memory`
- `user`

### 2.2 Session Search

特点：

- 面向完整历史会话
- 动态检索
- 不注入 frozen snapshot
- 更适合作为按需调用工具

对应：

- `session_search`

---

## 3. Storage Model

### 3.1 MVP Storage

MVP 建议使用 file-based transcript store：

- `${baseDir}/sessions/<sessionId>.json`

### 3.2 Transcript Shape

```ts
interface SessionTranscriptEntry {
  timestamp: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

interface SessionTranscript {
  sessionId: string;
  updatedAt: string;
  entries: SessionTranscriptEntry[];
}
```

### 3.3 Future-Compatible Direction

后续可升级为 Hermes-style backend：

- SQLite metadata store
- FTS5 search index
- transcript slice loading

---

## 4. Search Contract

### 4.1 Input

```ts
search(query: string, options?: {
  limit?: number;
  contextMessages?: number;
}): Promise<SessionSearchResult[]>;
```

### 4.2 Output

```ts
interface SessionSearchResult {
  sessionId: string;
  score: number;
  updatedAt: string;
  summary: string;
}
```

### 4.3 MVP Search Rules

- 空 query 返回空数组
- phrase 命中优先
- token 命中用于补充分数
- 按 session 聚合
- 返回 top N 个 session
- summary 基于命中附近上下文裁剪

---

## 5. Tool Contract

### 5.1 Tool Name

```ts
session_search
```

### 5.2 Tool Args

```ts
{
  query: string;
  limit?: number;
}
```

### 5.3 Tool Result

成功示例：

```json
{
  "success": true,
  "query": "TypeScript",
  "results": [
    {
      "sessionId": "session-a",
      "score": 230,
      "updatedAt": "2026-05-14T10:00:00.000Z",
      "summary": "user: I prefer TypeScript over Python"
    }
  ],
  "result_count": 1
}
```

失败示例：

```json
{
  "success": false,
  "error": "query is required for session_search"
}
```

---

## 6. Host Agent Integration

### 6.1 Archive Timing

推荐：

- 每轮 assistant 输出完成后 archive 当前 turn

### 6.2 Tool Exposure

宿主应同时暴露：

- `memory`
- `session_search`

### 6.3 Prompt Usage

MVP 阶段建议：

- `session_search` 先作为按需 tool 使用
- 不默认注入 frozen prompt

后续如果要增强，可让宿主把 search result 转成临时 recall block 注入当前轮。

---

## 7. Non-Goals for MVP

MVP 不要求：

- SQLite / FTS5
- model summarization
- semantic search
- cross-project federation
- ACL / permissions
- archive compaction

---

## 8. Acceptance Criteria

MVP 完成时，至少满足：

1. 历史 session 能被持久化
2. `session_search` 能找回相关 session
3. 结果按 session 返回
4. tool 调用返回合法 JSON string
5. 示例宿主 Agent 能跑通一轮 `session_search`
