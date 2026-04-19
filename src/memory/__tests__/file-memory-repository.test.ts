import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { FileMemoryRepository } from "../store/file-memory-repository";
import { ENTRY_DELIMITER } from "../store/models";

describe("file-memory-repository", () => {
  it("returns empty array when file does not exist", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "memory-repo-"));
    try {
      const repo = new FileMemoryRepository({ baseDir });
      const entries = await repo.loadEntries("memory");
      expect(entries).toEqual([]);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("saves and loads entries using delimiter and trimming", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "memory-repo-"));
    try {
      const repo = new FileMemoryRepository({ baseDir });
      const now = new Date().toISOString();
      await repo.saveEntries("memory", [
        { id: "1", target: "memory", content: "alpha", createdAt: now, updatedAt: now },
        { id: "2", target: "memory", content: "beta", createdAt: now, updatedAt: now },
      ]);

      const file = path.join(baseDir, "memories", "MEMORY.md");
      const raw = await readFile(file, "utf8");
      expect(raw).toContain(`alpha${ENTRY_DELIMITER}beta`);

      const loaded = await repo.loadEntries("memory");
      expect(loaded.map((e) => e.content)).toEqual(["alpha", "beta"]);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("serializes critical section per target with withLock", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "memory-repo-"));
    try {
      const repo = new FileMemoryRepository({ baseDir });
      const order: string[] = [];

      const p1 = repo.withLock("memory", async () => {
        order.push("start-1");
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("end-1");
      });

      const p2 = repo.withLock("memory", async () => {
        order.push("start-2");
        order.push("end-2");
      });

      await Promise.all([p1, p2]);
      expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
