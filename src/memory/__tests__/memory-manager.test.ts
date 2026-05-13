import { describe, expect, it } from "vitest";
import { MemoryManager } from "../kernel/memory-manager";
import { MemoryProvider } from "../provider/memory-provider";
import { ChatMessage, MemoryRuntimeContext, ToolSchema } from "../kernel/types";

class StubProvider extends MemoryProvider {
  readonly name: string;
  private readonly schemas: ToolSchema[];
  private readonly shouldFailPrefetch: boolean;
  private readonly failToolCall: boolean;
  private readonly shouldFailSync: boolean;
  private readonly shouldFailSystemPrompt: boolean;
  memoryWrites: Array<{ action: string; target: string; content: string }> = [];

  constructor(
    name: string,
    toolNames: string[] = [],
    shouldFailPrefetch = false,
    failToolCall = false,
    shouldFailSync = false,
    shouldFailSystemPrompt = false
  ) {
    super();
    this.name = name;
    this.schemas = toolNames.map((tool) => ({ name: tool, description: "", parameters: {} }));
    this.shouldFailPrefetch = shouldFailPrefetch;
    this.failToolCall = failToolCall;
    this.shouldFailSync = shouldFailSync;
    this.shouldFailSystemPrompt = shouldFailSystemPrompt;
  }

  isAvailable(): boolean {
    return true;
  }

  async initialize(_sessionId: string, _context?: MemoryRuntimeContext): Promise<void> {}

  getToolSchemas(): ToolSchema[] {
    return this.schemas;
  }

  systemPromptBlock(): string {
    if (this.shouldFailSystemPrompt) {
      throw new Error("system prompt failed");
    }
    return `system:${this.name}`;
  }

  async handleToolCall(toolName: string): Promise<string> {
    if (this.failToolCall) {
      throw new Error("tool call failed");
    }
    return JSON.stringify({ success: true, toolName });
  }

  async prefetch(): Promise<string> {
    if (this.shouldFailPrefetch) {
      throw new Error("prefetch failed");
    }
    return this.name;
  }

  async syncTurn(_userContent: string, _assistantContent: string, _sessionId?: string): Promise<void> {
    if (this.shouldFailSync) {
      throw new Error("sync failed");
    }
  }

  async onMemoryWrite(action: string, target: string, content: string): Promise<void> {
    this.memoryWrites.push({ action, target, content });
  }

  async onSessionEnd(_messages: ChatMessage[]): Promise<void> {}
}

class ThrowingSchemaProvider extends MemoryProvider {
  readonly name = "external-throwing";

  isAvailable(): boolean {
    return true;
  }

  async initialize(_sessionId: string, _context?: MemoryRuntimeContext): Promise<void> {}

  getToolSchemas(): ToolSchema[] {
    throw new Error("schema discovery failed");
  }
}

describe("memory-manager", () => {
  it("accepts builtin and one external provider only", () => {
    const manager = new MemoryManager();
    manager.addProvider(new StubProvider("builtin", ["memory"]));
    manager.addProvider(new StubProvider("external-a", ["extA"]));
    manager.addProvider(new StubProvider("external-b", ["extB"]));

    const tools = manager.getAllToolSchemas().map((s: ToolSchema) => s.name);
    expect(tools).toContain("memory");
    expect(tools).toContain("extA");
    expect(tools).not.toContain("extB");
  });

  it("routes tool call to matching provider", async () => {
    const manager = new MemoryManager();
    manager.addProvider(new StubProvider("builtin", ["memory"]));

    const result = await manager.handleToolCall("memory", {});
    const parsed = JSON.parse(result) as { success: boolean; toolName: string };
    expect(parsed.success).toBe(true);
    expect(parsed.toolName).toBe("memory");
  });

  it("returns json error when tool is missing", async () => {
    const manager = new MemoryManager();
    const result = await manager.handleToolCall("missing", {});
    const parsed = JSON.parse(result) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("No provider found");
  });

  it("returns json error when provider tool call throws", async () => {
    const manager = new MemoryManager();
    manager.addProvider(new StubProvider("builtin", ["memory"], false, true));

    const result = await manager.handleToolCall("memory", {});
    const parsed = JSON.parse(result) as { success: boolean; error: string };
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("tool call failed");
  });

  it("isolates provider prefetch failures", async () => {
    const manager = new MemoryManager();
    manager.addProvider(new StubProvider("builtin", ["memory"]));
    manager.addProvider(new StubProvider("external", ["ext"], true));

    const result = await manager.prefetchAll("q");
    expect(result).toContain("builtin");
  });

  it("isolates provider sync failures", async () => {
    const manager = new MemoryManager();
    manager.addProvider(new StubProvider("builtin", ["memory"], false, false, true));
    manager.addProvider(new StubProvider("external", ["ext"]));

    await expect(manager.syncAll("u", "a", "s1")).resolves.toBeUndefined();
  });

  it("isolates provider systemPrompt failures", () => {
    const manager = new MemoryManager();
    manager.addProvider(new StubProvider("builtin", ["memory"], false, false, false, true));
    manager.addProvider(new StubProvider("external", ["ext"]));

    const result = manager.buildSystemPrompt();
    expect(result).toContain("system:external");
  });

  it("broadcasts memory writes to external providers but not builtin", async () => {
    const manager = new MemoryManager();
    const builtin = new StubProvider("builtin", ["memory"]);
    const external = new StubProvider("external", ["ext"]);
    manager.addProvider(builtin);
    manager.addProvider(external);

    await manager.onMemoryWrite("add", "user", "prefers ts");

    expect(builtin.memoryWrites).toEqual([]);
    expect(external.memoryWrites).toEqual([
      { action: "add", target: "user", content: "prefers ts" },
    ]);
  });

  it("does not throw when provider schema discovery fails during registration", () => {
    const manager = new MemoryManager();

    expect(() => manager.addProvider(new ThrowingSchemaProvider())).not.toThrow();
    expect(manager.getAllToolSchemas()).toEqual([]);
  });
});
