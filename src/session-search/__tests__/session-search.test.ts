import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileSessionRepository } from "../file-session-repository";
import { SessionSearchService } from "../session-search-service";
import { executeSessionSearchTool } from "../tools/session-search-tool";

describe("session-search", () => {
  it("archives turns and returns session-level search results", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "session-search-"));
    try {
      const service = new SessionSearchService({
        repository: new FileSessionRepository({ baseDir }),
      });

      await service.archiveTurn("session-a", [
        { role: "user", content: "I prefer TypeScript over Python" },
        { role: "assistant", content: "I will remember that preference." },
      ]);
      await service.archiveTurn("session-b", [
        { role: "user", content: "My deployment stack uses Cloudflare Workers" },
        { role: "assistant", content: "Understood." },
      ]);

      const results = await service.search("TypeScript");
      expect(results).toHaveLength(1);
      expect(results[0]?.sessionId).toBe("session-a");
      expect(results[0]?.summary).toContain("TypeScript");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("returns JSON search results through the session_search tool executor", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "session-search-"));
    try {
      const service = new SessionSearchService({
        repository: new FileSessionRepository({ baseDir }),
      });

      await service.archiveTurn("session-a", [
        { role: "user", content: "I prefer concise answers" },
        { role: "assistant", content: "Got it." },
      ]);

      const raw = await executeSessionSearchTool({ query: "concise" }, service);
      const parsed = JSON.parse(raw) as {
        success: boolean;
        result_count: number;
        results: Array<{ sessionId: string }>;
      };

      expect(parsed.success).toBe(true);
      expect(parsed.result_count).toBe(1);
      expect(parsed.results[0]?.sessionId).toBe("session-a");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("loads a session transcript through the repository abstraction", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "session-search-"));
    try {
      const repository = new FileSessionRepository({ baseDir });
      const service = new SessionSearchService({ repository });

      await service.archiveTurn("session-c", [
        { role: "user", content: "Please remember our Kubernetes cluster." },
      ]);

      const transcript = await repository.loadSession("session-c");
      expect(transcript.sessionId).toBe("session-c");
      expect(transcript.entries[0]?.content).toContain("Kubernetes");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
