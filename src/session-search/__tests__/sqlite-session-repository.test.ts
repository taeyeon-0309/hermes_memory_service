import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SQLiteSessionRepository } from "../sqlite-session-repository";

describe("sqlite-session-repository", () => {
  it("archives transcript entries into sqlite and reloads them", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "session-sqlite-"));
    try {
      const repository = new SQLiteSessionRepository({ baseDir });
      await repository.appendEntries(
        "session-a",
        [
          {
            timestamp: new Date().toISOString(),
            role: "user",
            content: "I prefer TypeScript over Python",
          },
        ],
        {
          source: "cli",
          userId: "user-1",
          title: "TypeScript Preferences",
        }
      );

      const transcript = await repository.loadSession("session-a");
      expect(transcript.sessionId).toBe("session-a");
      expect(transcript.source).toBe("cli");
      expect(transcript.userId).toBe("user-1");
      expect(transcript.title).toBe("TypeScript Preferences");
      expect(transcript.entries[0]?.content).toContain("TypeScript");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("uses sqlite FTS to return session-level search results", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "session-sqlite-"));
    try {
      const repository = new SQLiteSessionRepository({ baseDir });
      const now = new Date().toISOString();
      await repository.appendEntries(
        "session-a",
        [
          { timestamp: now, role: "user", content: "I prefer TypeScript over Python" },
          { timestamp: now, role: "assistant", content: "Acknowledged." },
        ],
        { source: "cli", userId: "user-a", title: "TypeScript Deployment" }
      );
      await repository.appendEntries("session-b", [
        { timestamp: now, role: "user", content: "Our deployment stack uses Cloudflare Workers" },
      ]);

      const results = await repository.search("TypeScript", { limit: 3, contextMessages: 1 });
      expect(results).toHaveLength(1);
      expect(results[0]?.sessionId).toBe("session-a");
      expect(results[0]?.source).toBe("cli");
      expect(results[0]?.userId).toBe("user-a");
      expect(results[0]?.title).toBe("TypeScript Deployment");
      expect(results[0]?.summary).toContain("TypeScript");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("applies recency and metadata boosts when ranking sessions", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "session-sqlite-"));
    try {
      const repository = new SQLiteSessionRepository({ baseDir });
      const older = new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString();
      const recent = new Date().toISOString();

      await repository.appendEntries(
        "session-old",
        [{ timestamp: older, role: "user", content: "TypeScript deployment notes" }],
        { source: "cli", userId: "user-a" }
      );
      await repository.appendEntries(
        "session-recent",
        [{ timestamp: recent, role: "user", content: "TypeScript deployment notes" }],
        { source: "web", userId: "user-b" }
      );

      const recentFirst = await repository.search("TypeScript deployment", { limit: 2 });
      expect(recentFirst[0]?.sessionId).toBe("session-recent");

      const sourceBoosted = await repository.search("TypeScript deployment", {
        limit: 2,
        preferredSource: "cli",
        preferredUserId: "user-a",
      });
      expect(sourceBoosted[0]?.sessionId).toBe("session-old");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("merges multiple nearby hits into one stable excerpt and caps excerpt length", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "session-sqlite-"));
    try {
      const repository = new SQLiteSessionRepository({ baseDir });
      const now = new Date().toISOString();
      await repository.appendEntries(
        "session-merged",
        [
          { timestamp: now, role: "user", content: "TypeScript deployment planning starts here." },
          { timestamp: now, role: "assistant", content: "We should review the TypeScript deployment checklist." },
          { timestamp: now, role: "user", content: "The TypeScript deployment target is Cloudflare Workers." },
          { timestamp: now, role: "assistant", content: "A very long filler message ".repeat(40) },
        ],
        { source: "cli", userId: "user-a" }
      );

      const results = await repository.search("TypeScript deployment", {
        limit: 1,
        contextMessages: 1,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.summary).toContain("planning starts here");
      expect(results[0]?.summary).toContain("checklist");
      expect(results[0]?.summary).toContain("Cloudflare Workers");
      expect((results[0]?.summary.length ?? 0)).toBeLessThanOrEqual(600);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("skips low-value long filler assistant lines when building excerpts", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "session-sqlite-"));
    try {
      const repository = new SQLiteSessionRepository({ baseDir });
      const now = new Date().toISOString();
      await repository.appendEntries(
        "session-noise",
        [
          { timestamp: now, role: "user", content: "Please remember the Kubernetes rollout notes." },
          {
            timestamp: now,
            role: "assistant",
            content:
              "Very long filler message repeated filler message repeated filler message repeated filler message repeated filler message repeated filler message repeated filler message repeated filler message repeated filler message repeated filler message repeated",
          },
          { timestamp: now, role: "assistant", content: "The rollout depends on the Kubernetes cluster window." },
        ],
        { source: "cli", userId: "user-a" }
      );

      const results = await repository.search("Kubernetes rollout", {
        limit: 1,
        contextMessages: 2,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.summary).toContain("Kubernetes rollout notes");
      expect(results[0]?.summary).toContain("Kubernetes cluster window");
      expect(results[0]?.summary).not.toContain("Very long filler message");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
