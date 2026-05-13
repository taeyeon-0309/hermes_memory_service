import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ExampleHostAgent, HostModelAdapter } from "../host-agent";

class ToolWritingModel implements HostModelAdapter {
  private called = false;

  async generate(): Promise<{
    assistantMessage?: string;
    toolCall?: { toolName: string; args: Record<string, unknown> };
  }> {
    if (!this.called) {
      this.called = true;
      return {
        toolCall: {
          toolName: "memory",
          args: {
            action: "add",
            target: "user",
            content: "The user prefers concise answers",
          },
        },
      };
    }

    return {
      assistantMessage: "I will keep that preference in mind.",
    };
  }
}

class InspectingModel implements HostModelAdapter {
  seenSystemMessages: string[] = [];

  async generate(input: {
    messages: Array<{ role: string; content: string }>;
  }): Promise<{ assistantMessage: string }> {
    this.seenSystemMessages = input.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content);

    return {
      assistantMessage: "Answer generated.",
    };
  }
}

describe("example host agent", () => {
  it("runs a tool-writing turn through the memory kernel", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "host-agent-"));
    try {
      const agent = new ExampleHostAgent({
        baseDir,
        model: new ToolWritingModel(),
        sessionId: "session-1",
        appSystemPrompt: "You are a helpful agent.",
        runtimeContext: { platform: "cli", agentIdentity: "example-agent" },
      });

      const result = await agent.runTurn("Please remember that I prefer concise answers.");

      expect(result.assistantMessage).toContain("keep that preference");
      await agent.shutdown(result.messages);

      const inspector = new InspectingModel();
      const nextAgent = new ExampleHostAgent({
        baseDir,
        model: inspector,
        sessionId: "session-2",
        appSystemPrompt: "You are a helpful agent.",
        runtimeContext: { platform: "cli", agentIdentity: "example-agent" },
      });

      await nextAgent.runTurn("What do you remember about me?");
      expect(inspector.seenSystemMessages.join("\n")).toContain("concise answers");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
