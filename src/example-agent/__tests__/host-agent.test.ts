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

class SessionSearchModel implements HostModelAdapter {
  private called = false;

  async generate(): Promise<{
    assistantMessage?: string;
    toolCall?: { toolName: string; args: Record<string, unknown> };
  }> {
    if (!this.called) {
      this.called = true;
      return {
        toolCall: {
          toolName: "session_search",
          args: {
            query: "TypeScript",
          },
        },
      };
    }

    return {
      assistantMessage: "I found the previous TypeScript discussion.",
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

  it("can execute session_search through the host agent tool loop", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "host-agent-"));
    try {
      const writer = new ExampleHostAgent({
        baseDir,
        model: {
          async generate() {
            return { assistantMessage: "TypeScript came up earlier." };
          },
        },
        sessionId: "session-archive",
        sessionTitle: "TypeScript Session",
        appSystemPrompt: "You are a helpful agent.",
      });

      await writer.runTurn("Let's discuss TypeScript preferences.");

      const agent = new ExampleHostAgent({
        baseDir,
        model: new SessionSearchModel(),
        sessionId: "session-search",
        appSystemPrompt: "You are a helpful agent.",
      });

      const result = await agent.runTurn("Search prior sessions for TypeScript.");
      expect(result.assistantMessage).toContain("previous TypeScript discussion");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it("archives direct-answer turns so they become searchable later", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "host-agent-"));
    try {
      const writer = new ExampleHostAgent({
        baseDir,
        model: {
          async generate() {
            return { assistantMessage: "Kubernetes came up in our earlier discussion." };
          },
        },
        sessionId: "session-direct",
        appSystemPrompt: "You are a helpful agent.",
      });

      await writer.runTurn("Let's talk about our Kubernetes cluster.");

      const agent = new ExampleHostAgent({
        baseDir,
        model: {
          called: false,
          async generate(this: { called: boolean }) {
            if (!this.called) {
              this.called = true;
              return {
                toolCall: {
                  toolName: "session_search",
                  args: { query: "Kubernetes" },
                },
              };
            }
            return { assistantMessage: "I found the Kubernetes discussion." };
          },
        } as HostModelAdapter,
        sessionId: "session-followup",
        appSystemPrompt: "You are a helpful agent.",
      });

      const result = await agent.runTurn("Search prior sessions for Kubernetes.");
      expect(result.assistantMessage).toContain("Kubernetes discussion");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
