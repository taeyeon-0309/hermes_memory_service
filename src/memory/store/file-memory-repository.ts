import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MemoryEntry, MemoryTarget } from "../kernel/types";
import { ENTRY_DELIMITER } from "./models";
import { MemoryRepository } from "./memory-repository";

interface FileMemoryRepositoryOptions {
  baseDir: string;
}

export class FileMemoryRepository implements MemoryRepository {
  private readonly baseDir: string;
  private readonly locks = new Map<MemoryTarget, Promise<void>>();

  constructor(options: FileMemoryRepositoryOptions) {
    this.baseDir = options.baseDir;
  }

  async loadEntries(target: MemoryTarget): Promise<MemoryEntry[]> {
    const filePath = this.resolvePath(target);
    let content: string;

    try {
      content = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const now = new Date().toISOString();
    return content
      .split(ENTRY_DELIMITER)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map(
        (item): MemoryEntry => ({
          id: randomUUID(),
          target,
          content: item,
          createdAt: now,
          updatedAt: now,
        })
      );
  }

  async saveEntries(target: MemoryTarget, entries: MemoryEntry[]): Promise<void> {
    const filePath = this.resolvePath(target);
    const dir = path.dirname(filePath);
    const tmpPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    await fs.mkdir(dir, { recursive: true });

    const payload = entries.map((entry) => entry.content).join(ENTRY_DELIMITER);
    const handle = await fs.open(tmpPath, "w");
    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    await fs.rename(tmpPath, filePath);
  }

  async withLock<T>(target: MemoryTarget, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(target) ?? Promise.resolve();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = previous.then(() => gate);

    this.locks.set(target, next);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(target) === next) {
        this.locks.delete(target);
      }
    }
  }

  private resolvePath(target: MemoryTarget): string {
    if (target === "memory") {
      return path.join(this.baseDir, "memories", "MEMORY.md");
    }
    return path.join(this.baseDir, "memories", "USER.md");
  }
}
