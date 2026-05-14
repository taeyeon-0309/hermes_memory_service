# Session Search SQLite / FTS Checklist

## Status

- [x] SQLite / FTS 升级文档已建立
- [x] `SQLiteSessionRepository` 首版代码已存在
- [x] 示例宿主 Agent 已切到 SQLite backend
- [x] 以下清单已完成首轮核对
- [ ] 仍有更高阶能力待继续推进

## A. 总体验收

- [x] SQLite backend 已实现（首版）
- [x] FTS 检索已实现（首版）
- [x] session-level grouping 已实现（首版）
- [x] transcript slice reconstruction 已实现（基础版）
- [x] 示例宿主 Agent 已切换或支持 SQLite backend
- [x] 测试与文档已同步

## B. SQLite Repository

### B1. 基础结构

- [x] 新增 `sqlite-session-repository.ts`
- [x] 实现 `SessionRepository` 接口
- [x] database path 由外部注入
- [x] 自动创建 SQLite schema
- [x] 默认 backend 已切换为 SQLite，file backend 保留为 fallback / test fixture

### B2. 写入能力

- [x] 写入 `sessions` table
- [x] 写入 `messages` table
- [x] 为 message content 建立 FTS 索引
- [x] 多次 archive 同一 session 时顺序正确

## C. Search

### C1. FTS Query

- [x] 使用 FTS 做 full-text search
- [x] 支持 top N 限制
- [x] 支持空 query 返回空结果
- [x] 首版查询能力明确限定为关键词 query 与短语 query

### C2. Session-Level Grouping

- [x] 命中按 `session_id` 聚合
- [x] 每个 session 仅返回一个代表结果
- [x] 结果排序稳定

### C3. Context Slice

- [x] 可围绕命中 message 重建上下文窗口
- [x] 结果 summary 保持可读

## D. Host Integration

- [x] 示例宿主 Agent 支持 SQLite backend
- [x] `session_search` tool loop 无需改变
- [x] archive/search 在宿主中可正常工作

## E. Tests

- [x] SQLite repository archive 测试
- [x] FTS search 测试
- [x] session grouping 测试
- [x] host integration 测试

## F. Docs

- [x] README 更新为 SQLite / FTS 版说明
- [x] README.zh-CN 更新
- [x] implementation-overview.md 更新
- [x] hermes-memory-comparison.md 更新

## G. Metadata Enrichment

- [x] `sessions` 表真正写入 `source`
- [x] `sessions` 表真正写入 `user_id`
- [x] 决定 `title` 本轮是否落地
- [x] search result 可回传 metadata
- [x] 宿主 Agent 可传递 metadata

## H. Ranking Refinement

- [x] 排序不只依赖 FTS rank
- [x] 增加 recency boost
- [x] 增加 metadata-based boost
- [x] 排序规则有测试覆盖

## I. Context Slice Improvement

- [x] 多命中点可做 excerpt 合并
- [x] excerpt 最大长度可控
- [x] excerpt 规则比当前机械窗口更稳定
- [x] 若有噪声消息，裁剪规则行为明确
