export interface EditCommand<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  undoPayload?: TPayload;
  timestamp: string;
}

export class EditHistory<TPayload = unknown> {
  private undoStack: EditCommand<TPayload>[] = [];
  private redoStack: EditCommand<TPayload>[] = [];
  private readonly limit: number;

  constructor(limit = 50) {
    this.limit = limit;
  }

  push(command: EditCommand<TPayload>): void {
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  peekUndo(): EditCommand<TPayload> | null {
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  peekRedo(): EditCommand<TPayload> | null {
    return this.redoStack[this.redoStack.length - 1] ?? null;
  }

  popUndo(): EditCommand<TPayload> | null {
    const cmd = this.undoStack.pop();
    if (cmd) this.redoStack.push(cmd);
    return cmd ?? null;
  }

  popRedo(): EditCommand<TPayload> | null {
    const cmd = this.redoStack.pop();
    if (cmd) this.undoStack.push(cmd);
    return cmd ?? null;
  }

  list(): EditCommand<TPayload>[] {
    return [...this.undoStack];
  }
}
