export type SessionMessageRole = "system" | "user" | "assistant" | "tool";

export interface SessionArchiveMessage {
  role: SessionMessageRole;
  content: string;
  name?: string;
}

export interface SessionArchiveMetadata {
  source?: string;
  userId?: string;
  title?: string;
}

export interface SessionTranscriptEntry {
  timestamp: string;
  role: SessionMessageRole;
  content: string;
}

export interface SessionTranscript {
  sessionId: string;
  updatedAt: string;
  source?: string;
  userId?: string;
  title?: string;
  entries: SessionTranscriptEntry[];
}

export interface SessionSearchResult {
  sessionId: string;
  score: number;
  updatedAt: string;
  source?: string;
  userId?: string;
  title?: string;
  summary: string;
}

export interface SessionSearchOptions {
  limit?: number;
  contextMessages?: number;
  preferredSource?: string;
  preferredUserId?: string;
}

export interface SessionSearchToolArgs {
  query: string;
  limit?: number;
}
