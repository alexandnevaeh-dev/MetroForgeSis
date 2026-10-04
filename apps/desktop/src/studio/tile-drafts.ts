export interface TileCell {
  x: number;
  y: number;
  col: number;
  row: number;
}
export interface TileDraft {
  cells: TileCell[];
  base: TileCell[];
  dirty: boolean;
  busy: boolean;
  conflict: boolean;
  message: string | null;
}

// Session-owned room drafts survive view, room and project navigation. They are
// intentionally separate from saved-room history and never imply file persistence.
export function createTileDraftStore() {
  const drafts = new Map<string, TileDraft>();
  const listeners = new Set<() => void>();
  const equal = (a: TileCell[], b: TileCell[]) => {
    const ordered = (cells: TileCell[]) => [...cells].sort((x, y) => x.y - y.y || x.x - y.x);
    return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
  };
  const clone = (cells: TileCell[]) => cells.map(({ x, y, col, row }) => ({ x, y, col, row }));
  const set = (key: string, value: TileDraft) => {
    drafts.set(key, value);
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get(key: string) {
      return drafts.get(key)!;
    },
    load(key: string, saved: TileCell[]) {
      const previous = drafts.get(key);
      if (previous?.busy) return;
      if (!previous || !previous.dirty) {
        if (previous && equal(previous.base, saved)) return;
        set(key, {
          cells: clone(saved),
          base: clone(saved),
          dirty: false,
          busy: false,
          conflict: false,
          message: null,
        });
      } else {
        const conflict = !equal(previous.base, saved);
        if (conflict !== previous.conflict) set(key, { ...previous, conflict });
      }
    },
    edit(key: string, cells: TileCell[]) {
      const draft = drafts.get(key)!;
      if (draft.busy) return;
      set(key, { ...draft, cells: clone(cells), dirty: !equal(cells, draft.base), message: null });
    },
    discard(key: string, saved: TileCell[]) {
      if (drafts.get(key)?.busy) return;
      set(key, {
        cells: clone(saved),
        base: clone(saved),
        dirty: false,
        busy: false,
        conflict: false,
        message: 'Draft discarded. Saved tiles restored.',
      });
    },
    beginSave(key: string) {
      const draft = drafts.get(key)!;
      if (draft.busy || !draft.dirty || draft.conflict) return null;
      set(key, { ...draft, busy: true, message: null });
      return { cells: clone(draft.cells), base: clone(draft.base) };
    },
    finishSave(key: string, saved: TileCell[] | null, message: string) {
      const draft = drafts.get(key)!;
      set(
        key,
        saved
          ? {
              cells: clone(saved),
              base: clone(saved),
              busy: false,
              dirty: false,
              conflict: false,
              message,
            }
          : { ...draft, busy: false, message },
      );
    },
  };
}

export const tileDrafts = createTileDraftStore();
export const tileDraftKey = (projectPath: string, roomId: string) =>
  JSON.stringify([projectPath, roomId]);
