export type SessionMessageRole = "system" | "user" | "assistant" | "tool";

export interface SessionArchiveMessage {
  role: SessionMessageRole;
  content: string;
  name?: string;
}

export interface SessionTranscriptEntry {
  timestamp: string;
  role: SessionMessageRole;
  content: string;
}

export interface SessionTranscript {
  sessionId: string;
  updatedAt: string;
  entries: SessionTranscriptEntry[];
}

export interface SessionSearchResult {
  sessionId: string;
  score: number;
  updatedAt: string;
  summary: string;
}

export interface SessionSearchOptions {
  limit?: number;
  contextMessages?: number;
}

export interface SessionSearchToolArgs {
  query: string;
  limit?: number;
}
