import { promises as fs } from "node:fs";
import path from "node:path";
import {
  SessionArchiveMetadata,
  SessionSearchOptions,
  SessionSearchResult,
  SessionTranscript,
  SessionTranscriptEntry,
} from "./types";
import { SessionRepository } from "./session-repository";

interface FileSessionRepositoryOptions {
  baseDir: string;
}

export class FileSessionRepository implements SessionRepository {
  private readonly sessionsDir: string;

  constructor(options: FileSessionRepositoryOptions) {
    this.sessionsDir = path.join(options.baseDir, "sessions");
  }

  async appendEntries(
    sessionId: string,
    entries: SessionTranscriptEntry[],
    metadata?: SessionArchiveMetadata
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    await fs.mkdir(this.sessionsDir, { recursive: true });
    const transcript = await this.loadSession(sessionId);
    const nextEntries = [...transcript.entries, ...entries];
    const next: SessionTranscript = {
      sessionId,
      updatedAt: entries[entries.length - 1]?.timestamp ?? new Date().toISOString(),
      source: metadata?.source ?? transcript.source,
      userId: metadata?.userId ?? transcript.userId,
      title: metadata?.title ?? transcript.title,
      entries: nextEntries,
    };

    const filePath = this.resolvePath(sessionId);
    const tmpPath = `${filePath}.tmp-${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(tmpPath, filePath);
  }

  async search(query: string, options: SessionSearchOptions = {}): Promise<SessionSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const limit = options.limit ?? 3;
    const contextMessages = options.contextMessages ?? 1;
    await fs.mkdir(this.sessionsDir, { recursive: true });

    const files = await fs.readdir(this.sessionsDir);
    const transcripts = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => this.loadSession(path.basename(file, ".json")))
    );

    const results: SessionSearchResult[] = [];
    for (const transcript of transcripts) {
      const match = this.matchTranscript(transcript, trimmed, contextMessages);
      if (!match) {
        continue;
      }
      results.push(match);
    }

    results.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });

    return results.slice(0, limit);
  }

  async loadSession(sessionId: string): Promise<SessionTranscript> {
    const filePath = this.resolvePath(sessionId);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as SessionTranscript;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { sessionId, updatedAt: "", entries: [] };
      }
      throw error;
    }
  }

  private resolvePath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  private matchTranscript(
    transcript: SessionTranscript,
    query: string,
    contextMessages: number
  ): SessionSearchResult | null {
    const normalizedQuery = query.toLowerCase();
    const tokens = normalizedQuery
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter(Boolean);

    let bestScore = 0;
    let bestIndex = -1;

    transcript.entries.forEach((entry, index) => {
      const score = this.scoreEntry(entry.content, normalizedQuery, tokens);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestScore <= 0 || bestIndex < 0) {
      return null;
    }

    const start = Math.max(0, bestIndex - contextMessages);
    const end = Math.min(transcript.entries.length, bestIndex + contextMessages + 1);
    const summary = transcript.entries
      .slice(start, end)
      .map((entry) => `${entry.role}: ${entry.content}`)
      .join("\n");

    return {
      sessionId: transcript.sessionId,
      score: bestScore,
      updatedAt: transcript.updatedAt,
      source: transcript.source,
      userId: transcript.userId,
      title: transcript.title,
      summary,
    };
  }

  private scoreEntry(content: string, query: string, tokens: string[]): number {
    const normalized = content.toLowerCase();
    let score = 0;

    if (normalized.includes(query)) {
      score += 200;
    }

    for (const token of tokens) {
      if (normalized.includes(token)) {
        score += token.length <= 2 ? 5 : 15;
      }
    }

    return score;
  }
}
