import { ToolSchema } from "../kernel/types";

export const MEMORY_TOOL_SCHEMA: ToolSchema = {
  name: "memory",
  description:
    "Persist long-lived memory. Use target=user for stable user profile facts, target=memory for durable agent notes. Do not store temporary task progress or ephemeral state.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["add", "replace", "remove"],
      },
      target: {
        type: "string",
        enum: ["memory", "user"],
      },
      content: {
        type: "string",
        description: "Required for add/replace",
      },
      old_text: {
        type: "string",
        description: "Required for replace/remove",
      },
    },
    required: ["action", "target"],
    additionalProperties: false,
  },
};
