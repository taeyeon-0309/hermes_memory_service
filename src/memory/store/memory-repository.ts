import { MemoryEntry, MemoryTarget } from "../kernel/types";

export interface MemoryRepository {
  loadEntries(target: MemoryTarget): Promise<MemoryEntry[]>;
  saveEntries(target: MemoryTarget, entries: MemoryEntry[]): Promise<void>;
  withLock<T>(target: MemoryTarget, fn: () => Promise<T>): Promise<T>;
}
