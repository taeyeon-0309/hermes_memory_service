export interface ThreatPattern {
  id: string;
  pattern: RegExp;
}

export const INVISIBLE_UNICODE_CHARS: string[] = [
  "\u200B",
  "\u200C",
  "\u200D",
  "\u200E",
  "\u200F",
  "\u2060",
  "\uFEFF",
];

export const MEMORY_THREAT_PATTERNS: ThreatPattern[] = [
  {
    id: "prompt-injection-ignore-instructions",
    pattern: /ignore\s+(all\s+)?(previous|prior)\s+instructions?/i,
  },
  {
    id: "prompt-injection-disregard-rules",
    pattern: /disregard\s+(all\s+)?(rules|instructions?)/i,
  },
  {
    id: "role-hijack",
    pattern: /(you\s+are\s+now|act\s+as|switch\s+role\s+to)\s+(system|developer|admin)/i,
  },
  {
    id: "secret-exfiltration-command",
    pattern:
      /(curl|wget)\b[\s\S]{0,120}\b(key|token|secret|password|api[_-]?key|credential|\.env)\b/i,
  },
  {
    id: "credentials-or-env-access",
    pattern:
      /(cat|less|more|grep|awk|sed)\b[\s\S]{0,120}\b(\.env|credentials?|secrets?|tokens?|passwords?)\b/i,
  },
  {
    id: "persistence-backdoor-ssh",
    pattern: /(authorized_keys|\.ssh\b|\.hermes\/.env\b)/i,
  },
];
