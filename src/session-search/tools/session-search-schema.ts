import { ToolSchema } from "../../memory/index";

export const SESSION_SEARCH_TOOL_SCHEMA: ToolSchema = {
  name: "session_search",
  description:
    "Search prior conversation sessions for relevant context before asking the user to repeat themselves.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "What to search for in past sessions.",
      },
      limit: {
        type: "number",
        description: "Optional maximum number of session summaries to return.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};
