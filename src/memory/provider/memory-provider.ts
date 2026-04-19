import { MemoryProviderError } from "../kernel/errors";
import {
  ChatMessage,
  MemoryRuntimeContext,
  ToolCallContext,
  ToolSchema,
  TurnContext,
} from "../kernel/types";

export abstract class MemoryProvider {
  abstract readonly name: string;

  abstract isAvailable(): boolean | Promise<boolean>;

  abstract initialize(
    sessionId: string,
    context?: MemoryRuntimeContext
  ): Promise<void>;

  systemPromptBlock(): string {
    return "";
  }

  async prefetch(_query: string, _sessionId?: string): Promise<string> {
    return "";
  }

  async queuePrefetch(_query: string, _sessionId?: string): Promise<void> {}

  async syncTurn(
    _userContent: string,
    _assistantContent: string,
    _sessionId?: string
  ): Promise<void> {}

  abstract getToolSchemas(): ToolSchema[];

  async handleToolCall(
    _toolName: string,
    _args: Record<string, unknown>,
    _context?: ToolCallContext
  ): Promise<string> {
    throw new MemoryProviderError("Tool handling is not implemented for this provider");
  }

  async shutdown(): Promise<void> {}

  async onTurnStart(
    _turnNumber: number,
    _message: string,
    _context?: TurnContext
  ): Promise<void> {}

  async onSessionEnd(_messages: ChatMessage[]): Promise<void> {}

  async onPreCompress(_messages: ChatMessage[]): Promise<string> {
    return "";
  }

  async onMemoryWrite(
    _action: string,
    _target: string,
    _content: string
  ): Promise<void> {}

  async onDelegation(
    _task: string,
    _result: string,
    _context?: Record<string, unknown>
  ): Promise<void> {}
}
