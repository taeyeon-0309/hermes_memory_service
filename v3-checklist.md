# Hermes Memory V3 Checklist

## Status

- [x] V3 规划文档已建立
- [x] `session_search` spec 已建立
- [x] `session_search` MVP 原型代码已存在
- [x] 以下清单已完成首轮核对
- [x] 首轮文档同步已完成

## A. 总体验收

- [x] session transcript archive 已实现
- [x] session-level search 已实现
- [x] `session_search` tool 已实现
- [x] 示例宿主 Agent 已接入 `session_search`
- [x] JSON tool contract 与 `memory` tool 风格一致
- [x] 测试覆盖 archive / search / tool / host integration

## B. Session Archive

### B1. Repository

- [x] 定义 session repository 抽象
- [x] 提供 file-based repository
- [x] 会话路径由外部注入
- [x] 按 `sessionId` 存储 transcript
- [x] transcript 包含 `updatedAt`
- [x] transcript 包含 `entries[]`
- [x] entry 包含 `timestamp`
- [x] entry 包含 `role`
- [x] entry 包含 `content`

### B2. Archive Behavior

- [x] 能追加新的 turn 到已有 session
- [x] 空消息输入行为明确
- [x] 文件不存在时可自动初始化
- [x] 写入失败时以 rejection / controlled error 暴露

## C. Session Search

### C1. Search Service

- [x] 提供 `search(query, options?)`
- [x] 空 query 返回空结果
- [x] 支持 top N 限制
- [x] 支持按 session 聚合返回
- [x] 支持 context window 裁剪
- [x] 结果带 `score`
- [x] 结果带 `updatedAt`
- [x] 结果带 `summary`

### C2. Search Semantics

- [x] phrase 命中优先
- [x] token 命中可补充分数
- [x] 多 session 结果稳定排序
- [x] 未命中返回空数组

## D. Tooling

### D1. Tool Schema

- [x] 定义 `SESSION_SEARCH_TOOL_SCHEMA`
- [x] tool name 固定为 `session_search`
- [x] 至少包含 `query`
- [x] 可选 `limit`
- [x] schema 描述清楚用途

### D2. Tool Executor

- [x] 提供 `executeSessionSearchTool()`
- [x] 接收宽输入 `Record<string, unknown>`
- [x] 缺少 `query` 时返回 JSON error
- [x] 查询成功时返回 JSON string
- [x] 错误时返回 JSON string

## E. Host Integration

### E1. Example Host Agent

- [x] 示例宿主 Agent 能 archive turn
- [x] 示例宿主 Agent 暴露 `session_search` tool
- [x] 示例宿主 Agent 能执行 tool loop
- [x] 示例宿主 Agent 能将 tool result 回传模型

### E2. Integration Semantics

- [x] `session_search` 不与 `memory` tool 冲突
- [x] 宿主可同时暴露 `memory` 与 `session_search`
- [x] archive 时机在每轮完成后明确

## F. Tests

### F1. Repository / Service

- [x] 能写入 session transcript
- [x] 能从多个 session 中检索命中结果
- [x] session-level results 正确排序
- [x] 未命中返回空

### F2. Tool

- [x] `session_search` 成功返回 JSON
- [x] 缺少 `query` 返回 JSON error

### F3. Host Example

- [x] 示例宿主 Agent 可跑通一次 `session_search`
- [x] 历史 session 可被新 session 找回

## G. 文档

- [x] README 补充 `session_search` 能力
- [x] README.zh-CN 补充 `session_search` 能力
- [x] implementation-overview.md 补充 session history retrieval
- [x] hermes-memory-comparison.md 更新当前对齐状态
