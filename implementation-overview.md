# Hermes Memory Implementation Overview

## 1. Project Position

当前项目已经从最初的 memory module 规格设计，推进到一个可嵌入宿主 Agent 的、具备实际运行能力的 Hermes-style memory subsystem。

它现在不只是一个“能写文件的存储层”，而是一个具备以下能力的 memory kernel：

- 长期记忆持久化
- `memory` / `user` 双目标存储
- 统一 `memory` tool 写入路径
- 会话级 frozen snapshot 注入
- 每轮动态 recall
- recall context fencing
- 写入前安全扫描
- provider 抽象与 manager 编排
- prompt assembly contract

---

## 2. Current Capability Summary

### 2.1 Persistence and Memory Semantics

当前已具备：

- 文件持久化 repository：`FileMemoryRepository`
- `MEMORY.md` / `USER.md` 双文件存储
- `add / replace / remove` 三种写操作
- 重复写入去重
- replace/remove 歧义检测
- 字符上限控制
- 原子写入与进程内锁

核心文件：

- [memory-store.ts](</Users/minicoder/Vibe Project/Hermes-Memory/src/memory/store/memory-store.ts>)
- [file-memory-repository.ts](</Users/minicoder/Vibe Project/Hermes-Memory/src/memory/store/file-memory-repository.ts>)

### 2.2 Frozen Snapshot and Dynamic Recall

当前已具备：

- 会话开始时从磁盘加载 frozen snapshot
- `buildSystemPrompt()` 输出 session-frozen memory block
- `prefetch()` 输出 turn-scoped dynamic recall
- recall 与 snapshot 刷新语义已文档化并有测试

当前正式语义：

- `buildSystemPrompt()` 是 session-frozen
- `prefetch()` 是 turn-scoped dynamic
- 同一次 memory 写入，可能先在 recall 中可见，后在 frozen snapshot 中可见

核心文件：

- [memory-kernel.ts](</Users/minicoder/Vibe Project/Hermes-Memory/src/memory/kernel/memory-kernel.ts>)
- [builtin-memory-provider.ts](</Users/minicoder/Vibe Project/Hermes-Memory/src/memory/provider/builtin-memory-provider.ts>)

### 2.3 Recall / Query MVP

当前已具备：

- built-in deterministic recall
- `MemoryStore.search()` 查询接口
- phrase + token 的轻量匹配
- `user` 高于 `memory` 的排序策略
- recall 去重
- recall 条数限制
- recall 字符预算控制
- recall 输出裁剪

这意味着宿主 Agent 已经可以：

- 在新会话开始时注入 frozen memory
- 在后续轮次中按当前 query 动态召回相关记忆

### 2.4 Prompt Guidance and Prompt Parts Contract

当前已具备：

- `buildMemoryGuidancePrompt()`
- `buildPromptParts(userMessage, sessionId?)`

宿主现在可以通过统一 contract 拿到：

- `guidanceBlock`
- `systemMemoryBlock`
- `recallBlock`

而不用自己重新理解 memory prompt 的拼装顺序。

核心文件：

- [memory-guidance.ts](</Users/minicoder/Vibe Project/Hermes-Memory/src/memory/prompt/memory-guidance.ts>)
- [memory-kernel.ts](</Users/minicoder/Vibe Project/Hermes-Memory/src/memory/kernel/memory-kernel.ts>)

### 2.5 Provider Architecture

当前已具备：

- `MemoryProvider` 抽象基类
- `MemoryManager` 聚合与容错编排
- built-in provider
- external provider 单实例限制
- provider failures best-effort isolation
- tool routing
- lifecycle hooks
- external provider hook contract 文档化

核心文件：

- [memory-provider.ts](</Users/minicoder/Vibe Project/Hermes-Memory/src/memory/provider/memory-provider.ts>)
- [memory-manager.ts](</Users/minicoder/Vibe Project/Hermes-Memory/src/memory/kernel/memory-manager.ts>)

### 2.6 Security

当前已具备：

- prompt injection 模式拦截
- exfiltration 模式拦截
- hidden / invisible unicode 拦截
- 所有 memory 写入统一经安全扫描

核心文件：

- [threat-patterns.ts](</Users/minicoder/Vibe Project/Hermes-Memory/src/memory/security/threat-patterns.ts>)
- [content-scanner.ts](</Users/minicoder/Vibe Project/Hermes-Memory/src/memory/security/content-scanner.ts>)

---

## 3. What The Module Can Already Do In A Host Agent

如果宿主 Agent 正确接线，这个模块现在已经可以支持：

1. 新建会话时自动加载历史记忆
2. 在 system prompt 中注入 frozen memory snapshot
3. 在每轮中基于当前 query 生成 recall block
4. 在模型调用 `memory` tool 时完成真实写入
5. 在同 session 中让新写入内容被后续 recall 命中
6. 在下一个 session 中让新写入内容进入新的 frozen snapshot

---

## 4. What Is Still Out Of Scope

当前仍未实现：

- embedding / vector retrieval
- 真正语义检索
- transcript archive / session search
- 自动 memory 提炼
- 多 external provider 并行支持
- 跨进程锁
- 绑定具体 LLM SDK 的 agent runtime

这些不属于当前完成态的缺陷，而是明确未进入现阶段范围的内容。

---

## 5. Recommended Host Integration Pattern

推荐宿主采用以下接法：

1. 每个用户会话创建一个 `MemoryKernel`
2. 会话开始时调用 `initialize(sessionId, context)`
3. 每轮调用 `buildPromptParts(userMessage, sessionId)`
4. 将 `guidanceBlock` / `systemMemoryBlock` / `recallBlock` 注入 system messages
5. 将 `getToolSchemas()` 暴露给模型
6. 模型要求调用 `memory` 时，用 `handleToolCall()` 执行
7. 每轮结束调用 `syncTurn()`
8. 会话结束调用 `onSessionEnd()` 与 `shutdown()`

---

## 6. Verification Status

当前自动化验证状态：

- `npm test`：通过
- `npm run typecheck`：通过

测试已覆盖：

- memory store 语义
- repository 原子写与锁
- manager 容错与 hook 行为
- built-in recall
- guidance prompt
- prompt parts contract
- snapshot / recall refresh policy

---

## 7. Current Best Summary

一句话总结当前实现：

> 项目已经完成了一个可被宿主 Agent 直接接入的 Hermes-style memory subsystem MVP+，具备冻结快照、动态 recall、统一 memory tool、prompt guidance、prompt parts contract 和 provider-level extensibility。
