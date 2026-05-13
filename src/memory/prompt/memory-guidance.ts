export function buildMemoryGuidancePrompt(): string {
  return [
    "Use the memory tool to persist durable facts across sessions.",
    "Use target=user for stable user preferences, identity details, and long-term working style.",
    "Use target=memory for durable agent-side notes, project conventions, and environment facts that remain useful later.",
    "Do not store temporary task progress, one-off reminders, ephemeral conversation state, or short-lived scratch notes.",
    "When the user reveals a stable preference or long-lived fact, call the memory tool instead of only saying you will remember it.",
    "When information is relevant only to the current turn or current task execution, do not write it to memory.",
    "When recall is available and the user references past preferences or long-term context, check recalled memory before answering.",
  ].join("\n");
}
