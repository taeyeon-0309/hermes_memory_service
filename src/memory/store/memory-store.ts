import { MemoryTarget } from "../kernel/types";
import { scanMemoryContent } from "../security/content-scanner";
import {
  ENTRY_DELIMITER,
  MemoryOperationFailure,
  MemoryOperationResult,
  MemoryOperationSuccess,
} from "./models";
import { MemoryRepository } from "./memory-repository";

interface MemoryStoreOptions {
  repository: MemoryRepository;
  memoryCharLimit?: number;
  userCharLimit?: number;
}

export class MemoryStore {
  private readonly repository: MemoryRepository;
  private readonly memoryCharLimit: number;
  private readonly userCharLimit: number;

  private memoryEntries: string[] = [];
  private userEntries: string[] = [];
  private systemPromptSnapshot = { memory: "", user: "" };

  constructor(options: MemoryStoreOptions) {
    this.repository = options.repository;
    this.memoryCharLimit = options.memoryCharLimit ?? 2200;
    this.userCharLimit = options.userCharLimit ?? 1375;
  }

  async loadFromDisk(): Promise<void> {
    const [memory, user] = await Promise.all([
      this.repository.loadEntries("memory"),
      this.repository.loadEntries("user"),
    ]);

    this.memoryEntries = this.dedupe(memory.map((entry) => entry.content));
    this.userEntries = this.dedupe(user.map((entry) => entry.content));

    this.systemPromptSnapshot = {
      memory: this.renderBlock("memory", this.memoryEntries),
      user: this.renderBlock("user", this.userEntries),
    };
  }

  formatForSystemPrompt(target: MemoryTarget): string | null {
    const block = target === "memory" ? this.systemPromptSnapshot.memory : this.systemPromptSnapshot.user;
    return block.trim().length > 0 ? block : null;
  }

  async add(target: MemoryTarget, content: string): Promise<MemoryOperationResult> {
    const trimmed = content.trim();
    if (!trimmed) {
      return this.failure("Content cannot be empty");
    }

    const scan = scanMemoryContent(trimmed);
    if (!scan.ok) {
      return this.failure(scan.reason ?? "Memory content blocked", undefined, this.entriesFor(target));
    }

    return this.repository.withLock(target, async () => {
      await this.reloadTarget(target);
      const entries = this.entriesFor(target);

      if (entries.includes(trimmed)) {
        return this.success(target, entries, "Entry already exists");
      }

      const next = [...entries, trimmed];
      if (this.charCount(next) > this.charLimit(target)) {
        return this.failure("Character limit exceeded", undefined, entries, this.usageString(target, entries));
      }

      await this.persistTarget(target, next);
      return this.success(target, next, "Entry added");
    });
  }

  async replace(target: MemoryTarget, oldText: string, newContent: string): Promise<MemoryOperationResult> {
    const oldTrim = oldText.trim();
    const newTrim = newContent.trim();

    if (!oldTrim) {
      return this.failure("old_text cannot be empty");
    }
    if (!newTrim) {
      return this.failure("content cannot be empty");
    }

    const scan = scanMemoryContent(newTrim);
    if (!scan.ok) {
      return this.failure(scan.reason ?? "Memory content blocked", undefined, this.entriesFor(target));
    }

    return this.repository.withLock(target, async () => {
      await this.reloadTarget(target);
      const entries = this.entriesFor(target);
      const matches = entries.filter((entry) => entry.includes(oldTrim));

      if (matches.length === 0) {
        return this.failure("No matching entry found", undefined, entries, this.usageString(target, entries));
      }

      const uniqueMatches = [...new Set(matches)];
      if (uniqueMatches.length > 1) {
        return this.failure(
          "Ambiguous match: multiple different entries contain old_text",
          uniqueMatches.slice(0, 5),
          entries,
          this.usageString(target, entries)
        );
      }

      const index = entries.findIndex((entry) => entry.includes(oldTrim));
      const next = [...entries];
      next[index] = newTrim;

      if (this.charCount(next) > this.charLimit(target)) {
        return this.failure("Character limit exceeded", undefined, entries, this.usageString(target, entries));
      }

      await this.persistTarget(target, next);
      return this.success(target, next, "Entry replaced");
    });
  }

  async remove(target: MemoryTarget, oldText: string): Promise<MemoryOperationResult> {
    const oldTrim = oldText.trim();
    if (!oldTrim) {
      return this.failure("old_text cannot be empty");
    }

    return this.repository.withLock(target, async () => {
      await this.reloadTarget(target);
      const entries = this.entriesFor(target);
      const matches = entries.filter((entry) => entry.includes(oldTrim));

      if (matches.length === 0) {
        return this.failure("No matching entry found", undefined, entries, this.usageString(target, entries));
      }

      const uniqueMatches = [...new Set(matches)];
      if (uniqueMatches.length > 1) {
        return this.failure(
          "Ambiguous match: multiple different entries contain old_text",
          uniqueMatches.slice(0, 5),
          entries,
          this.usageString(target, entries)
        );
      }

      const index = entries.findIndex((entry) => entry.includes(oldTrim));
      const next = [...entries];
      next.splice(index, 1);

      await this.persistTarget(target, next);
      return this.success(target, next, "Entry removed");
    });
  }

  private async reloadTarget(target: MemoryTarget): Promise<void> {
    const loaded = await this.repository.loadEntries(target);
    this.setEntries(target, this.dedupe(loaded.map((entry) => entry.content)));
  }

  private async persistTarget(target: MemoryTarget, entries: string[]): Promise<void> {
    const now = new Date().toISOString();
    await this.repository.saveEntries(
      target,
      entries.map((content, idx) => ({
        id: `${target}-${idx}`,
        target,
        content,
        createdAt: now,
        updatedAt: now,
      }))
    );
    this.setEntries(target, entries);
  }

  private dedupe(entries: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of entries) {
      if (!seen.has(entry)) {
        seen.add(entry);
        out.push(entry);
      }
    }
    return out;
  }

  private entriesFor(target: MemoryTarget): string[] {
    return target === "memory" ? this.memoryEntries : this.userEntries;
  }

  private setEntries(target: MemoryTarget, entries: string[]): void {
    if (target === "memory") {
      this.memoryEntries = entries;
      return;
    }
    this.userEntries = entries;
  }

  private charCount(entries: string[]): number {
    return entries.join(ENTRY_DELIMITER).length;
  }

  private charLimit(target: MemoryTarget): number {
    return target === "memory" ? this.memoryCharLimit : this.userCharLimit;
  }

  private usageString(target: MemoryTarget, entries: string[]): string {
    const count = this.charCount(entries);
    const limit = this.charLimit(target);
    const pct = Math.round((count / limit) * 100);
    return `${pct}% — ${count}/${limit} chars`;
  }

  private renderBlock(target: MemoryTarget, entries: string[]): string {
    if (entries.length === 0) {
      return "";
    }

    const usage = this.usageString(target, entries);
    const title =
      target === "memory"
        ? `MEMORY (your personal notes) [${usage}]`
        : `USER PROFILE (who the user is) [${usage}]`;

    return `${target}:\n${title}\n${entries.map((item) => `- ${item}`).join("\n")}`;
  }

  private success(
    target: MemoryTarget,
    entries: string[],
    message?: string
  ): MemoryOperationSuccess {
    return {
      success: true,
      target,
      entries,
      usage: this.usageString(target, entries),
      entry_count: entries.length,
      message,
    };
  }

  private failure(
    error: string,
    matches?: string[],
    current_entries?: string[],
    usage?: string
  ): MemoryOperationFailure {
    return {
      success: false,
      error,
      matches,
      current_entries,
      usage,
    };
  }
}
