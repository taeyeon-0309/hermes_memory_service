# Memory Module Acceptance Checklist

## A. 总体验收

### A1. 架构层

- 模块对外只依赖 TypeScript 运行环境，不依赖特定 LLM SDK
- 模块不依赖业务侧 config 系统
- 模块不依赖业务侧 tool registry
- memory 路径由外部注入，不存在硬编码用户目录
- built-in provider 可单独工作
- 最多只允许一个 external provider
- 单个 provider 失败不会导致整个 manager 崩溃
- 所有 tool call 返回 string，且内容是合法 JSON
- 写入 memory 的内容都会经过安全扫描
- system prompt snapshot 采用 frozen 语义，而不是 live state

### A2. MVP 范围

- 第一版没有实现 embedding / vector recall
- 第一版没有实现 transcript archive
- 第一版没有实现自动 memory 抽取
- 第一版没有实现插件目录自动发现
- 第一版没有实现跨进程锁
- 第一版 focus 在 built-in memory 闭环可用

## B. 逐文件 Checklist

### 1. `src/memory/kernel/types.ts`

- 定义了 `MemoryTarget = "memory" | "user"`
- 定义了 `MemoryEntry`
- `MemoryEntry` 至少包含 `id / target / content / createdAt / updatedAt`
- 定义了 `MemorySnapshot`
- 定义了 `ToolSchema`
- 定义了 `ChatMessage`
- 定义了 `MemoryRuntimeContext`
- 定义了 `ToolCallContext`
- 定义了 `TurnContext`
- 定义了 `MemoryToolArgs`
- 对外类型中没有裸 `any`

### 2. `src/memory/kernel/errors.ts`

- `MemoryError` 存在
- `MemoryValidationError` 继承自 `MemoryError`
- `MemoryStorageError` 继承自 `MemoryError`
- `MemorySecurityError` 继承自 `MemoryError`
- `MemoryProviderError` 继承自 `MemoryError`
- 错误 `message` 可正常透传
- 没有引入与业务耦合的错误类型

### 3. `src/memory/provider/memory-provider.ts`

- 使用 `abstract class` 而不是仅 `interface`
- `name` 是抽象只读属性
- `isAvailable()` 是抽象方法
- `initialize()` 是抽象方法
- `getToolSchemas()` 是抽象方法
- `systemPromptBlock()` 默认返回空字符串
- `prefetch()` 默认返回空字符串
- `queuePrefetch()` 默认 no-op
- `syncTurn()` 默认 no-op
- `shutdown()` 默认 no-op
- `onTurnStart()` 默认 no-op
- `onSessionEnd()` 默认 no-op
- `onPreCompress()` 默认返回空字符串
- `onMemoryWrite()` 默认 no-op
- `onDelegation()` 默认 no-op
- `handleToolCall()` 默认抛出 controlled error

### 4. `src/memory/kernel/memory-manager.ts`

#### Provider 注册

- 支持注册多个 provider
- `provider.name === "builtin"` 时按 built-in 处理
- built-in provider 始终允许注册
- external provider 最多只允许一个
- 第二个 external provider 被忽略，而不是覆盖已有 provider
- tool name 到 provider 的映射正确建立
- tool name 冲突时后注册者被忽略

#### 生命周期

- `initializeAll()` 会遍历所有 provider
- 单个 provider 初始化失败不会中断其它 provider
- `shutdownAll()` 也采用 best-effort

#### 聚合逻辑

- `buildSystemPrompt()` 会忽略空 block
- `buildSystemPrompt()` 用 `\n\n` 连接多个 block
- `prefetchAll()` 会忽略空 recall
- `prefetchAll()` 单个 provider 报错不会中断
- `queuePrefetchAll()` 单个 provider 报错不会中断
- `syncAll()` 单个 provider 报错不会中断

#### Tool Routing

- `getAllToolSchemas()` 会去重
- `hasTool()` 判断正确
- `handleToolCall()` 能正确路由到对应 provider
- tool 不存在时返回 JSON error string
- provider 内部异常时返回 JSON error string
- `handleToolCall()` 不向上抛裸异常

#### Hooks

- `onTurnStart()` best-effort
- `onSessionEnd()` best-effort
- `onPreCompress()` 聚合多个 provider 的返回
- `onMemoryWrite()` 会跳过 builtin 自身或按预期处理
- `onDelegation()` best-effort

### 5. `src/memory/context/context-sanitizer.ts`

- 导出了 `sanitizeContext(text: string): string`
- 能移除 `<memory-context>`
- 能移除 `</memory-context>`
- 能移除预设的 system note
- 对大小写变化有一定容忍度
- 对首尾空白做 `trim`
- 不会误删普通正文内容
- 输入空字符串时返回空字符串
- 输入已污染内容时返回纯净正文

### 6. `src/memory/context/context-builder.ts`

- 导出了 `buildMemoryContextBlock(rawContext: string): string`
- 输入空字符串返回空字符串
- 输入仅空白返回空字符串
- 非空输入会先经过 `sanitizeContext`
- 输出包含 `<memory-context>` 开始标签
- 输出包含 `</memory-context>` 结束标签
- 输出包含 system note
- 输出中的正文是 sanitize 后的内容
- 不会重复嵌套 `memory-context` 标签

### 7. `src/memory/security/threat-patterns.ts`

- 导出了 `ThreatPattern` 类型
- 导出了 `MEMORY_THREAT_PATTERNS`
- 导出了 `INVISIBLE_UNICODE_CHARS`
- threat patterns 至少覆盖 prompt injection
- threat patterns 至少覆盖 role hijack
- threat patterns 至少覆盖 secret exfiltration
- threat patterns 至少覆盖 `.env / credentials` 读取
- threat patterns 至少覆盖 `.ssh / authorized_keys`
- `pattern` 已编译为 `RegExp`
- `pattern` 带有可识别的 `id`

### 8. `src/memory/security/content-scanner.ts`

- 导出了 `ScanResult`
- 导出了 `scanMemoryContent(content: string): ScanResult`
- 能检测 invisible unicode
- invisible unicode 命中时返回 `ok: false`
- threat pattern 命中时返回 `ok: false`
- 返回结果包含 `reason`
- 命中 pattern 时返回 `patternId`
- 正常内容返回 `ok: true`
- 不会因为空字符串抛异常
- scanner 是纯函数，无副作用

### 9. `src/memory/store/models.ts`

- 导出了 `ENTRY_DELIMITER = "\n§\n"`
- 定义了 `MemoryOperationSuccess`
- 定义了 `MemoryOperationFailure`
- 定义了 `MemoryOperationResult`
- success 响应包含 `target`
- success 响应包含 `entries`
- success 响应包含 `usage`
- success 响应包含 `entry_count`
- failure 响应包含 `error`
- failure 响应支持 `matches/current_entries/usage`

### 10. `src/memory/store/memory-repository.ts`

- 定义了 `MemoryRepository` 接口
- 包含 `loadEntries(target)`
- 包含 `saveEntries(target, entries)`
- 包含 `withLock(target, fn)`
- `MemoryStore` 只依赖该接口，不直接依赖 `fs`

### 11. `src/memory/store/file-memory-repository.ts`

#### 路径与文件

- 支持通过 `baseDir` 注入根路径
- `memory` 写到 `${baseDir}/memories/MEMORY.md`
- `user` 写到 `${baseDir}/memories/USER.md`
- 不存在目录时会自动创建

#### `loadEntries`

- 文件不存在时返回空数组
- 能用 `ENTRY_DELIMITER` 正确分割
- 会 `trim` 每个 entry
- 会忽略空 entry
- 返回 `MemoryEntry[]`

#### `saveEntries`

- 只写入 `entry.content`
- 用 `ENTRY_DELIMITER` 拼接内容
- 使用原子写
- 不直接覆写导致中途空文件暴露
- 写入异常会以 controlled error 或 rejection 表达

#### `withLock`

- 实现了进程内锁
- 同一 target 的临界区串行执行
- 不同 target 可独立执行，或至少行为明确
- 不要求跨进程锁，但实现中没有明显竞态 bug

### 12. `src/memory/store/memory-store.ts`

#### 初始化与快照

- `loadFromDisk()` 会分别加载 `memory` 与 `user`
- 加载后会做 dedupe
- dedupe 保留第一次出现顺序
- 初始化后生成 `systemPromptSnapshot`
- `formatForSystemPrompt()` 返回 frozen snapshot
- snapshot 在 session 内不会因后续 `add/replace/remove` 自动变化

#### `add`

- `add()` 会 `trim content`
- 空 `content` 被拒绝
- 写入前会调用 scanner
- exact duplicate 不会重复添加
- 添加前会检查字符上限
- 超上限时返回 failure 而非抛异常
- 成功后会落盘
- 成功响应包含 `usage` 和 `entry_count`

#### `replace`

- `oldText` 为空时返回 failure
- `newContent` 为空时返回 failure
- 替换内容写入前会调用 scanner
- 使用 substring 匹配
- `0` 个匹配时返回 failure
- 多个不同匹配时返回 failure
- 多个不同匹配时包含 matches preview
- 多个相同匹配时只替换第一个
- 替换后检查字符上限
- 替换成功会落盘

#### `remove`

- `oldText` 为空时返回 failure
- 使用 substring 匹配
- `0` 个匹配时返回 failure
- 多个不同匹配时返回 failure
- 多个不同匹配时包含 matches
- 多个相同匹配时只删除第一个
- 删除成功会落盘

#### 渲染与统计

- memory block header 正确
- user block header 正确
- usage 百分比计算合理
- usage 字符统计基于拼接后实际字符数
- 空 block 返回 `null` 或空，行为与 spec 一致

### 13. `src/memory/tools/memory-schema.ts`

- 导出了 `MEMORY_TOOL_SCHEMA`
- tool name 固定为 `memory`
- action enum 包含 `add/replace/remove`
- target enum 包含 `memory/user`
- schema 包含 `content`
- schema 包含 `old_text`
- description 说明了何时应写 memory
- description 区分了 `user` 与 `memory`
- description 提醒不要写 temporary task state

### 14. `src/memory/tools/memory-tool.ts`

- 导出了 `executeMemoryTool(args, store)`
- `action=add` 时缺少 `content` 会返回 JSON error
- `action=replace` 时缺少 `content` 或 `old_text` 会返回 JSON error
- `action=remove` 时缺少 `old_text` 会返回 JSON error
- 未知 action 返回 JSON error
- 成功返回 JSON string
- 失败返回 JSON string
- 不抛裸异常给业务层
- 返回值可被 `JSON.parse()` 正常解析

### 15. `src/memory/provider/builtin-memory-provider.ts`

- 继承 `MemoryProvider`
- `name === "builtin"`
- `isAvailable()` 返回 `true`
- `initialize()` 调用 `store.loadFromDisk()`
- `systemPromptBlock()` 会组合 `memory/user snapshot`
- snapshot 为空时不会插入多余空行
- `prefetch()` 第一版返回空字符串
- `syncTurn()` 第一版为 no-op
- `getToolSchemas()` 返回 `[MEMORY_TOOL_SCHEMA]`
- `handleToolCall("memory", ...)` 能正确调用 tool executor
- 非 memory tool 会返回 controlled error 或 JSON error

### 16. `src/memory/kernel/memory-kernel.ts`

- 内部组合 `MemoryManager`
- 支持通过构造参数注入 providers
- `initialize()` 调用 manager 初始化
- `buildSystemPrompt()` 透传 manager 结果
- `prefetch()` 透传 manager 结果
- `getToolSchemas()` 透传 manager 结果
- `hasTool()` 透传 manager 结果
- `handleToolCall()` 透传 manager 路由
- `syncTurn()` 透传 manager
- `queuePrefetch()` 透传 manager
- `onTurnStart()` 透传 manager
- `onSessionEnd()` 透传 manager
- `shutdown()` 透传 manager
- kernel 本身不做额外业务耦合逻辑

### 17. `src/memory/index.ts`

- re-export 了 `MemoryKernel`
- re-export 了 `MemoryManager`
- re-export 了 `MemoryProvider`
- re-export 了 `BuiltinMemoryProvider`
- re-export 了 `MemoryStore`
- re-export 了 `FileMemoryRepository`
- re-export 了 `MEMORY_TOOL_SCHEMA`
- re-export 了 `buildMemoryContextBlock`
- re-export 了 `sanitizeContext`
- re-export 了 `scanMemoryContent`
- re-export 了核心 types
- 业务侧只 import 这个入口即可完成接入

## C. 行为级验收

### C1. 典型 Happy Path

- 初始化 kernel 后，`buildSystemPrompt()` 可返回已有 snapshot
- 调用 `handleToolCall("memory", add-user)` 能成功写入用户偏好
- 写入后同 session 的 `buildSystemPrompt()` 仍保持旧 snapshot
- 新建 session 并重新 `initialize` 后，新的 snapshot 可看到刚写入内容

### C2. 边界行为

- 重复 `add` 同一内容不产生 duplicate
- `replace` 时 `old_text` 不唯一会返回 ambiguity error
- `remove` 时 `old_text` 不唯一会返回 ambiguity error
- `content` 带注入 payload 会被 scanner 拦截
- `content` 带 invisible unicode 会被拦截

### C3. Manager 容错

- 某 provider 的 `prefetch()` 抛错时，其他 provider 仍可返回 recall
- 某 provider 的 `syncTurn()` 抛错时，不影响整体调用结束
- 某 provider 的 `systemPromptBlock()` 抛错时，其它 block 仍可被收集

## D. 测试文件级 Checklist

如果你让 Codex 补测试，可以要求它逐项覆盖：

### D1. `memory-store.test.ts`

- `add success`
- `add duplicate no-op`
- `add empty reject`
- `add over limit reject`
- `replace single match success`
- `replace no match failure`
- `replace ambiguous failure`
- `remove single match success`
- `remove ambiguous failure`
- `snapshot immutability`

### D2. `content-scanner.test.ts`

- `prompt injection blocked`
- `exfil pattern blocked`
- `invisible unicode blocked`
- `normal preference text allowed`

### D3. `memory-manager.test.ts`

- `builtin registration`
- `second external rejected`
- `tool routing success`
- `provider failure isolation`

### D4. `context-builder.test.ts`

- `empty input => empty string`
- `non-empty input => fenced block`
- `nested memory-context sanitized`
