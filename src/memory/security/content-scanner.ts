import { INVISIBLE_UNICODE_CHARS, MEMORY_THREAT_PATTERNS } from "./threat-patterns";

export interface ScanResult {
  ok: boolean;
  reason?: string;
  patternId?: string;
}

export function scanMemoryContent(content: string): ScanResult {
  for (const ch of INVISIBLE_UNICODE_CHARS) {
    if (content.includes(ch)) {
      return {
        ok: false,
        reason: "Memory write blocked: content contains invisible Unicode characters",
        patternId: "invisible-unicode",
      };
    }
  }

  for (const threat of MEMORY_THREAT_PATTERNS) {
    if (threat.pattern.test(content)) {
      return {
        ok: false,
        reason: `Memory write blocked: suspicious pattern detected (${threat.id})`,
        patternId: threat.id,
      };
    }
  }

  return { ok: true };
}
