import { describe, it, expect } from 'vitest';
import { EditHistory } from './edit-history.js';

describe('EditHistory', () => {
  it('supports undo/redo stack', () => {
    const history = new EditHistory<{ value: number }>();
    history.push({ id: '1', type: 'test', payload: { value: 1 }, timestamp: new Date().toISOString() });
    expect(history.canUndo()).toBe(true);
    const undone = history.popUndo();
    expect(undone?.payload.value).toBe(1);
    expect(history.canRedo()).toBe(true);
  });
});
