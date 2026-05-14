import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { SessionRepository } from "./session-repository";
import {
  SessionArchiveMetadata,
  SessionSearchOptions,
  SessionSearchResult,
  SessionTranscript,
  SessionTranscriptEntry,
} from "./types";
import { SESSION_SEARCH_SCHEMA } from "./sqlite/schema";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run: (...params: unknown[]) => unknown;
      get: (...params: unknown[]) => unknown;
      all: (...params: unknown[]) => unknown;
    };
  };
};

interface SQLiteSessionRepositoryOptions {
  baseDir: string;
}

interface SearchHitRow {
  messageId: number;
  sessionId: string;
  idx: number;
  updatedAt: string;
  source: string | null;
  userId: string | null;
  title: string | null;
  rank: number;
}

interface ExcerptWindow {
  start: number;
  end: number;
}

export class SQLiteSessionRepository implements SessionRepository {
  private readonly db: InstanceType<typeof DatabaseSync>;
  private static readonly MAX_EXCERPT_CHARACTERS = 600;

  constructor(options: SQLiteSessionRepositoryOptions) {
    const sessionsDir = path.join(options.baseDir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    const dbPath = path.join(sessionsDir, "state.db");

    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SESSION_SEARCH_SCHEMA);
  }

  async appendEntries(
    sessionId: string,
    entries: SessionTranscriptEntry[],
    metadata?: SessionArchiveMetadata
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const updatedAt = entries[entries.length - 1]?.timestamp ?? new Date().toISOString();
    const existing = this.db
      .prepare("SELECT COALESCE(MAX(idx), -1) AS maxIdx FROM messages WHERE session_id = ?")
      .get(sessionId) as { maxIdx: number | null };
    const startIdx = (existing.maxIdx ?? -1) + 1;

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO sessions(session_id, updated_at, source, user_id, title)
           VALUES(?, ?, ?, ?, ?)
           ON CONFLICT(session_id) DO UPDATE SET
             updated_at = excluded.updated_at,
             source = COALESCE(excluded.source, sessions.source),
             user_id = COALESCE(excluded.user_id, sessions.user_id),
             title = COALESCE(excluded.title, sessions.title)`
        )
        .run(
          sessionId,
          updatedAt,
          metadata?.source ?? null,
          metadata?.userId ?? null,
          metadata?.title ?? null
        );

      const insertMessage = this.db.prepare(
        `INSERT INTO messages(session_id, idx, timestamp, role, content)
         VALUES(?, ?, ?, ?, ?)`
      );

      entries.forEach((entry, offset) => {
        insertMessage.run(
          sessionId,
          startIdx + offset,
          entry.timestamp,
          entry.role,
          entry.content
        );
      });

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async loadSession(sessionId: string): Promise<SessionTranscript> {
    const sessionRow = this.db
      .prepare(
        `SELECT
           session_id as sessionId,
           updated_at as updatedAt,
           source,
           user_id as userId,
           title
         FROM sessions
         WHERE session_id = ?`
      )
      .get(sessionId) as { sessionId: string; updatedAt: string } | undefined;

    if (!sessionRow) {
      return { sessionId, updatedAt: "", entries: [] };
    }

    const messageRows = this.db
      .prepare(
        `SELECT timestamp, role, content
         FROM messages
         WHERE session_id = ?
         ORDER BY idx ASC`
      )
      .all(sessionId) as Array<{ timestamp: string; role: string; content: string }>;

    return {
      sessionId: sessionRow.sessionId,
      updatedAt: sessionRow.updatedAt,
      source: (sessionRow as { source?: string | null }).source ?? undefined,
      userId: (sessionRow as { userId?: string | null }).userId ?? undefined,
      title: (sessionRow as { title?: string | null }).title ?? undefined,
      entries: messageRows.map((row) => ({
        timestamp: row.timestamp,
        role: row.role as SessionTranscriptEntry["role"],
        content: row.content,
      })),
    };
  }

  async search(query: string, options: SessionSearchOptions = {}): Promise<SessionSearchResult[]> {
    const normalizedQuery = this.normalizeQuery(query);
    if (!normalizedQuery) {
      return [];
    }

    const limit = options.limit ?? 3;
    const contextMessages = options.contextMessages ?? 1;
    const rows = this.db
      .prepare(
        `SELECT
           messages.id AS messageId,
           messages.session_id AS sessionId,
           messages.idx AS idx,
           sessions.updated_at AS updatedAt,
           sessions.source AS source,
           sessions.user_id AS userId,
           sessions.title AS title,
           bm25(messages_fts) AS rank
         FROM messages_fts
         JOIN messages ON messages.id = messages_fts.rowid
         JOIN sessions ON sessions.session_id = messages.session_id
         WHERE messages_fts MATCH ?
         ORDER BY rank ASC
         LIMIT 100`
      )
      .all(normalizedQuery) as unknown as SearchHitRow[];

    if (rows.length === 0) {
      return [];
    }

    const bestBySession = new Map<string, SearchHitRow>();
    for (const row of rows) {
      const existing = bestBySession.get(row.sessionId);
      if (!existing || row.rank < existing.rank) {
        bestBySession.set(row.sessionId, row);
      }
    }

    const grouped = [...bestBySession.values()].sort((left, right) => {
      const leftScore = this.rankingScore(left, options);
      const rightScore = this.rankingScore(right, options);
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });

    return grouped.slice(0, limit).map((row) => ({
      sessionId: row.sessionId,
      score: this.rankingScore(row, options),
      updatedAt: row.updatedAt,
      source: row.source ?? undefined,
      userId: row.userId ?? undefined,
      title: row.title ?? undefined,
      summary: this.buildContextExcerpt(row.sessionId, rows, contextMessages),
    }));
  }

  private normalizeQuery(query: string): string {
    const trimmed = query.trim();
    if (!trimmed) {
      return "";
    }

    const isQuoted = trimmed.startsWith("\"") && trimmed.endsWith("\"") && trimmed.length > 1;
    if (isQuoted) {
      return trimmed;
    }

    const tokens = trimmed
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter(Boolean);

    return tokens.join(" ");
  }

  private scoreFromRank(rank: number): number {
    const normalized = Math.max(0.000001, Math.abs(rank));
    return Math.round(1000000 / normalized);
  }

  private rankingScore(row: SearchHitRow, options: SessionSearchOptions): number {
    let score = this.scoreFromRank(row.rank);
    score += this.recencyBoost(row.updatedAt);

    if (options.preferredSource && row.source === options.preferredSource) {
      score += 1500;
    }
    if (options.preferredUserId && row.userId === options.preferredUserId) {
      score += 2000;
    }

    return score;
  }

  private recencyBoost(updatedAt: string): number {
    const updated = Date.parse(updatedAt);
    if (Number.isNaN(updated)) {
      return 0;
    }

    const ageMs = Math.max(0, Date.now() - updated);
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays < 1) {
      return 1000;
    }
    if (ageDays < 7) {
      return 600;
    }
    if (ageDays < 30) {
      return 250;
    }

    return 0;
  }

  private buildContextExcerpt(
    sessionId: string,
    rows: SearchHitRow[],
    contextMessages: number
  ): string {
    const hits = rows
      .filter((row) => row.sessionId === sessionId)
      .sort((left, right) => left.idx - right.idx);

    const windows = this.mergeWindows(
      hits.map((row) => ({
        start: Math.max(0, row.idx - contextMessages),
        end: row.idx + contextMessages,
      }))
    );

    const excerptRows = this.db
      .prepare(
        `SELECT idx, role, content
         FROM messages
         WHERE session_id = ?
         ORDER BY idx ASC`
      )
      .all(sessionId) as unknown as Array<{ idx: number; role: string; content: string }>;

    const selected = excerptRows.filter((row) =>
      windows.some((window) => row.idx >= window.start && row.idx <= window.end)
    );

    const lines = selected.map((row) => `${row.role}: ${row.content}`);
    return this.limitExcerpt(lines);
  }

  private mergeWindows(windows: ExcerptWindow[]): ExcerptWindow[] {
    if (windows.length === 0) {
      return [];
    }

    const sorted = [...windows].sort((left, right) => left.start - right.start);
    const merged: ExcerptWindow[] = [sorted[0]];

    for (const window of sorted.slice(1)) {
      const last = merged[merged.length - 1];
      if (window.start <= last.end + 1) {
        last.end = Math.max(last.end, window.end);
        continue;
      }
      merged.push({ ...window });
    }

    return merged;
  }

  private limitExcerpt(lines: string[]): string {
    const kept: string[] = [];
    let length = 0;

    for (const line of lines) {
      if (this.isLowValueFiller(line) && kept.length > 0) {
        continue;
      }

      const nextLength = length + line.length + (kept.length === 0 ? 0 : 1);
      if (nextLength > SQLiteSessionRepository.MAX_EXCERPT_CHARACTERS) {
        if (kept.length === 0) {
          return `${line.slice(0, SQLiteSessionRepository.MAX_EXCERPT_CHARACTERS - 3).trimEnd()}...`;
        }
        break;
      }
      kept.push(line);
      length = nextLength;
    }

    return kept.join("\n");
  }

  private isLowValueFiller(line: string): boolean {
    const normalized = line.trim().toLowerCase();
    if (!normalized.startsWith("assistant:")) {
      return false;
    }

    const content = normalized.slice("assistant:".length).trim();
    if (content.length < 180) {
      return false;
    }

    const repeatedPhrase = /^(.{5,40})\1{2,}$/u.test(content.replace(/\s+/g, ""));
    const fillerHint =
      /filler|placeholder|lorem ipsum|dummy text|repeated|very long/i.test(content);

    return repeatedPhrase || fillerHint;
  }
}
