/** Engine-neutral authoring state. Runtime adapters acknowledge revisions separately. */
export type EditableValue = string | number | boolean | null;
export interface EditableObject {
  id: string;
  roomId: string;
  x: number;
  y: number;
  properties: Record<string, EditableValue>;
}
export type LiveEditOperation =
  | { type: 'add'; object: EditableObject }
  | { type: 'remove'; objectId: string }
  | { type: 'move'; objectId: string; x: number; y: number }
  | { type: 'property'; objectId: string; key: string; value: EditableValue }
  | { type: 'remove-property'; objectId: string; key: string };
export interface LiveEditTransaction {
  projectId: string;
  sessionId: string;
  baseRevision: number;
  operations: LiveEditOperation[];
}
export interface LiveEditReceipt {
  revision: number;
  operations: LiveEditOperation[];
  inverse: LiveEditOperation[];
}

const reservedKeys = new Set(['__proto__', 'prototype', 'constructor']);
function validKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= 128 && !reservedKeys.has(key);
}
function validValue(value: unknown): value is EditableValue {
  return value === null || typeof value === 'boolean' ||
    (typeof value === 'string' && value.length <= 4096) ||
    (typeof value === 'number' && Number.isFinite(value));
}

export class LiveEditSession {
  private objects: Map<string, EditableObject>;
  private revision = 0;
  private runtimeRevision: number | null = null;
  private savedRevision = 0;
  private undoStack: LiveEditReceipt[] = [];
  private redoStack: LiveEditReceipt[] = [];

  constructor(
    readonly projectId: string,
    readonly sessionId: string,
    objects: EditableObject[],
    private readonly editableProperties: ReadonlySet<string>,
  ) {
    if (!projectId || !sessionId) throw new Error('Project and session IDs are required');
    this.objects = new Map();
    for (const object of objects) {
      if (!object.id || !object.roomId || this.objects.has(object.id) ||
          !Number.isFinite(object.x) || !Number.isFinite(object.y) ||
          !object.properties || Object.entries(object.properties).some(([key, value]) => !validKey(key) || !validValue(value))) {
        throw new Error('Invalid or duplicate editable object');
      }
      this.objects.set(object.id, structuredClone(object));
    }
    this.editableProperties = new Set(editableProperties);
  }

  snapshot() {
    return {
      projectId: this.projectId, sessionId: this.sessionId, revision: this.revision,
      savedRevision: this.savedRevision, runtimeRevision: this.runtimeRevision,
      runtimeSynchronized: this.runtimeRevision === this.revision,
      dirty: this.savedRevision !== this.revision,
      canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0,
      objects: structuredClone([...this.objects.values()]),
    };
  }

  private assertCurrent(transaction: Pick<LiveEditTransaction, 'projectId' | 'sessionId' | 'baseRevision'>) {
    if (transaction.projectId !== this.projectId || transaction.sessionId !== this.sessionId) {
      throw new Error('Edit belongs to another project or preview session');
    }
    if (transaction.baseRevision !== this.revision) throw new Error('Stale edit revision');
  }

  private apply(operations: LiveEditOperation[]): LiveEditReceipt {
    if (!Array.isArray(operations) || operations.length === 0 || operations.length > 1000) {
      throw new Error('An edit must contain 1–1000 operations');
    }
    const next = new Map([...this.objects].map(([id, object]) => [id, structuredClone(object)]));
    const inverse: LiveEditOperation[] = [];
    for (const operation of operations) {
      if (!operation || typeof operation !== 'object') throw new Error('Invalid edit operation');
      if (operation.type === 'add') {
        const added = operation.object;
        if (!added || typeof added.id !== 'string' || !added.id ||
            typeof added.roomId !== 'string' || !added.roomId || next.has(added.id) ||
            !Number.isFinite(added.x) || !Number.isFinite(added.y) ||
            !added.properties || typeof added.properties !== 'object' || Array.isArray(added.properties) ||
            Object.entries(added.properties).some(([key, value]) => !validKey(key) || !validValue(value))) {
          throw new Error('Invalid or duplicate editable object');
        }
        next.set(added.id, structuredClone(added));
        inverse.unshift({ type: 'remove', objectId: added.id });
        continue;
      }
      const object = next.get(operation.objectId);
      if (!object) throw new Error(`Unknown object: ${operation.objectId}`);
      if (operation.type === 'remove') {
        inverse.unshift({ type: 'add', object: structuredClone(object) });
        next.delete(object.id);
      } else if (operation.type === 'move') {
        if (!Number.isFinite(operation.x) || !Number.isFinite(operation.y)) throw new Error('Position must be finite');
        inverse.unshift({ type: 'move', objectId: object.id, x: object.x, y: object.y });
        object.x = operation.x;
        object.y = operation.y;
      } else if (operation.type === 'property' || operation.type === 'remove-property') {
        if (!validKey(operation.key) || !this.editableProperties.has(operation.key)) throw new Error('Property is not editable');
        if (operation.type === 'property' && !validValue(operation.value)) throw new Error('Invalid property value');
        inverse.unshift(Object.hasOwn(object.properties, operation.key)
          ? { type: 'property', objectId: object.id, key: operation.key, value: object.properties[operation.key]! }
          : { type: 'remove-property', objectId: object.id, key: operation.key });
        if (operation.type === 'property') object.properties[operation.key] = operation.value;
        else delete object.properties[operation.key];
      } else {
        throw new Error('Unsupported edit operation');
      }
    }
    this.objects = next;
    this.revision++;
    return { revision: this.revision, operations: structuredClone(operations), inverse };
  }

  commit(transaction: LiveEditTransaction): LiveEditReceipt {
    this.assertCurrent(transaction);
    const receipt = this.apply(transaction.operations);
    this.undoStack.push(structuredClone(receipt));
    this.redoStack = [];
    return receipt;
  }

  undo(transaction: Omit<LiveEditTransaction, 'operations'>): LiveEditReceipt {
    this.assertCurrent(transaction);
    const previous = this.undoStack.at(-1);
    if (!previous) throw new Error('Nothing to undo');
    const receipt = this.apply(previous.inverse);
    this.undoStack.pop();
    this.redoStack.push(previous);
    return receipt;
  }

  redo(transaction: Omit<LiveEditTransaction, 'operations'>): LiveEditReceipt {
    this.assertCurrent(transaction);
    const previous = this.redoStack.at(-1);
    if (!previous) throw new Error('Nothing to redo');
    const receipt = this.apply(previous.operations);
    this.redoStack.pop();
    this.undoStack.push(structuredClone(receipt));
    return receipt;
  }

  /** Call only after persistence of this exact snapshot succeeds. */
  markSaved(revision: number) {
    if (revision !== this.revision) throw new Error('Cannot mark a stale revision saved');
    this.savedRevision = revision;
  }

  /** Adapter must call this only for a successfully applied, matching revision. */
  acknowledgeRuntime(projectId: string, sessionId: string, revision: number) {
    this.assertCurrent({ projectId, sessionId, baseRevision: revision });
    this.runtimeRevision = revision;
  }

  disconnectRuntime() {
    this.runtimeRevision = null;
  }
}
