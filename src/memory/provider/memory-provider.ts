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

  // Stable, cache-friendly provider context suitable for session-frozen prompt injection.
  systemPromptBlock(): string {
    return "";
  }

  // Turn-scoped recall hook. Return dynamic memory relevant to the current query.
  async prefetch(_query: string, _sessionId?: string): Promise<string> {
    return "";
  }

  // Optional async warm-up path for providers that precompute recall state.
  async queuePrefetch(_query: string, _sessionId?: string): Promise<void> {}

  // Post-turn synchronization hook for provider-specific transcript or state updates.
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

  // Pre-turn hook for provider bookkeeping before model execution begins.
  async onTurnStart(
    _turnNumber: number,
    _message: string,
    _context?: TurnContext
  ): Promise<void> {}

  async onSessionEnd(_messages: ChatMessage[]): Promise<void> {}

  // Compression-stage hook. Return extra context that should accompany transcript compaction.
  async onPreCompress(_messages: ChatMessage[]): Promise<string> {
    return "";
  }

  // Broadcast hook for built-in memory writes. External providers may mirror or react to changes here.
  async onMemoryWrite(
    _action: string,
    _target: string,
    _content: string
  ): Promise<void> {}

  // Delegation hook for providers that learn from completed sub-tasks or agent handoffs.
  async onDelegation(
    _task: string,
    _result: string,
    _context?: Record<string, unknown>
  ): Promise<void> {}
}
