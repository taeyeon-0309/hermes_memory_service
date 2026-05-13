# Hermes Memory 模块嵌入指南（中文版）

本文档说明如何将该 memory 模块嵌入到其他 agent 应用，并完成调用接线。

## 模块能力

- 长期记忆存储，支持两个目标：`memory` 与 `user`
- 统一 memory 工具（`add | replace | remove`）
- Provider 架构（`MemoryProvider`、`MemoryManager`、`MemoryKernel`）
- 文件持久化（`FileMemoryRepository`）
- 会话级冻结快照（system prompt snapshot）
- 回忆上下文围栏（`buildMemoryContextBlock`）
- 写入前安全扫描（`scanMemoryContent`）

## 运行要求

- Node.js 18+
- TypeScript
- ESM 环境

## 当前项目命令

```bash
npm install
npm run typecheck
npm test
```

---

## 1）最小嵌入（仅 built-in provider）

```ts
import {
  BuiltinMemoryProvider,
  FileMemoryRepository,
  MemoryKernel,
  MemoryStore,
  buildMemoryContextBlock,
  buildMemoryGuidancePrompt,
} from "./src/memory/index";

const repository = new FileMemoryRepository({
  baseDir: "./data", // 由外部注入，不要硬编码用户目录
});

const store = new MemoryStore({ repository });
const builtin = new BuiltinMemoryProvider({ store });

const kernel = new MemoryKernel({
  providers: [builtin],
});

await kernel.initialize("session-001", {
  platform: "cli",
  agentIdentity: "my-agent",
});

// system prompt 中的 memory 使用规则
const memoryGuidanceBlock = buildMemoryGuidancePrompt();

// system prompt 用的冻结记忆块
const memorySystemBlock = kernel.buildSystemPrompt();

// 可选：针对当前 query 的 recall block
const recalled = await kernel.prefetch("user asked about coding preferences", "session-001");
const recallBlock = buildMemoryContextBlock(recalled);
```

---

## 2）工具注册与调度

使用 `kernel.getToolSchemas()` 作为 LLM 工具定义：

```ts
const tools = kernel.getToolSchemas();

// 将 tools 传入模型调用
// modelResponse = await model.generate({ messages, tools })
```

当模型要求调用 `memory` 工具时，经由 kernel 调度：

```ts
const toolResult = await kernel.handleToolCall("memory", {
  action: "add",          // add | replace | remove
  target: "user",         // memory | user
  content: "User prefers concise answers",
  // old_text: "..."       // replace/remove 必填
});

// toolResult 始终是 JSON 字符串
const parsed = JSON.parse(toolResult);
```

### 工具返回格式

成功示例：

```json
{
  "success": true,
  "target": "user",
  "entries": ["User prefers concise answers"],
  "usage": "3% — 42/1375 chars",
  "entry_count": 1,
  "message": "Entry added"
}
```

失败示例：

```json
{
  "success": false,
  "error": "old_text is required for remove"
}
```

---

## 3）每轮 prompt 如何组装

推荐顺序：

1. 业务系统提示词
2. `buildMemoryGuidancePrompt()`（memory 使用规则）
3. `kernel.buildSystemPrompt()`（冻结快照）
4. 当前 query 的 recall block：`buildMemoryContextBlock(await kernel.prefetch(...))`
5. 当前用户消息

如果你希望使用代码级 contract，而不是自己手动拼这些片段，可以直接使用 `buildPromptParts()`：

```ts
const parts = await kernel.buildPromptParts(userMessage, sessionId);

const messages = [
  { role: "system", content: appSystemPrompt },
  ...(parts.guidanceBlock ? [{ role: "system", content: parts.guidanceBlock }] : []),
  ...(parts.systemMemoryBlock ? [{ role: "system", content: parts.systemMemoryBlock }] : []),
  ...(parts.recallBlock ? [{ role: "system", content: parts.recallBlock }] : []),
  { role: "user", content: userMessage },
];
```

示例：

```ts
const memoryGuidance = buildMemoryGuidancePrompt();
const memorySystem = kernel.buildSystemPrompt();
const recalled = await kernel.prefetch(userMessage, sessionId);
const recallBlock = buildMemoryContextBlock(recalled);

const messages = [
  { role: "system", content: appSystemPrompt },
  ...(memoryGuidance ? [{ role: "system", content: memoryGuidance }] : []),
  ...(memorySystem ? [{ role: "system", content: memorySystem }] : []),
  ...(recallBlock ? [{ role: "system", content: recallBlock }] : []),
  { role: "user", content: userMessage },
];
```

---

## 4）生命周期 hooks（推荐接线）

```ts
await kernel.onTurnStart(turnNumber, userMessage, {
  model: "claude-sonnet-4-6",
  remainingTokens: 12000,
});

// assistant 回复后
await kernel.syncTurn(userMessage, assistantReply, sessionId);

// 进入压缩阶段时
const preCompressBlock = await kernel.onPreCompress(messages);

// 会话结束
await kernel.onSessionEnd(messages);
await kernel.shutdown();
```

---

## 5）持久化目录结构

当 `baseDir = ./data` 时，文件为：

- `./data/memories/MEMORY.md`
- `./data/memories/USER.md`

条目以纯文本块形式存储，分隔符为 `\n§\n`。

---

## 6）快照语义（重要）

- `loadFromDisk()` 会生成冻结快照，供 `buildSystemPrompt()` 使用。
- `add/replace/remove` 会立即落盘。
- 当前会话快照不会在写入后自动刷新。
- `prefetch()` 是动态的，因此同一会话后续轮次中可能已经能召回新写入的内容。
- 若需刷新冻结快照，请新建会话重新初始化（或重建 store/kernel 后初始化）。

换句话说：

- `buildSystemPrompt()` 是会话级冻结的
- `prefetch()` 是按轮动态计算的，可读取最新持久化状态
- 同一次 memory 写入，可能会先在 recall 中可见，后在 frozen snapshot 中可见

---

## 7）扩展 external provider

可通过继承 `MemoryProvider` 实现外部 provider，并传给 `MemoryKernel`。

注意：

- built-in provider 始终允许。
- `MemoryManager` 最多接受一个 external provider。
- provider 故障隔离（best-effort）。
- `systemPromptBlock()` 应返回稳定、适合缓存的提示词上下文。
- `prefetch()` 应返回针对当前 query 的动态 recall。
- `syncTurn()` 是每轮结束后的 provider 同步入口。
- `onMemoryWrite()` 是 built-in memory 写入后的广播 hook，主要供 external provider 响应。
- `onPreCompress()` 可为压缩流程返回补充上下文。

---

## 8）集成检查清单（应用侧）

- [ ] 首轮对话前调用 `initialize(sessionId, context)`
- [ ] 将 `getToolSchemas()` 注册到模型工具配置
- [ ] 工具调用统一经 `handleToolCall()` 调度
- [ ] 组装 prompt 时注入 `buildMemoryGuidancePrompt()`、`buildSystemPrompt()` 与可选 recall block
- [ ] 明确你的应用在写入后是依赖动态 recall，还是必须重建 frozen snapshot
- [ ] 每轮 assistant 输出后调用 `syncTurn()`
- [ ] 会话结束调用 `onSessionEnd()` + `shutdown()`

---

## 9）生产嵌入模式

### A. 每会话一个 kernel（推荐）

每个用户会话/对话创建一个 `MemoryKernel`，与冻结快照语义一致，避免跨会话状态混用。

```ts
function createSessionMemory(sessionId: string) {
  const repository = new FileMemoryRepository({ baseDir: "./data" });
  const store = new MemoryStore({ repository });
  const provider = new BuiltinMemoryProvider({ store });
  const kernel = new MemoryKernel({ providers: [provider] });
  return { sessionId, kernel };
}
```

### B. 防御式处理模型工具参数

`handleToolCall()` 接收 `Record<string, unknown>`，可直接传入模型参数，并对返回值做防御式解析：

```ts
const raw = await kernel.handleToolCall(toolName, toolArgsFromModel);
let toolPayload: { success?: boolean; error?: string };

try {
  toolPayload = JSON.parse(raw);
} catch {
  toolPayload = { success: false, error: "Invalid tool JSON response" };
}
```

### C. 写入后刷新策略

快照按会话冻结，建议二选一：

1. 保持冻结到下一个会话（默认）
2. 写入后重建 store/kernel 并 reinitialize（若必须即时可见）

对于当前 built-in provider：

- frozen snapshot 的可见性依赖重新初始化
- recall 的可见性可以在同一会话的下一次 `prefetch()` 中更新

---

## 10）错误处理契约

在应用边界建议按以下方式处理：

- `kernel.handleToolCall()`
  - 成功/失败都返回 JSON 字符串
  - 工具缺失/provider 缺失返回 `{ success:false, error }`
- `kernel.syncTurn()/queuePrefetch()/onTurnStart()/onSessionEnd()/shutdown()`
  - best-effort 编排，provider 失败会被隔离
- `kernel.prefetch()` 与 `kernel.buildSystemPrompt()`
  - 聚合非空结果，跳过失败 provider

---

## 11）安全集成说明

- built-in 写入（`add/replace`）会在持久化前经过 `scanMemoryContent()`。
- 危险模式（注入、外传、隐藏 unicode）会被拦截。
- 除非你明确接受跳过策略校验，否则不要绕过 `handleToolCall()` 直接写 repository。

---

## 12）打包与发布

当前仓库已具备开发检查（`typecheck`、`test`），但尚未包含 npm 发布/构建流水线。

若需要发布为包，请补充：

- 构建步骤（如 `tsup` 或 `tsc` outDir）
- 声明文件输出（`.d.ts`）
- `package.json` 的 `exports` 映射
- 语义化版本与 changelog 流程

最小目标形态：

```json
{
  "name": "@your-scope/memory-module",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

---

## 13）运行运维清单（生产）

- [ ] 确保运行环境中 `baseDir` 可写
- [ ] 若关注持久性，备份 `memories/` 目录
- [ ] 制定 `MEMORY.md` / `USER.md` 留存策略
- [ ] 监控 memory 写入被拦截比例（scanner blocks）
- [ ] 明确快照刷新策略（会话级或写后重载）
- [ ] 在 CI 中执行 `npm run typecheck && npm test`

---

## 14）快速排障

### `No provider found for tool: memory`

- 检查 `MemoryKernel` 构造时是否注册了 built-in provider
- 检查工具名是否严格为 `memory`

### 写入成功但 prompt 没显示最新 memory

- 这是冻结快照语义下的预期行为
- 新建会话/kernel 并初始化后即可刷新

### tool call 返回 `success:false`

- 先解析 JSON 并查看 `error`
- 常见原因：缺少 `content`、缺少 `old_text`、匹配歧义、scanner 拦截
