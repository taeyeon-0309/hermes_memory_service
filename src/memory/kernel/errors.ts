export class MemoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryError";
  }
}

export class MemoryValidationError extends MemoryError {
  constructor(message: string) {
    super(message);
    this.name = "MemoryValidationError";
  }
}

export class MemoryStorageError extends MemoryError {
  constructor(message: string) {
    super(message);
    this.name = "MemoryStorageError";
  }
}

export class MemorySecurityError extends MemoryError {
  constructor(message: string) {
    super(message);
    this.name = "MemorySecurityError";
  }
}

export class MemoryProviderError extends MemoryError {
  constructor(message: string) {
    super(message);
    this.name = "MemoryProviderError";
  }
}
