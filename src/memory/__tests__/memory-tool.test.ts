import { describe, expect, it } from "vitest";
import { executeMemoryTool } from "../tools/memory-tool";

interface FakeStore {
  add: (target: "memory" | "user", content: string) => Promise<unknown>;
  replace: (target: "memory" | "user", oldText: string, content: string) => Promise<unknown>;
  remove: (target: "memory" | "user", oldText: string) => Promise<unknown>;
}

const okStore: FakeStore = {
  async add(target, content) {
    return { success: true, target, entries: [content], usage: "1% — 1/100 chars", entry_count: 1 };
  },
  async replace(target, oldText, content) {
    return { success: true, target, entries: [oldText, content], usage: "2% — 2/100 chars", entry_count: 2 };
  },
  async remove(target, oldText) {
    return { success: true, target, entries: [oldText], usage: "1% — 1/100 chars", entry_count: 1 };
  },
};

describe("memory-tool", () => {
  it("returns json error for missing add content", async () => {
    const result = await executeMemoryTool(
      { action: "add", target: "memory" },
      okStore as unknown as never
    );
    const parsed = JSON.parse(result) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("content is required");
  });

  it("returns json error for missing replace args", async () => {
    const result = await executeMemoryTool(
      { action: "replace", target: "memory", content: "x" },
      okStore as unknown as never
    );
    const parsed = JSON.parse(result) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("old_text and content are required");
  });

  it("returns json error for missing remove old_text", async () => {
    const result = await executeMemoryTool(
      { action: "remove", target: "memory" },
      okStore as unknown as never
    );
    const parsed = JSON.parse(result) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("old_text is required");
  });

  it("returns json error for unsupported action", async () => {
    const result = await executeMemoryTool(
      { action: "unsupported", target: "memory" } as unknown as never,
      okStore as unknown as never
    );
    const parsed = JSON.parse(result) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Unsupported action");
  });

  it("returns json string on success", async () => {
    const result = await executeMemoryTool(
      { action: "add", target: "user", content: "prefers ts" },
      okStore as unknown as never
    );
    const parsed = JSON.parse(result) as { success: boolean; target: string };
    expect(parsed.success).toBe(true);
    expect(parsed.target).toBe("user");
  });

  it("does not throw raw error and returns json when store throws", async () => {
    const badStore: FakeStore = {
      async add() {
        throw new Error("boom");
      },
      async replace() {
        throw new Error("boom");
      },
      async remove() {
        throw new Error("boom");
      },
    };

    const result = await executeMemoryTool(
      { action: "add", target: "memory", content: "x" },
      badStore as unknown as never
    );
    const parsed = JSON.parse(result) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("boom");
  });
});
