import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileMemoryRepository } from "../store/file-memory-repository";
import { MemoryStore } from "../store/memory-store";
import { BuiltinMemoryProvider } from "../provider/builtin-memory-provider";
import { MemoryKernel } from "../kernel/memory-kernel";

describe("memory integration happy path", () => {
  it("keeps snapshot frozen in-session and refreshes next session", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "memory-kernel-"));
    try {
      const now = new Date().toISOString();
      const repository = new FileMemoryRepository({ baseDir });
      await repository.saveEntries("user", [
        {
          id: "seed",
          target: "user",
          content: "existing preference",
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const store1 = new MemoryStore({ repository });
      const kernel1 = new MemoryKernel({
        providers: [new BuiltinMemoryProvider({ store: store1 })],
      });

      await kernel1.initialize("session-1", { platform: "cli" });
      const firstPrompt = kernel1.buildSystemPrompt();
      expect(firstPrompt).toContain("existing preference");

      const addResult = await kernel1.handleToolCall("memory", {
        action: "add",
        target: "user",
        content: "new preference",
      });
      const addParsed = JSON.parse(addResult) as { success: boolean };
      expect(addParsed.success).toBe(true);

      const frozenPrompt = kernel1.buildSystemPrompt();
      expect(frozenPrompt).toContain("existing preference");
      expect(frozenPrompt).not.toContain("new preference");

      const recalledPrompt = await kernel1.prefetch("new preference", "session-1");
      expect(recalledPrompt).toContain("USER:");
      expect(recalledPrompt).toContain("new preference");
      expect(recalledPrompt.indexOf("new preference")).toBeLessThan(
        recalledPrompt.indexOf("existing preference")
      );

      const store2 = new MemoryStore({ repository });
      const kernel2 = new MemoryKernel({
        providers: [new BuiltinMemoryProvider({ store: store2 })],
      });
      await kernel2.initialize("session-2", { platform: "cli" });

      const refreshedPrompt = kernel2.buildSystemPrompt();
      expect(refreshedPrompt).toContain("new preference");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("keeps snapshot frozen while recall can read newly written memory in the same session", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "memory-kernel-"));
    try {
      const repository = new FileMemoryRepository({ baseDir });
      const store = new MemoryStore({ repository });
      const kernel = new MemoryKernel({
        providers: [new BuiltinMemoryProvider({ store })],
      });

      await kernel.initialize("session-live-recall", { platform: "cli" });
      expect(kernel.buildSystemPrompt()).toBe("");

      const addResult = await kernel.handleToolCall("memory", {
        action: "add",
        target: "user",
        content: "The user prefers deterministic tooling",
      });
      expect(JSON.parse(addResult).success).toBe(true);

      expect(kernel.buildSystemPrompt()).toBe("");
      await expect(kernel.prefetch("deterministic tooling", "session-live-recall")).resolves.toContain(
        "deterministic tooling"
      );
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("returns empty recall when nothing matches", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "memory-kernel-"));
    try {
      const store = new MemoryStore({ repository: new FileMemoryRepository({ baseDir }) });
      const kernel = new MemoryKernel({
        providers: [new BuiltinMemoryProvider({ store })],
      });

      await kernel.initialize("session-empty", { platform: "cli" });
      await expect(kernel.prefetch("missing topic", "session-empty")).resolves.toBe("");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("caps recall output to a readable size", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "memory-kernel-"));
    try {
      const repository = new FileMemoryRepository({ baseDir });
      const now = new Date().toISOString();
      await repository.saveEntries("user", [
        {
          id: "1",
          target: "user",
          content:
            "TypeScript preference with a very long explanation that should dominate the recall budget for this query.",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "2",
          target: "user",
          content:
            "TypeScript secondary preference that should be omitted once the recall block reaches its size budget.",
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const kernel = new MemoryKernel({
        providers: [new BuiltinMemoryProvider({ store: new MemoryStore({ repository }) })],
      });

      await kernel.initialize("session-budget", { platform: "cli" });
      const recalled = await kernel.prefetch("TypeScript preference", "session-budget");

      expect(recalled).toContain("USER:");
      expect(recalled.length).toBeLessThanOrEqual(220);
      expect(recalled).toContain("should dominate the recall budget");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
