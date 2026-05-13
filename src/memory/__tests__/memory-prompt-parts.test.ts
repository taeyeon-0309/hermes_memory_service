import { describe, expect, it } from "vitest";
import { MemoryKernel } from "../kernel/memory-kernel";
import { MemoryProvider } from "../provider/memory-provider";
import { MemoryRuntimeContext, ToolSchema } from "../kernel/types";

class PromptPartsStubProvider extends MemoryProvider {
  readonly name = "builtin";

  isAvailable(): boolean {
    return true;
  }

  async initialize(_sessionId: string, _context?: MemoryRuntimeContext): Promise<void> {}

  systemPromptBlock(): string {
    return "system-memory-block";
  }

  async prefetch(query: string): Promise<string> {
    return query === "typescript" ? "USER:\n- prefers TypeScript" : "";
  }

  getToolSchemas(): ToolSchema[] {
    return [];
  }
}

describe("memory-prompt-parts", () => {
  it("builds guidance, frozen system memory, and fenced recall blocks", async () => {
    const kernel = new MemoryKernel({
      providers: [new PromptPartsStubProvider()],
    });

    const parts = await kernel.buildPromptParts("typescript", "session-1");

    expect(parts.guidanceBlock).toContain("memory tool");
    expect(parts.systemMemoryBlock).toBe("system-memory-block");
    expect(parts.recallBlock).toContain("<memory-context>");
    expect(parts.recallBlock).toContain("prefers TypeScript");
  });

  it("returns an empty recall block when nothing is recalled", async () => {
    const kernel = new MemoryKernel({
      providers: [new PromptPartsStubProvider()],
    });

    const parts = await kernel.buildPromptParts("missing", "session-1");
    expect(parts.recallBlock).toBe("");
  });
});
