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
});
