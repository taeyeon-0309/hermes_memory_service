import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory-store";
import { MemoryEntry, MemoryTarget } from "../kernel/types";
import { MemoryRepository } from "../store/memory-repository";

class InMemoryRepo implements MemoryRepository {
  private memory: MemoryEntry[] = [];
  private user: MemoryEntry[] = [];

  async loadEntries(target: MemoryTarget): Promise<MemoryEntry[]> {
    return target === "memory" ? [...this.memory] : [...this.user];
  }

  async saveEntries(target: MemoryTarget, entries: MemoryEntry[]): Promise<void> {
    if (target === "memory") {
      this.memory = [...entries];
    } else {
      this.user = [...entries];
    }
  }

  async withLock<T>(_target: MemoryTarget, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

describe("memory-store", () => {
  it("adds entries and avoids duplicates", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo() });

    const first = await store.add("memory", "foo");
    const second = await store.add("memory", "foo");

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (second.success) {
      expect(second.entry_count).toBe(1);
    }
  });

  it("rejects empty add content", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo() });
    const result = await store.add("memory", "   ");
    expect(result.success).toBe(false);
  });

  it("rejects over limit add", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo(), memoryCharLimit: 3 });
    const result = await store.add("memory", "hello");
    expect(result.success).toBe(false);
  });

  it("counts delimiter characters when enforcing limits", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo(), memoryCharLimit: 5 });

    const first = await store.add("memory", "aa");
    const second = await store.add("memory", "bb");

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
  });

  it("replaces single match and fails missing match", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo() });
    await store.add("memory", "alpha note");

    const ok = await store.replace("memory", "alpha", "beta note");
    const fail = await store.replace("memory", "missing", "gamma");

    expect(ok.success).toBe(true);
    expect(fail.success).toBe(false);
  });

  it("replaces first when duplicate entries are identical", async () => {
    const repo = new InMemoryRepo();
    const now = new Date().toISOString();
    await repo.saveEntries("memory", [
      { id: "1", target: "memory", content: "alpha same", createdAt: now, updatedAt: now },
      { id: "2", target: "memory", content: "alpha same", createdAt: now, updatedAt: now },
    ]);

    const store = new MemoryStore({ repository: repo });
    const result = await store.replace("memory", "alpha", "beta same");
    expect(result.success).toBe(true);
  });

  it("fails replace/remove on ambiguous different matches", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo() });
    await store.add("memory", "alpha one");
    await store.add("memory", "alpha two");

    const rep = await store.replace("memory", "alpha", "beta");
    const rem = await store.remove("memory", "alpha");

    expect(rep.success).toBe(false);
    expect(rem.success).toBe(false);
  });

  it("keeps system prompt snapshot frozen within session", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo() });
    await store.loadFromDisk();
    await store.add("user", "prefers ts");

    expect(store.formatForSystemPrompt("user")).toBeNull();

    await store.loadFromDisk();
    expect(store.formatForSystemPrompt("user")).toContain("prefers ts");
  });

  it("returns stable recall results with user entries ranked ahead of memory", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo() });
    await store.add("memory", "TypeScript coding style note");
    await store.add("user", "The user prefers TypeScript");
    await store.add("user", "The user prefers TypeScript");

    const results = await store.search("TypeScript", { limit: 5 });

    expect(results).toHaveLength(2);
    expect(results[0]?.target).toBe("user");
    expect(results[0]?.content).toContain("prefers TypeScript");
    expect(results[1]?.target).toBe("memory");
  });

  it("returns empty recall results for blank or unmatched queries", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo() });
    await store.add("user", "prefers ts");

    await expect(store.search("   ")).resolves.toEqual([]);
    await expect(store.search("python")).resolves.toEqual([]);
  });

  it("respects recall result limits and keeps ordering stable", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo() });
    await store.add("user", "The user prefers TypeScript");
    await store.add("memory", "TypeScript coding conventions");
    await store.add("memory", "TypeScript release checklist");

    const results = await store.search("TypeScript", { limit: 2 });

    expect(results).toHaveLength(2);
    expect(results[0]?.target).toBe("user");
    expect(results[1]?.content).toContain("coding conventions");
  });

  it("respects max character budget and truncates oversized first result", async () => {
    const store = new MemoryStore({ repository: new InMemoryRepo() });
    await store.add("user", "TypeScript preference with a very long explanation");
    await store.add("memory", "TypeScript coding conventions");

    const truncated = await store.search("TypeScript", { maxCharacters: 12 });
    expect(truncated).toHaveLength(1);
    expect(truncated[0]?.content).toBe("TypeScript...");

    const bounded = await store.search("TypeScript", { maxCharacters: 55 });
    expect(bounded).toHaveLength(1);
    expect(bounded[0]?.content).toContain("preference");
  });
});
