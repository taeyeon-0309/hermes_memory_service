# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository scope

This repository currently contains specification and acceptance artifacts for implementing a TypeScript memory module intended for a Node.js agent runtime.

Primary source files:
- `plan.md` — implementation spec and integration contract
- `checklist.md` — acceptance criteria and behavior-level verification checklist

## Common commands

There is no buildable code in this repository yet (no `package.json`, `pyproject.toml`, or `Cargo.toml`).

Use these commands for current workflow:

```bash
# Review implementation requirements
cat plan.md

# Review acceptance checklist
cat checklist.md

# Inspect current repository contents
ls -la
```

Single-test, lint, and build commands are not defined yet because tests and runtime source files are not present.

## Architecture (specified target design)

The spec in `plan.md` defines a provider-oriented memory subsystem under `src/memory/` with these layers:

- `kernel/`
  - `MemoryKernel`: external facade for business integration
  - `MemoryManager`: orchestrates providers, tool routing, and best-effort isolation
  - shared types and error model
- `provider/`
  - `MemoryProvider` abstract base
  - `BuiltinMemoryProvider` as the first-party provider wrapping local store behavior
- `store/`
  - `MemoryRepository` abstraction
  - `FileMemoryRepository` (file-backed persistence)
  - `MemoryStore` for memory semantics (`add/replace/remove`, limits, snapshot behavior)
- `tools/`
  - `memory` tool schema and executor
- `context/`
  - context sanitize/build helpers for fenced memory recall blocks
- `security/`
  - threat patterns and content scanning before write operations

### Core design constraints from spec

- TypeScript-only module with typed public API
- Decoupled from specific LLM SDK, tool registry, and config system
- Memory path injected externally (no hardcoded user directory)
- Built-in provider always allowed; at most one external provider
- Provider failures are isolated (best-effort manager behavior)
- All memory writes pass security scanning
- Session-level frozen snapshot semantics for system prompt memory
- Tool responses are JSON strings
- MVP excludes vector retrieval/embeddings, auto memory extraction, transcript archive, plugin auto-discovery, and cross-process locks

## Integration contract

The intended usage flow (from `plan.md`) is:

1. Construct file repository with injected `baseDir`
2. Construct `MemoryStore`
3. Wrap store with `BuiltinMemoryProvider`
4. Register provider(s) in `MemoryKernel`
5. Call `initialize(sessionId, context)`
6. Consume:
   - `buildSystemPrompt()` for frozen prompt snapshot blocks
   - `prefetch()` + context builder for recall injection
   - `getToolSchemas()` + `handleToolCall("memory", ...)` for runtime tool operations
   - lifecycle hooks (`syncTurn`, `onTurnStart`, `onSessionEnd`, `shutdown`)

## Acceptance focus

`checklist.md` is the validation authority and should guide implementation/review. It emphasizes:

- provider registration and isolation semantics
- exact tool routing/error JSON behavior
- frozen snapshot behavior across sessions
- ambiguity handling for `replace/remove`
- scanner rejection for injection/exfiltration/invisible unicode patterns
- context fencing/sanitization behavior
