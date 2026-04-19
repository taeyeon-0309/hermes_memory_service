export const ENTRY_DELIMITER = "\n§\n";

export interface MemoryOperationSuccess {
  success: true;
  target: "memory" | "user";
  entries: string[];
  usage: string;
  entry_count: number;
  message?: string;
}

export interface MemoryOperationFailure {
  success: false;
  error: string;
  matches?: string[];
  current_entries?: string[];
  usage?: string;
}

export type MemoryOperationResult = MemoryOperationSuccess | MemoryOperationFailure;
