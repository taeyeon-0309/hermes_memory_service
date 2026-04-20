# Hermes Memory Module Embed Guide

This README explains how to embed and call the memory module in another agent application.

## What this module provides

- Long-term memory storage with two targets: `memory` and `user`
- Unified memory tool (`add | replace | remove`)
- Provider architecture (`MemoryProvider`, `MemoryManager`, `MemoryKernel`)
- File-based persistence (`FileMemoryRepository`)
- Session-frozen system prompt snapshot semantics
- Memory recall fencing (`buildMemoryContextBlock`)
- Security scanning before writes (`scanMemoryContent`)

## Runtime requirements

- Node.js 18+
- TypeScript
- ESM environment

## Current project commands

```bash
npm install
npm run typecheck
npm test
```

---

## 1) Minimal embedding (built-in provider only)

```ts
import {
  BuiltinMemoryProvider,
  FileMemoryRepository,
  MemoryKernel,
  MemoryStore,
  buildMemoryContextBlock,
} from "./src/memory/index";

const repository = new FileMemoryRepository({
  baseDir: "./data", // injected path, do not hardcode user home
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

// frozen memory snapshot for system prompt
const memorySystemBlock = kernel.buildSystemPrompt();

// optional recall block for current user query
const recalled = await kernel.prefetch("user asked about coding preferences", "session-001");
const recallBlock = buildMemoryContextBlock(recalled);
```

---

## 2) Tool registration and dispatch

Use `kernel.getToolSchemas()` as tool definitions for your LLM runtime.

```ts
const tools = kernel.getToolSchemas();

// pass tools to your model call
// modelResponse = await model.generate({ messages, tools })
```

When the model asks to call tool `memory`, dispatch through kernel:

```ts
const toolResult = await kernel.handleToolCall("memory", {
  action: "add",          // add | replace | remove
  target: "user",         // memory | user
  content: "User prefers concise answers",
  // old_text: "..."       // required for replace/remove
});

// toolResult is always a JSON string
const parsed = JSON.parse(toolResult);
```

### Tool response format

Success (example):

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

Failure (example):

```json
{
  "success": false,
  "error": "old_text is required for remove"
}
```

---

## 3) How to assemble prompt context each turn

Recommended order per turn:

1. Core system prompt
2. `kernel.buildSystemPrompt()` (frozen snapshot)
3. Recall block from current query: `buildMemoryContextBlock(await kernel.prefetch(...))`
4. Current user message

Example:

```ts
const memorySystem = kernel.buildSystemPrompt();
const recalled = await kernel.prefetch(userMessage, sessionId);
const recallBlock = buildMemoryContextBlock(recalled);

const messages = [
  { role: "system", content: appSystemPrompt },
  ...(memorySystem ? [{ role: "system", content: memorySystem }] : []),
  ...(recallBlock ? [{ role: "system", content: recallBlock }] : []),
  { role: "user", content: userMessage },
];
```

---

## 4) Lifecycle hooks (recommended wiring)

```ts
await kernel.onTurnStart(turnNumber, userMessage, {
  model: "claude-sonnet-4-6",
  remainingTokens: 12000,
});

// after assistant reply
await kernel.syncTurn(userMessage, assistantReply, sessionId);

// when you run a pre-compress stage
const preCompressBlock = await kernel.onPreCompress(messages);

// session shutdown
await kernel.onSessionEnd(messages);
await kernel.shutdown();
```

---

## 5) Persistence layout

With `baseDir = ./data`, files are:

- `./data/memories/MEMORY.md`
- `./data/memories/USER.md`

Entries are persisted as plain text blocks, joined by delimiter `\n§\n`.

---

## 6) Snapshot semantics (important)

- `loadFromDisk()` creates a frozen snapshot used by `buildSystemPrompt()`.
- `add/replace/remove` write to disk immediately.
- The current session snapshot does **not** auto-refresh after writes.
- Refresh snapshot by initializing a new session (or reloading store and reinitializing kernel).

---

## 7) Extending with external providers

You can implement your own provider by extending `MemoryProvider` and passing it to `MemoryKernel`.

Notes:

- Built-in provider is always allowed.
- At most one external provider is accepted by `MemoryManager`.
- Provider failures are isolated (best-effort orchestration).

---

## 9) Production embedding patterns

### A. Single kernel per session (recommended)

Create one `MemoryKernel` per user session/conversation. This matches frozen snapshot semantics and prevents accidental cross-session state mixing.

```ts
function createSessionMemory(sessionId: string) {
  const repository = new FileMemoryRepository({ baseDir: "./data" });
  const store = new MemoryStore({ repository });
  const provider = new BuiltinMemoryProvider({ store });
  const kernel = new MemoryKernel({ providers: [provider] });
  return { sessionId, kernel };
}
```

### B. Handle malformed model tool args safely

`handleToolCall()` accepts `Record<string, unknown>`, so pass model output as-is and always parse result defensively:

```ts
const raw = await kernel.handleToolCall(toolName, toolArgsFromModel);
let toolPayload: { success?: boolean; error?: string };

try {
  toolPayload = JSON.parse(raw);
} catch {
  toolPayload = { success: false, error: "Invalid tool JSON response" };
}
```

### C. Refresh strategy after memory writes

Because snapshots are frozen per initialized session, choose one strategy:

1. Keep frozen snapshot until next session (current default)
2. Recreate kernel/store and reinitialize after a write if your app requires immediate visibility

---

## 10) Error handling contract

At integration boundaries, treat these APIs as follows:

- `kernel.handleToolCall()`
  - Returns JSON string for both success/failure
  - Missing tool/provider errors are returned as `{ success:false, error }`
- `kernel.syncTurn()/queuePrefetch()/onTurnStart()/onSessionEnd()/shutdown()`
  - Best-effort orchestration; provider-level failures are isolated
- `kernel.prefetch()` and `kernel.buildSystemPrompt()`
  - Aggregate non-empty provider output and skip failing providers

---

## 11) Security notes for integrators

- Built-in writes (`add/replace`) are scanned by `scanMemoryContent()` before persistence.
- Dangerous patterns (prompt injection, exfiltration signatures, hidden unicode) are blocked.
- Do not bypass `handleToolCall()` and write directly to repository unless you intentionally accept skipping policy checks.

---

## 12) Packaging and distribution

Current repository is configured for development checks (`typecheck`, `test`) but does not yet include an npm publish/build pipeline.

If you want to distribute this as a package, add:

- build step (e.g. `tsup` or `tsc` outDir)
- emitted declaration files
- `exports` map in `package.json`
- semantic versioning and changelog flow

Minimal target shape:

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

## 13) Operations checklist (prod)

- [ ] Ensure `baseDir` is writable in runtime environment
- [ ] Back up `memories/` directory if persistence durability matters
- [ ] Define retention policy for `MEMORY.md` / `USER.md`
- [ ] Monitor memory write rejection rates (scanner blocks)
- [ ] Define snapshot refresh policy (session-bound vs immediate reload)
- [ ] Run `npm run typecheck && npm test` in CI

---

## 14) Quick troubleshooting

### `No provider found for tool: memory`

- Confirm built-in provider is registered in `MemoryKernel` constructor.
- Confirm tool name is exactly `memory`.

### Writes succeed but prompt does not show latest memory

- Expected with frozen snapshot semantics.
- Reinitialize a new session/kernel to refresh snapshot.

### `success:false` from tool call

- Parse returned JSON and inspect `error`.
- Common causes: missing `content`, missing `old_text`, ambiguous match, scanner block.

---

## 8) Integration checklist for agent apps

- [ ] Call `initialize(sessionId, context)` before first turn
- [ ] Register `getToolSchemas()` into model tool config
- [ ] Dispatch tool calls via `handleToolCall()`
- [ ] Inject `buildSystemPrompt()` and optional recall block into prompt assembly
- [ ] Call `syncTurn()` after each assistant response
- [ ] Call `onSessionEnd()` + `shutdown()` on exit
