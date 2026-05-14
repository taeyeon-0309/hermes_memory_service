import { SessionRepository } from "./session-repository";
import {
  SessionArchiveMessage,
  SessionSearchOptions,
  SessionSearchResult,
} from "./types";

interface SessionSearchServiceOptions {
  repository: SessionRepository;
}

export class SessionSearchService {
  private readonly repository: SessionRepository;

  constructor(options: SessionSearchServiceOptions) {
    this.repository = options.repository;
  }

  async archiveTurn(sessionId: string, messages: SessionArchiveMessage[]): Promise<void> {
    const now = new Date().toISOString();
    await this.repository.appendEntries(
      sessionId,
      messages.map((message) => ({
        timestamp: now,
        role: message.role,
        content: message.content,
      }))
    );
  }

  async search(query: string, options: SessionSearchOptions = {}): Promise<SessionSearchResult[]> {
    return this.repository.search(query, options);
  }
}
