import {
  BuiltinMemoryProvider,
  FileMemoryRepository,
  MemoryKernel,
  MemoryRuntimeContext,
  MemoryStore,
  ToolSchema,
} from "../memory/index";
import {
  FileSessionRepository,
  SessionSearchService,
  SESSION_SEARCH_TOOL_SCHEMA,
  executeSessionSearchTool,
} from "../session-search/index";

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

export interface ToolCallRequest {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ModelTurnResult {
  assistantMessage?: string;
  toolCall?: ToolCallRequest;
}

export interface HostModelAdapter {
  generate(input: {
    messages: AgentMessage[];
    tools: ToolSchema[];
  }): Promise<ModelTurnResult>;
}

export interface HostAgentOptions {
  baseDir: string;
  model: HostModelAdapter;
  sessionId: string;
  appSystemPrompt: string;
  runtimeContext?: MemoryRuntimeContext;
}

export interface AgentTurnOutput {
  messages: AgentMessage[];
  assistantMessage: string;
}

export class ExampleHostAgent {
  private readonly kernel: MemoryKernel;
  private readonly model: HostModelAdapter;
  private readonly appSystemPrompt: string;
  private readonly sessionId: string;
  private readonly runtimeContext?: MemoryRuntimeContext;
  private readonly sessionSearch: SessionSearchService;
  private initialized = false;

  constructor(options: HostAgentOptions) {
    this.model = options.model;
    this.appSystemPrompt = options.appSystemPrompt;
    this.sessionId = options.sessionId;
    this.runtimeContext = options.runtimeContext;

    const repository = new FileMemoryRepository({ baseDir: options.baseDir });
    const store = new MemoryStore({ repository });
    const provider = new BuiltinMemoryProvider({ store });
    this.kernel = new MemoryKernel({ providers: [provider] });
    this.sessionSearch = new SessionSearchService({
      repository: new FileSessionRepository({ baseDir: options.baseDir }),
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.kernel.initialize(this.sessionId, this.runtimeContext);
    this.initialized = true;
  }

  async runTurn(userMessage: string): Promise<AgentTurnOutput> {
    await this.initialize();
    await this.kernel.onTurnStart(1, userMessage, {
      platform: this.runtimeContext?.platform as string | undefined,
    });

    const parts = await this.kernel.buildPromptParts(userMessage, this.sessionId);
    const tools = [...this.kernel.getToolSchemas(), SESSION_SEARCH_TOOL_SCHEMA];
    const systemMessages: AgentMessage[] = [
      { role: "system", content: this.appSystemPrompt },
      ...(parts.guidanceBlock ? ([{ role: "system", content: parts.guidanceBlock }] as AgentMessage[]) : []),
      ...(parts.systemMemoryBlock
        ? ([{ role: "system", content: parts.systemMemoryBlock }] as AgentMessage[])
        : []),
      ...(parts.recallBlock ? ([{ role: "system", content: parts.recallBlock }] as AgentMessage[]) : []),
    ];
    const messages: AgentMessage[] = [
      ...systemMessages,
      { role: "user", content: userMessage },
    ];

    const firstPass = await this.model.generate({ messages, tools });

    if (!firstPass.toolCall) {
      const assistantMessage = firstPass.assistantMessage ?? "";
      await this.kernel.syncTurn(userMessage, assistantMessage, this.sessionId);
      const resultMessages = [...messages, { role: "assistant", content: assistantMessage } as AgentMessage];
      await this.sessionSearch.archiveTurn(this.sessionId, [
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantMessage },
      ]);
      return {
        messages: resultMessages,
        assistantMessage,
      };
    }

    const toolResult =
      firstPass.toolCall.toolName === "session_search"
        ? await executeSessionSearchTool(firstPass.toolCall.args, this.sessionSearch)
        : await this.kernel.handleToolCall(
            firstPass.toolCall.toolName,
            firstPass.toolCall.args,
            { sessionId: this.sessionId }
          );

    const toolMessages: AgentMessage[] = [
      ...messages,
      {
        role: "assistant",
        content: `Calling tool ${firstPass.toolCall.toolName}`,
      },
      {
        role: "tool",
        name: firstPass.toolCall.toolName,
        content: toolResult,
      },
    ];

    const secondPass = await this.model.generate({
      messages: toolMessages,
      tools,
    });

    const assistantMessage = secondPass.assistantMessage ?? "";
    await this.kernel.syncTurn(userMessage, assistantMessage, this.sessionId);
    await this.sessionSearch.archiveTurn(this.sessionId, [
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage },
    ]);

    return {
      messages: [...toolMessages, { role: "assistant", content: assistantMessage }],
      assistantMessage,
    };
  }

  async shutdown(messages: AgentMessage[] = []): Promise<void> {
    await this.kernel.onSessionEnd(
      messages.map((message) => ({
        role: message.role,
        content: message.content,
        name: message.name,
      }))
    );
    await this.kernel.shutdown();
  }
}
