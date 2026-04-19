import { ChatMessage, MemoryRuntimeContext, ToolCallContext, ToolSchema, TurnContext } from "./types";
import { MemoryProvider } from "../provider/memory-provider";

function toErrorJson(error: unknown): string {
  return JSON.stringify({
    success: false,
    error: error instanceof Error ? error.message : "Unknown provider error",
  });
}

export class MemoryManager {
  private providers: MemoryProvider[] = [];
  private toolToProvider = new Map<string, MemoryProvider>();
  private hasExternal = false;

  addProvider(provider: MemoryProvider): void {
    const isBuiltin = provider.name === "builtin";

    if (!isBuiltin) {
      if (this.hasExternal) {
        return;
      }
      this.hasExternal = true;
    }

    this.providers.push(provider);

    try {
      for (const schema of provider.getToolSchemas()) {
        if (!this.toolToProvider.has(schema.name)) {
          this.toolToProvider.set(schema.name, provider);
        }
      }
    } catch {
    }
  }

  async initializeAll(sessionId: string, context?: MemoryRuntimeContext): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.initialize(sessionId, context);
      } catch {
      }
    }
  }

  buildSystemPrompt(): string {
    const blocks: string[] = [];
    for (const provider of this.providers) {
      try {
        const block = provider.systemPromptBlock();
        if (block.trim().length > 0) {
          blocks.push(block);
        }
      } catch {
      }
    }
    return blocks.join("\n\n");
  }

  async prefetchAll(query: string, sessionId?: string): Promise<string> {
    const parts: string[] = [];
    for (const provider of this.providers) {
      try {
        const value = await provider.prefetch(query, sessionId);
        if (value.trim().length > 0) {
          parts.push(value);
        }
      } catch {
      }
    }
    return parts.join("\n\n");
  }

  async queuePrefetchAll(query: string, sessionId?: string): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.queuePrefetch(query, sessionId);
      } catch {
      }
    }
  }

  async syncAll(userContent: string, assistantContent: string, sessionId?: string): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.syncTurn(userContent, assistantContent, sessionId);
      } catch {
      }
    }
  }

  getAllToolSchemas(): ToolSchema[] {
    const seen = new Set<string>();
    const schemas: ToolSchema[] = [];
    for (const provider of this.providers) {
      try {
        for (const schema of provider.getToolSchemas()) {
          if (seen.has(schema.name)) {
            continue;
          }
          seen.add(schema.name);
          schemas.push(schema);
        }
      } catch {
      }
    }
    return schemas;
  }

  hasTool(toolName: string): boolean {
    return this.toolToProvider.has(toolName);
  }

  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
    context?: ToolCallContext
  ): Promise<string> {
    const provider = this.toolToProvider.get(toolName);
    if (!provider) {
      return JSON.stringify({ success: false, error: `No provider found for tool: ${toolName}` });
    }

    try {
      return await provider.handleToolCall(toolName, args, context);
    } catch (error) {
      return toErrorJson(error);
    }
  }

  async onTurnStart(turnNumber: number, message: string, context?: TurnContext): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.onTurnStart(turnNumber, message, context);
      } catch {
      }
    }
  }

  async onSessionEnd(messages: ChatMessage[]): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.onSessionEnd(messages);
      } catch {
      }
    }
  }

  async onPreCompress(messages: ChatMessage[]): Promise<string> {
    const blocks: string[] = [];
    for (const provider of this.providers) {
      try {
        const block = await provider.onPreCompress(messages);
        if (block.trim().length > 0) {
          blocks.push(block);
        }
      } catch {
      }
    }
    return blocks.join("\n\n");
  }

  async onMemoryWrite(action: string, target: string, content: string): Promise<void> {
    for (const provider of this.providers) {
      if (provider.name === "builtin") {
        continue;
      }
      try {
        await provider.onMemoryWrite(action, target, content);
      } catch {
      }
    }
  }

  async onDelegation(
    task: string,
    result: string,
    context?: Record<string, unknown>
  ): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.onDelegation(task, result, context);
      } catch {
      }
    }
  }

  async shutdownAll(): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.shutdown();
      } catch {
      }
    }
  }
}
