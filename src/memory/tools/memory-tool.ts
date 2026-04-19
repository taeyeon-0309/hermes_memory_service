import { MemoryToolArgs } from "../kernel/types";
import { MemoryStore } from "../store/memory-store";

function errorJson(message: string): string {
  return JSON.stringify({ success: false, error: message });
}

export async function executeMemoryTool(
  args: MemoryToolArgs,
  store: MemoryStore
): Promise<string> {
  try {
    if (args.action === "add") {
      if (!args.content) {
        return errorJson("content is required for add");
      }
      return JSON.stringify(await store.add(args.target, args.content));
    }

    if (args.action === "replace") {
      if (!args.old_text || !args.content) {
        return errorJson("old_text and content are required for replace");
      }
      return JSON.stringify(await store.replace(args.target, args.old_text, args.content));
    }

    if (args.action === "remove") {
      if (!args.old_text) {
        return errorJson("old_text is required for remove");
      }
      return JSON.stringify(await store.remove(args.target, args.old_text));
    }

    return errorJson("Unsupported action");
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Unknown memory tool error");
  }
}
