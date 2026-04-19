import { ToolCallContext, ToolSchema, MemoryToolArgs, MemoryRuntimeContext } from "../kernel/types";
import { MemoryProvider } from "./memory-provider";
import { MemoryStore } from "../store/memory-store";
import { MEMORY_TOOL_SCHEMA } from "../tools/memory-schema";
import { executeMemoryTool } from "../tools/memory-tool";

interface BuiltinMemoryProviderOptions {
  store: MemoryStore;
}

export class BuiltinMemoryProvider extends MemoryProvider {
  readonly name = "builtin";
  private readonly store: MemoryStore;

  constructor(options: BuiltinMemoryProviderOptions) {
    super();
    this.store = options.store;
  }

  isAvailable(): boolean {
    return true;
  }

  async initialize(_sessionId: string, _context?: MemoryRuntimeContext): Promise<void> {
    await this.store.loadFromDisk();
  }

  systemPromptBlock(): string {
    const memory = this.store.formatForSystemPrompt("memory");
    const user = this.store.formatForSystemPrompt("user");
    return [memory, user].filter((part): part is string => Boolean(part)).join("\n\n");
  }

  async prefetch(_query: string, _sessionId?: string): Promise<string> {
    return "";
  }

  async syncTurn(
    _userContent: string,
    _assistantContent: string,
    _sessionId?: string
  ): Promise<void> {}

  getToolSchemas(): ToolSchema[] {
    return [MEMORY_TOOL_SCHEMA];
  }

  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
    _context?: ToolCallContext
  ): Promise<string> {
    if (toolName !== "memory") {
      return JSON.stringify({ success: false, error: `Unsupported tool: ${toolName}` });
    }
    return executeMemoryTool(args as unknown as MemoryToolArgs, this.store);
  }
}
