import { describe, expect, it } from "vitest";
import { MemoryKernel } from "../kernel/memory-kernel";
import { MemoryProvider } from "../provider/memory-provider";
import { ChatMessage, MemoryRuntimeContext, ToolSchema } from "../kernel/types";

class KernelStubProvider extends MemoryProvider {
  readonly name = "builtin";
  initializedWith?: { sessionId: string; context?: MemoryRuntimeContext };

  isAvailable(): boolean {
    return true;
  }

  async initialize(sessionId: string, context?: MemoryRuntimeContext): Promise<void> {
    this.initializedWith = { sessionId, context };
  }

  systemPromptBlock(): string {
    return "stub-block";
  }

  async prefetch(query: string): Promise<string> {
    return `prefetch:${query}`;
  }

  getToolSchemas(): ToolSchema[] {
    return [{ name: "memory", description: "", parameters: {} }];
  }

  async handleToolCall(toolName: string): Promise<string> {
    return JSON.stringify({ success: true, toolName });
  }

  async onPreCompress(_messages: ChatMessage[]): Promise<string> {
    return "pre-compress-block";
  }

  async syncTurn(): Promise<void> {}
  async queuePrefetch(): Promise<void> {}
  async onTurnStart(): Promise<void> {}
  async onSessionEnd(_messages: ChatMessage[]): Promise<void> {}
  async shutdown(): Promise<void> {}
}

describe("memory-kernel", () => {
  it("passes through manager-facing behavior", async () => {
    const provider = new KernelStubProvider();
    const kernel = new MemoryKernel({ providers: [provider] });

    await kernel.initialize("s1", { platform: "cli" });
    expect(provider.initializedWith?.sessionId).toBe("s1");

    expect(kernel.buildSystemPrompt()).toBe("stub-block");
    await expect(kernel.prefetch("q")).resolves.toContain("prefetch:q");
    expect(kernel.hasTool("memory")).toBe(true);

    const result = await kernel.handleToolCall("memory", {});
    const parsed = JSON.parse(result) as { success: boolean; toolName: string };
    expect(parsed.success).toBe(true);
    expect(parsed.toolName).toBe("memory");

    await expect(kernel.syncTurn("u", "a", "s1")).resolves.toBeUndefined();
    await expect(kernel.queuePrefetch("q", "s1")).resolves.toBeUndefined();
    await expect(kernel.onTurnStart(1, "hello")).resolves.toBeUndefined();
    await expect(kernel.onSessionEnd([])).resolves.toBeUndefined();
    await expect(kernel.onPreCompress([])).resolves.toBe("pre-compress-block");
    await expect(kernel.shutdown()).resolves.toBeUndefined();
  });
});
