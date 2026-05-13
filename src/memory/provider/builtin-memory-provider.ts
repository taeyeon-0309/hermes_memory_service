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
  private static readonly PREFETCH_MAX_CHARACTERS = 220;

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

  async prefetch(query: string, _sessionId?: string): Promise<string> {
    const results = await this.store.search(query, {
      targets: ["user", "memory"],
      limit: 5,
      maxCharacters: BuiltinMemoryProvider.PREFETCH_MAX_CHARACTERS,
    });

    if (results.length === 0) {
      return "";
    }

    const userEntries = results.filter((result) => result.target === "user");
    const memoryEntries = results.filter((result) => result.target === "memory");
    return this.renderRecallBlocks(userEntries, memoryEntries);
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

  private renderRecallBlocks(
    userEntries: Array<{ content: string }>,
    memoryEntries: Array<{ content: string }>
  ): string {
    const blocks: string[] = [];
    let used = 0;

    const appendBlock = (title: string, entries: Array<{ content: string }>): void => {
      if (entries.length === 0) {
        return;
      }

      const lines: string[] = [];
      const prefixCost = blocks.length === 0 ? 0 : 2;
      const titleCost = title.length + 2;

      if (used + prefixCost + titleCost > BuiltinMemoryProvider.PREFETCH_MAX_CHARACTERS) {
        return;
      }

      let blockChars = titleCost;
      for (const entry of entries) {
        const line = `- ${entry.content}`;
        const lineCost = line.length + 1;
        if (lines.length > 0 && used + prefixCost + blockChars + lineCost > BuiltinMemoryProvider.PREFETCH_MAX_CHARACTERS) {
          break;
        }
        if (lines.length === 0 && used + prefixCost + blockChars + line.length > BuiltinMemoryProvider.PREFETCH_MAX_CHARACTERS) {
          break;
        }
        lines.push(line);
        blockChars += lineCost;
      }

      if (lines.length === 0) {
        return;
      }

      const block = `${title}:\n${lines.join("\n")}`;
      blocks.push(block);
      used += prefixCost + block.length;
    };

    appendBlock("USER", userEntries);
    appendBlock("MEMORY", memoryEntries);

    return blocks.join("\n\n");
  }
}
