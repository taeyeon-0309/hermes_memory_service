import {
  SessionSearchOptions,
  SessionSearchResult,
  SessionTranscript,
  SessionTranscriptEntry,
} from "./types";

export interface SessionRepository {
  appendEntries(sessionId: string, entries: SessionTranscriptEntry[]): Promise<void>;
  loadSession(sessionId: string): Promise<SessionTranscript>;
  search(query: string, options?: SessionSearchOptions): Promise<SessionSearchResult[]>;
}
