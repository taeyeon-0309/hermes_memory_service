import { SessionSearchService } from "../session-search-service";

function errorJson(message: string): string {
  return JSON.stringify({ success: false, error: message });
}

export async function executeSessionSearchTool(
  args: Record<string, unknown>,
  service: SessionSearchService
): Promise<string> {
  try {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) {
      return errorJson("query is required for session_search");
    }

    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit) ? args.limit : 3;

    const results = await service.search(query, {
      limit,
    });

    return JSON.stringify({
      success: true,
      query,
      results,
      result_count: results.length,
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Unknown session_search error");
  }
}
