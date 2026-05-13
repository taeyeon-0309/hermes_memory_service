import { MemoryManager } from "./memory-manager";
import {
  ChatMessage,
  MemoryPromptParts,
  MemoryRuntimeContext,
  ToolCallContext,
  ToolSchema,
  TurnContext,
} from "./types";
import { MemoryProvider } from "../provider/memory-provider";
import { buildMemoryContextBlock } from "../context/context-builder";
import { buildMemoryGuidancePrompt } from "../prompt/memory-guidance";

interface MemoryKernelOptions {
  providers?: MemoryProvider[];
}

export class MemoryKernel {
  private readonly manager: MemoryManager;

  constructor(options: MemoryKernelOptions = {}) {
    this.manager = new MemoryManager();
    for (const provider of options.providers ?? []) {
      this.manager.addProvider(provider);
    }
  }

  async initialize(sessionId: string, context?: MemoryRuntimeContext): Promise<void> {
    await this.manager.initializeAll(sessionId, context);
  }

  buildSystemPrompt(): string {
    return this.manager.buildSystemPrompt();
  }

  async prefetch(query: string, sessionId?: string): Promise<string> {
    return this.manager.prefetchAll(query, sessionId);
  }

  async buildPromptParts(userMessage: string, sessionId?: string): Promise<MemoryPromptParts> {
    const recalled = await this.prefetch(userMessage, sessionId);
    return {
      guidanceBlock: buildMemoryGuidancePrompt(),
      systemMemoryBlock: this.buildSystemPrompt(),
      recallBlock: buildMemoryContextBlock(recalled),
    };
  }

  getToolSchemas(): ToolSchema[] {
    return this.manager.getAllToolSchemas();
  }

  hasTool(toolName: string): boolean {
    return this.manager.hasTool(toolName);
  }

  async handleToolCall(
    toolName: string,
    args: Record<string, unknown>,
    context?: ToolCallContext
  ): Promise<string> {
    return this.manager.handleToolCall(toolName, args, context);
  }

  async syncTurn(userContent: string, assistantContent: string, sessionId?: string): Promise<void> {
    await this.manager.syncAll(userContent, assistantContent, sessionId);
  }

  async queuePrefetch(query: string, sessionId?: string): Promise<void> {
    await this.manager.queuePrefetchAll(query, sessionId);
  }

  async onTurnStart(turnNumber: number, message: string, context?: TurnContext): Promise<void> {
    await this.manager.onTurnStart(turnNumber, message, context);
  }

  async onSessionEnd(messages: ChatMessage[]): Promise<void> {
    await this.manager.onSessionEnd(messages);
  }

  async onPreCompress(messages: ChatMessage[]): Promise<string> {
    return this.manager.onPreCompress(messages);
  }

  async shutdown(): Promise<void> {
    await this.manager.shutdownAll();
  }
}
