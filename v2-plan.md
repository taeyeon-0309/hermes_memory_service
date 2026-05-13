# Hermes Memory V2 Plan

## Status

V2 核心主线已完成，当前状态可概括为：

- built-in recall / query MVP：已完成
- memory guidance prompt：已完成
- prompt assembly contract：已完成
- recall scoring / trimming / budget control：已完成
- snapshot / recall refresh policy 明文化：已完成
- external provider contract tightening：已完成

## 1. Goal

V2 的目标不是复刻整个 Hermes Agent，而是在当前 V1 memory kernel 的基础上，把模块从“可写入的 memory MVP”推进到“具备基本 recall 能力、具备更强宿主接入契约、行为上更接近 Hermes”的版本。

一句话概括：

> 让宿主 Agent 不只是能存记忆，还能够在合适的时候拿回记忆，并稳定地把它喂给模型。

---

## 2. Current State

当前 V1 已经具备：

- `memory` / `user` 双目标持久化
- `MemoryProvider` / `MemoryManager` / `MemoryKernel` 分层
- built-in provider
- `memory` tool 的 `add | replace | remove`
- frozen system prompt snapshot
- recall context fencing
- 写入前安全扫描
- 文件持久化与基本测试覆盖

当前 V1 仍缺失：

- 真正可用的 recall / query
- 更强的 tool-aware behavior guidance
- 代码级 prompt assembly contract
- recall scoring / trimming 策略
- 明确的 snapshot / recall refresh policy
- 更严格的 external provider 行为约束

---

## 3. V2 Priorities

### 3.1 Priority 1: Built-in Recall / Query MVP

#### Why

当前已经有：

- `prefetch()` 接口
- `buildMemoryContextBlock()`
- recall block 注入位

但 built-in provider 的 `prefetch()` 仍为空实现，所以 recall 链路只有架子，没有能力。

#### V2 Goal

先不做 embedding / semantic retrieval，先做 deterministic built-in recall：

- 按 query 对 `memory` / `user` entries 做子串匹配
- 支持简单 scoring
- 返回 top N recall entries
- 输出纯文本 recall context，交给 `buildMemoryContextBlock()`

#### Suggested API

在 `MemoryStore` 中新增：

```ts
interface MemorySearchResult {
  target: "memory" | "user";
  content: string;
  score: number;
}
```

候选方法：

```ts
search(query: string, options?: {
  targets?: Array<"memory" | "user">;
  limit?: number;
}): Promise<MemorySearchResult[]>;
```

或更轻量版本：

```ts
query(target: "memory" | "user", text: string): Promise<string[]>;
```

#### Suggested Builtin Behavior

`BuiltinMemoryProvider.prefetch(query)`：

- 先查 `user`
- 再查 `memory`
- 做去重
- 控制 recall 返回条数
- 没命中则返回空字符串

#### Minimum Acceptance

- query 命中 `USER` 条目时，`prefetch()` 返回非空 recall
- query 命中 `MEMORY` 条目时，`prefetch()` 返回非空 recall
- 未命中时返回空字符串
- recall block 输出紧凑、可直接注入 prompt

---

### 3.2 Priority 2: Tool-Aware Memory Guidance Prompt

#### Why

当前模型是否正确使用 `memory` tool，主要依赖：

- tool schema description
- 宿主自身 system prompt

这不够稳定，也不够像 Hermes。

Hermes 的做法是：在 system prompt 中明确告诉模型什么时候应该写 memory、什么时候不应该写、什么时候该做 recall。

#### V2 Goal

新增一段标准化 guidance 文本，由 memory 模块导出或生成。

候选接口：

```ts
export function buildMemoryGuidancePrompt(): string;
```

或：

```ts
kernel.buildGuidancePrompt(): string;
```

#### Guidance Content

至少包含：

- `memory` 存 durable facts
- `user` 存用户偏好、身份、长期风格
- 不要写 task progress / temporary state
- 发现稳定偏好、环境事实、项目惯例时应使用 `memory` tool
- 只是当前回合临时上下文时不要写 memory
- recall 可用时，跨会话问题应优先 recall

#### Minimum Acceptance

- guidance block 可独立注入宿主 system prompt
- guidance 文案与 `MEMORY_TOOL_SCHEMA` 语义一致
- guidance 不依赖具体模型或 SDK

---

### 3.3 Priority 3: Prompt Assembly Contract

#### Why

当前 prompt 组装顺序主要写在 README 中，属于文档约定，而不是代码级 contract。

Hermes 的强项之一是 prompt assembly 边界非常清晰：

- 哪些属于 cached prompt
- 哪些属于 turn-scoped additions
- memory 在哪里注入
- recall 在哪里注入

#### V2 Goal

把“如何组装 memory 相关 prompt parts”从 README 建议提升为代码级 contract。

#### Recommended Shape

更推荐输出结构化 parts，而不是直接返回 SDK-specific message objects。

```ts
export interface MemoryPromptParts {
  guidanceBlock: string;
  systemMemoryBlock: string;
  recallBlock: string;
}
```

候选接口：

```ts
buildPromptParts(userMessage: string, sessionId?: string): Promise<MemoryPromptParts>;
```

#### Minimum Acceptance

- 宿主可通过单一接口拿到 guidance / frozen snapshot / recall block
- 不依赖具体 LLM SDK
- 不强耦合消息对象格式

---

### 3.4 Priority 4: Recall Scoring / Trimming

#### Why

只做裸子串查找虽然够用，但 recall 体验会偏弱。

#### V2 Goal

在不引入 embedding 的前提下，做一个轻量 recall 策略：

- query tokenize
- 关键词 overlap scoring
- target weighting
- 最大条数限制
- 最大字符数限制
- recall 内容去重

#### Suggested Rules

- `user` 命中默认高于 `memory`
- 完整短语命中高于离散 token 命中
- recall block 超长时裁剪
- 同内容仅返回一次

#### Minimum Acceptance

- 多条命中时结果有稳定排序
- recall block 长度可控
- 相似 query 能返回稳定结果

---

### 3.5 Priority 5: Refresh Policy Clarification

#### Why

一旦 recall 开始真正工作，就要明确：

- frozen snapshot 是否只在 session 初始化时固定
- recall 是否每轮基于最新磁盘状态动态读取

#### Recommended Policy

- frozen snapshot：只在 session start 固定
- recall：每轮可基于最新磁盘状态动态读取
- 因此新写入内容在同 session 内：
  - 不进入 frozen snapshot
  - 但可能进入下一轮 recall

#### Acceptance

- 文档中明确定义 snapshot / recall 的时序语义
- 测试覆盖“写入后 recall 可见但 snapshot 不刷新”的行为

---

### 3.6 Priority 6: External Provider Contract Tightening

#### Why

当前 provider 接口已经存在，但行为语义还可以更明确，方便未来接入外部 provider。

#### V2 Goal

明确这些方法的语义边界：

- `systemPromptBlock()`：稳定、可缓存、适合 frozen 注入
- `prefetch()`：每轮动态调用，可为空
- `syncTurn()`：用于 turn 结束后的异步记录
- `onMemoryWrite()`：接收 built-in memory 变化事件
- `onPreCompress()`：为压缩阶段补上下文

#### Acceptance

- provider contract 文档化
- test stub 能覆盖关键 hook 语义
- 对未来 external provider 的接入更可预测

---

## 4. Recommended Delivery Order

建议按以下顺序推进：

1. built-in recall / query MVP
2. memory guidance prompt
3. prompt assembly contract
4. recall scoring / trimming
5. refresh policy 明文化与测试
6. external provider contract 补强

---

## 5. Expected Outcome After V2

如果 V2 完成，模块应具备：

- 长期记忆写入
- 新会话 frozen snapshot 注入
- 每轮 recall 注入
- 更稳定的模型行为约束
- 更清晰的宿主 prompt 接线协议
- 更接近 Hermes 的 memory orchestration 风格

一句话总结：

> V2 完成后，项目将从“可写入的 memory MVP”升级为“具备基本 recall 与宿主 prompt 接入契约的 Hermes-style memory subsystem”。

当前实现已经达到这一目标。

---

## 6. Completion Notes

V2 完成后，当前模块已经具备：

1. 会话启动时的 frozen snapshot 注入
2. 会话中基于最新持久化状态的 built-in recall
3. 标准化 memory guidance prompt
4. 代码级 prompt parts contract
5. recall 排序、预算控制与可读裁剪
6. 对 external provider hook 语义更明确的 contract

下一阶段若继续推进，更适合进入 V3，而不是继续扩大 V2 范围。
