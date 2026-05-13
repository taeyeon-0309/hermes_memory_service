# Hermes Memory V2 Checklist

## Status

- [x] V2 核心范围已实现
- [x] 相关文档已同步到 README / README.zh-CN
- [x] 关键行为已有自动化测试覆盖

## A. V2 总体验收

### A1. 能力目标

- [x] built-in provider 具备可用的 recall / query MVP
- [x] 宿主可拿到标准化 memory guidance prompt
- [x] 宿主可通过代码级 contract 组装 memory 相关 prompt parts
- [x] recall 结果具备基本排序、去重和长度控制
- [x] snapshot 与 recall 的刷新语义被明确定义并可测试
- [x] external provider 的行为契约更明确

### A2. V2 范围边界

- 仍不引入 embedding
- 仍不引入 vector database
- 仍不实现真正语义检索
- 仍不实现 transcript archive
- 仍不实现跨进程锁
- 仍不耦合具体 LLM SDK

## B. Built-in Recall / Query MVP

### B1. `src/memory/store/memory-store.ts`

- [x] 新增 memory 查询接口
- [x] 支持对 `memory` / `user` entries 做 recall 检索
- [x] 支持传入 query 字符串
- [x] 支持限制返回条数
- [x] 支持结果去重
- [x] 支持稳定排序
- [x] 空 query 时行为明确
- [x] 未命中时返回空结果
- [x] 查询逻辑不修改 frozen snapshot
- [x] 查询逻辑不触发磁盘写入

### B2. 查询结果结构

- [x] 定义查询结果类型
- [x] 结果至少包含 `target`
- [x] 结果至少包含 `content`
- [x] 结果至少包含 `score`
- [x] 结果类型对外公开时不暴露 `any`

### B3. `src/memory/provider/builtin-memory-provider.ts`

- [x] `prefetch(query)` 不再固定返回空字符串
- [x] `prefetch(query)` 能读取 built-in store 中相关内容
- [x] `prefetch(query)` 优先返回 `user` 相关内容
- [x] `prefetch(query)` 在 recall 为空时返回空字符串
- [x] `prefetch(query)` 输出格式紧凑且适合注入 prompt
- [x] `prefetch(query)` 不抛裸异常给上层

### B4. Recall 输出行为

- [x] query 命中 `user` 内容时返回 recall
- [x] query 命中 `memory` 内容时返回 recall
- [x] query 同时命中两类内容时顺序稳定
- [x] recall 文本不会重复返回相同内容
- [x] recall 文本长度可控

## C. Memory Guidance Prompt

### C1. Guidance 生成接口

- [x] 新增标准 guidance prompt 导出入口
- [x] guidance 可通过独立函数获取
- [x] 或可通过 kernel/provider 暴露明确接口获取
- [x] guidance 不依赖具体模型 SDK
- [x] guidance 不耦合宿主 message 格式

### C2. Guidance 内容

- [x] 明确 `memory` 用于 durable facts
- [x] 明确 `user` 用于用户偏好、身份与长期风格
- [x] 明确禁止写入 task progress
- [x] 明确禁止写入 temporary state
- [x] 明确何时应该调用 `memory` tool
- [x] 明确何时不应该写入 memory
- [x] recall 启用时，明确跨会话问题应优先 recall

### C3. Guidance 一致性

- [x] guidance 与 `MEMORY_TOOL_SCHEMA` 语义一致
- [x] guidance 与 README 的接入说明一致
- [x] guidance 不与 frozen snapshot 语义冲突

## D. Prompt Assembly Contract

### D1. Prompt Parts 结构

- [x] 新增结构化 prompt parts 类型
- [x] 至少包含 `guidanceBlock`
- [x] 至少包含 `systemMemoryBlock`
- [x] 至少包含 `recallBlock`
- [x] 字段为空时行为明确

### D2. Prompt Parts 生成接口

- [x] 提供单一接口生成 prompt parts
- [x] 接口可接收 `userMessage`
- [x] 接口可接收 `sessionId`
- [x] 不依赖具体 LLM SDK
- [x] 不返回具体供应商 message objects

### D3. Prompt Assembly 语义

- [x] `guidanceBlock` 表示行为约束层
- [x] `systemMemoryBlock` 表示 frozen snapshot 层
- [x] `recallBlock` 表示 turn-scoped recall 层
- [x] 各层职责清晰且文档化

## E. Recall Scoring / Trimming

### E1. 基础 scoring

- [x] 支持 query tokenize 或等价的轻量匹配策略
- [x] 完整短语命中高于零散 token 命中
- [x] `user` 命中默认权重高于 `memory`
- [x] 多条命中结果排序稳定

### E2. Recall 长度控制

- [x] 支持最大返回条数限制
- [x] 支持最大字符数限制
- [x] 超长 recall 会被裁剪
- [x] 裁剪后输出仍保持可读

### E3. 去重与稳定性

- [x] 相同内容仅返回一次
- [x] 相同 query 重复调用结果顺序稳定
- [x] 相近 query 的结果行为可预测

## F. Snapshot / Recall Refresh Policy

### F1. 文档语义

- [x] 明确定义 frozen snapshot 仅在 session start 固定
- [x] 明确定义 recall 是否按最新磁盘状态动态读取
- [x] 明确定义新写入 memory 在同 session 内何时可见

### F2. 推荐行为

- [x] 当前 session 的 `buildSystemPrompt()` 继续保持 frozen
- [x] recall 可基于最新磁盘状态动态返回
- [x] 新写入内容不自动进入 frozen snapshot
- [x] 新写入内容可在后续 recall 中变得可见

### F3. 一致性

- [x] README 与代码行为一致
- [x] `v2-plan.md` 与实现行为一致
- [x] 测试明确覆盖这套时序语义

## G. External Provider Contract Tightening

### G1. `MemoryProvider` 语义文档化

- [x] `systemPromptBlock()` 语义明确为稳定、可缓存
- [x] `prefetch()` 语义明确为每轮动态 recall
- [x] `syncTurn()` 语义明确为 turn 结束后的同步入口
- [x] `onMemoryWrite()` 语义明确为 built-in 写入广播
- [x] `onPreCompress()` 语义明确为压缩阶段补充上下文

### G2. `MemoryManager` 协调语义

- [x] provider 的 recall 聚合顺序明确
- [x] provider 失败时 recall 聚合保持 best-effort
- [x] provider hooks 的错误隔离继续成立

### G3. 外部 provider 接入预期

- [x] 外部 provider 不要求实现 built-in 写入逻辑
- [x] 外部 provider 可只实现 recall / prompt block / hooks 的子集
- [x] 未实现方法时默认行为清晰

## H. 文档更新

### H1. README

- [x] 更新嵌入说明，加入 recall / query 能力
- [x] 更新 prompt assembly 说明
- [x] 更新 guidance prompt 使用方式
- [x] 更新 snapshot / recall refresh policy

### H2. 中文文档

- [x] `README.zh-CN.md` 与英文 README 保持语义一致
- [x] 中文文档补充 recall / query 与 guidance 的接线方式

### H3. 规格文档

- [x] `v2-plan.md` 已补充完成状态说明

## I. 测试 Checklist

### I1. `memory-store` 相关测试

- [x] query 命中 `user`
- [x] query 命中 `memory`
- [x] query 未命中返回空
- [x] recall 结果排序稳定
- [x] recall 结果去重
- [x] recall 条数限制生效
- [x] recall 长度限制生效
- [x] recall 不刷新 frozen snapshot

### I2. `builtin-memory-provider` 相关测试

- [x] `prefetch()` 命中时返回 recall
- [x] `prefetch()` 未命中时返回空字符串
- [x] `prefetch()` 同时命中两类内容时顺序符合预期

### I3. Prompt parts / guidance 测试

- [x] guidance block 非空且包含关键规则
- [x] prompt parts 结构完整
- [x] prompt parts 中各 block 的职责清晰

### I4. Refresh policy 测试

- [x] 同 session 写入后 `buildSystemPrompt()` 不变
- [x] 同 session 写入后 recall 可见性符合定义
- [x] 新 session 初始化后 snapshot 刷新

## J. 实施结果

V2 推荐顺序中的关键项已全部落地完成，当前可以作为后续 V3 的稳定基线使用。
