# Hermes Memory V3 Plan

## Status

当前状态：

- V3 规划已起草
- `session_search` spec / checklist 已建立
- Phase A-D 的 MVP 原型已存在
- 当前正在对齐实现与文档

因此，这份文档当前既是设计基线，也是当前 MVP 实现的对照基线。

## 1. Goal

V3 的目标是补齐当前实现与 Hermes 官方在 `session_search` 能力上的核心差距。

一句话概括：

> 在现有 memory kernel 之外，补上一条可独立演进的 session-history retrieval 链路，让宿主 Agent 不仅能记住 curated memory，还能搜索并召回过去会话。

---

## 2. Why V3

当前项目已经具备：

- built-in persistent memory
- frozen snapshot
- built-in recall
- prompt guidance
- prompt parts contract

但与 Hermes 官方相比，仍缺少一块关键能力：

- `session_search`

Hermes 官方的记忆体系至少分为两层：

1. curated persistent memory
2. searchable session history

V3 的核心任务就是把第 2 层补上。

---

## 3. Scope

### 3.1 In Scope

V3 重点覆盖：

- session transcript archive
- session metadata persistence
- search service for prior sessions
- `session_search` tool schema + executor
- host-agent integration path
- prompt injection point for session recall results
- tests and docs

### 3.2 Out of Scope

V3 第一阶段先不做：

- SQLite / FTS5 强依赖实现
- summarization model 调用
- ranking model
- multi-user ACL
- semantic vector retrieval
- cross-project federation

这些可以留到 V3.x 或 V4。

---

## 4. Target Architecture

建议将 `session_search` 保持为独立于 `src/memory/` 的模块，而不是硬塞进 memory kernel 内部。

推荐目录：

```text
src/session-search/
  types.ts
  session-repository.ts
  file-session-repository.ts
  session-search-service.ts
  tools/
    session-search-schema.ts
    session-search-tool.ts
  __tests__/
```

宿主 Agent 通过组合：

- `MemoryKernel`
- `SessionSearchService`

来获得完整的 Hermes-style memory + history recall 能力。

---

## 5. Phases

### 5.1 Phase A: Session Archive MVP

目标：

- 能把每轮 user / assistant 消息归档到 session transcript
- 以 session 为单位保存
- 文件路径由宿主注入

建议持久化结构：

- `${baseDir}/sessions/<sessionId>.json`

每个 session 文件至少包含：

- `sessionId`
- `updatedAt`
- `entries[]`

每条 entry 至少包含：

- `timestamp`
- `role`
- `content`

### 5.2 Phase B: Session Search MVP

目标：

- 按 query 搜索历史 session
- 按 session 聚合返回结果
- 支持 top N 限制
- 支持围绕最佳命中截取局部上下文

MVP 搜索策略建议：

- 先做 deterministic keyword / phrase matching
- 对每个 session 取最佳命中分数
- 返回按分数排序的 session-level results

### 5.3 Phase C: Tooling

目标：

- 提供 `session_search` tool schema
- 提供统一 executor
- 宿主 Agent 可像使用 `memory` tool 一样接入

建议 tool 参数：

```ts
{
  query: string;
  limit?: number;
}
```

### 5.4 Phase D: Host Integration

目标：

- 示例宿主 Agent 支持：
  - 归档 session
  - 暴露 `session_search`
  - 执行 tool loop

建议接法：

- 每轮结束后 archive 当前 turn
- 当模型调用 `session_search` 时执行检索
- 将搜索结果作为 tool result 返回给模型

### 5.5 Phase E: Hermes-Style Upgrade Path

这一阶段只规划，不要求首版实现。

未来可继续扩展：

- SQLite + FTS5 backend
- transcript slicing
- session-level summary generation
- richer metadata filters
- ranking improvements

---

## 6. API Direction

### 6.1 Core Types

建议核心类型：

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

interface SessionSearchResult {
  sessionId: string;
  score: number;
  updatedAt: string;
  summary: string;
}
```

### 6.2 Service Shape

建议：

```ts
class SessionSearchService {
  archiveTurn(sessionId: string, messages: AgentMessage[]): Promise<void>;
  search(query: string, options?: {
    limit?: number;
    contextMessages?: number;
  }): Promise<SessionSearchResult[]>;
}
```

### 6.3 Tool Shape

建议：

```ts
const SESSION_SEARCH_TOOL_SCHEMA: ToolSchema;

async function executeSessionSearchTool(
  args: Record<string, unknown>,
  service: SessionSearchService
): Promise<string>;
```

---

## 7. Acceptance Goals

V3 完成时，至少应满足：

1. 宿主能归档完整会话 turn
2. 可按 query 搜历史 session
3. 结果按 session 聚合而非逐条 message 返回
4. `session_search` 可作为 tool 被宿主调用
5. 返回 JSON string，风格与 `memory` tool 一致
6. 示例宿主 Agent 能跑通一轮 `session_search`

---

## 8. Delivery Order

推荐顺序：

1. `session-search-spec.md`
2. `v3-checklist.md`
3. repository + service
4. tool schema + executor
5. host-agent wiring
6. tests
7. docs

---

## 9. End State

V3 完成后，项目应形成两条并行能力线：

1. `memory`：
   - curated persistent memory
   - frozen snapshot
   - built-in recall

2. `session_search`：
   - searchable historical sessions
   - dynamic history recall
   - host tool-call integration

这会让项目更接近 Hermes 官方记忆能力的整体形态。
