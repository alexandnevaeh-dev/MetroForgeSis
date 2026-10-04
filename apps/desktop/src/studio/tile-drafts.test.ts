import { describe, expect, it } from 'vitest';
import { createTileDraftStore, tileDraftKey } from './tile-drafts.js';

const saved = [{ x: 1, y: 2, col: 0, row: 0 }];
const painted = [...saved, { x: 3, y: 4, col: 2, row: 1 }];
describe('room tile drafts across navigation and asynchronous saves', () => {
  it('keeps room and project identities distinct and preserves a draft on refresh', () => {
    const store = createTileDraftStore(),
      key = tileDraftKey('E:/one', 'room_000');
    store.load(key, saved);
    store.edit(key, painted);
    store.load(tileDraftKey('E:/two', 'room_000'), []);
    store.load(key, saved);
    expect(store.get(key).cells).toEqual(painted);
    expect(store.get(key).dirty).toBe(true);
    expect(store.get(tileDraftKey('E:/two', 'room_000')).cells).toEqual([]);
  });
  it('retains failed drafts and unlocks retry without duplicating pending saves', () => {
    const store = createTileDraftStore();
    store.load('room', saved);
    store.edit('room', painted);
    expect(store.beginSave('room')).toEqual({ cells: painted, base: saved });
    expect(store.beginSave('room')).toBeNull();
    store.edit('room', []);
    store.discard('room', []);
    store.load('room', []);
    expect(store.get('room').cells).toEqual(painted);
    store.finishSave('room', null, 'Failed');
    expect(store.get('room')).toMatchObject({ dirty: true, busy: false, message: 'Failed' });
    expect(store.beginSave('room')).not.toBeNull();
  });
  it('detects an external saved change and requires explicit discard to adopt it', () => {
    const store = createTileDraftStore();
    store.load('room', saved);
    store.edit('room', painted);
    const external = [{ x: 5, y: 2, col: 1, row: 0 }];
    store.load('room', external);
    expect(store.get('room')).toMatchObject({ cells: painted, base: saved, conflict: true });
    expect(store.beginSave('room')).toBeNull();
    store.discard('room', external);
    expect(store.get('room')).toMatchObject({
      cells: external,
      base: external,
      dirty: false,
      conflict: false,
    });
  });
  it('completes a save after the owning screen unmounts and adopts the saved snapshot', () => {
    const store = createTileDraftStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => notifications++);
    store.load('room', saved);
    store.edit('room', painted);
    const snapshot = store.beginSave('room')!;
    unsubscribe();
    store.finishSave('room', snapshot.cells, 'Saved');
    store.load('room', painted);
    expect(store.get('room')).toMatchObject({
      cells: painted,
      base: painted,
      dirty: false,
      busy: false,
    });
    expect(notifications).toBe(3);
  });
  it('treats cell ordering as equivalent and isolates mutable snapshots', () => {
    const store = createTileDraftStore();
    const input = painted.map((cell) => ({ ...cell }));
    store.load('room', input);
    input[0].x = 99;
    store.edit('room', [...painted].reverse());
    expect(store.get('room').dirty).toBe(false);
    store.edit('room', []);
    const snapshot = store.beginSave('room')!;
    snapshot.base[0].x = 88;
    expect(store.get('room').base).toEqual(painted);
  });
});
