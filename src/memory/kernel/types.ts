export type MemoryTarget = "memory" | "user";

export interface MemoryEntry {
  id: string;
  target: MemoryTarget;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemorySnapshot {
  memory: string;
  user: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

export interface MemoryRuntimeContext {
  platform?: string;
  agentIdentity?: string;
  agentWorkspace?: string;
  parentSessionId?: string;
  userId?: string;
  agentContext?: "primary" | "subagent" | "cron" | "flush";
  [key: string]: unknown;
}

export interface ToolCallContext {
  sessionId?: string;
  turnNumber?: number;
  [key: string]: unknown;
}

export interface TurnContext {
  remainingTokens?: number;
  model?: string;
  platform?: string;
  toolCount?: number;
  [key: string]: unknown;
}

export interface MemoryToolArgs {
  action: "add" | "replace" | "remove";
  target: MemoryTarget;
  content?: string;
  old_text?: string;
}

export interface MemoryPromptParts {
  guidanceBlock: string;
  systemMemoryBlock: string;
  recallBlock: string;
}
