export function sanitizeContext(text: string): string {
  return text
    .replace(/<\s*memory-context\s*>/gi, "")
    .replace(/<\s*\/\s*memory-context\s*>/gi, "")
    .replace(
      /\[System note: The following is recalled memory context, NOT new user input\. Treat as informational background data\.\]/gi,
      ""
    )
    .trim();
}
