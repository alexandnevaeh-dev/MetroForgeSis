import { useEffect, useRef, useState, useId } from 'react';
import { Button, Input, ButtonStrip } from './ui/index.js';
import type { UnityFurnishingEdit } from '@metroforge/engines';

type Request = UnityFurnishingEdit & { role: string; width: number };
type Draft = {
  requests: Request[];
  fingerprints: string[];
  changes: Record<string, { x: string; floorY: string; height: string }>;
  undo: string[];
  redo: string[];
};
const drafts = new Map<string, Draft>();
if (typeof window !== 'undefined')
  window.addEventListener('beforeunload', (event) => {
    if ([...drafts.values()].some((d) => Object.keys(d.changes).length)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

export function UnityFurnishingEditor({
  projectPath,
  roomId,
  selectedId,
  geometryDirty,
  onDirtyChange,
  onSaved,
  revision,
}: {
  projectPath: string;
  roomId: string;
  selectedId?: string;
  geometryDirty: boolean;
  revision?: string;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
}) {
  const key = JSON.stringify([projectPath, roomId]),
    fieldId = useId(),
    alive = useRef(true),
    pending = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null),
    [, refresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const reload = async (preserveHistory = false) => {
    const data = await window.metroforge!.readUnityRoomEdit(projectPath, roomId);
    if (!alive.current) return;
    const next: Draft = {
      requests: data.furnishingRequests ?? [],
      fingerprints: data.fingerprints,
      changes: {},
      undo:
        preserveHistory &&
        JSON.stringify(drafts.get(key)?.fingerprints) === JSON.stringify(data.fingerprints)
          ? drafts.get(key)!.undo
          : [],
      redo:
        preserveHistory &&
        JSON.stringify(drafts.get(key)?.fingerprints) === JSON.stringify(data.fingerprints)
          ? drafts.get(key)!.redo
          : [],
    };
    drafts.set(key, next);
    setDraft(next);
  };
  useEffect(() => {
    alive.current = true;
    const cached = drafts.get(key);
    if (cached && Object.keys(cached.changes).length) setDraft(cached);
    else
      void reload(true).catch((e) => {
        if (alive.current) setError(String(e));
      });
    return () => {
      alive.current = false;
    };
  }, [key]);
  const dirty = !!draft && Object.keys(draft.changes).length > 0;
  useEffect(() => {
    let active = true;
    if (!draft || dirty || busy || pending.current) return;
    const expected = JSON.stringify(draft.fingerprints);
    void window
      .metroforge!.readUnityRoomEdit(projectPath, roomId)
      .then((data) => {
        if (
          !active ||
          pending.current ||
          Object.keys(draft.changes).length ||
          JSON.stringify(draft.fingerprints) !== expected
        )
          return;
        if (JSON.stringify(data.fingerprints) !== expected) {
          draft.requests = data.furnishingRequests ?? [];
          draft.fingerprints = data.fingerprints;
          draft.undo = [];
          draft.redo = [];
          setNotice(
            'Placement data refreshed after another saved room edit. Previous placement history is unavailable.',
          );
          refresh((n) => n + 1);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [revision, key, draft, dirty, busy, projectPath, roomId]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const request = draft?.requests.find((r) => r.id === selectedId);
  const values = request
    ? (draft!.changes[request.id] ?? {
        x: String(request.x),
        floorY: String(request.floorY),
        height: String(request.height),
      })
    : null;
  const valid =
    !!draft &&
    Object.values(draft.changes).every(
      (v) =>
        [v.x, v.floorY, v.height].every((t) => t.trim() !== '' && Number.isFinite(Number(t))) &&
        Number(v.x) >= 0 &&
        Number(v.floorY) >= 0 &&
        Number(v.height) >= 1,
    );
  const set = (field: 'x' | 'floorY' | 'height', value: string) => {
    if (!draft || !request || !values) return;
    draft.changes[request.id] = { ...values, [field]: value };
    setError('');
    setNotice('');
    refresh((n) => n + 1);
  };
  const perform = async (kind: 'save' | 'undo' | 'redo') => {
    if (!draft || pending.current || geometryDirty) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const changes = Object.entries(draft.changes).map(([id, v]) => ({
        id,
        x: Number(v.x),
        floorY: Number(v.floorY),
        height: Number(v.height),
      }));
      const token = (kind === 'undo' ? draft.undo : draft.redo).at(-1);
      const result =
        kind === 'save'
          ? await window.metroforge!.saveUnityFurnishingEdit(
              projectPath,
              roomId,
              changes,
              draft.fingerprints,
            )
          : await window.metroforge!.restoreUnityRoomEdit(
              projectPath,
              roomId,
              token!,
              draft.fingerprints,
            );
      draft.fingerprints = result.fingerprints;
      draft.changes = {};
      if (kind === 'save') {
        draft.undo.push(result.backupId);
        draft.redo = [];
      } else if (kind === 'undo') {
        draft.undo.pop();
        draft.redo.push(result.backupId);
      } else {
        draft.redo.pop();
        draft.undo.push(result.backupId);
      }
      try {
        const data = await window.metroforge!.readUnityRoomEdit(projectPath, roomId);
        draft.requests = data.furnishingRequests ?? [];
      } catch {
        if (alive.current)
          setError(
            'The edit was saved, but placement data could not be refreshed. Reload placement data.',
          );
      }
      if (alive.current) {
        setNotice(
          kind === 'save'
            ? 'Saved authored request and revalidated placements. Restart Unity to inspect the result.'
            : kind === 'undo'
              ? 'Restored the previous saved edit.'
              : 'Restored the saved edit again.',
        );
        refresh((n) => n + 1);
        onDirtyChange(false);
        onSaved();
      }
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div className="unity-furnishing-editor" aria-busy={busy}>
      {geometryDirty && (
        <p className="hint">Save or reload the geometry draft before changing furnishings.</p>
      )}
      {!draft && !error && (
        <p role="status" className="hint">
          Loading authored requests…
        </p>
      )}
      {draft && !request && (
        <p className="hint">This furnishing has no editable source request in this export.</p>
      )}
      {request && values && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && dirty && !geometryDirty) void perform('save');
          }}
        >
          <fieldset disabled={busy || geometryDirty}>
            <legend>Authored placement</legend>
            {(['x', 'floorY', 'height'] as const).map((field, index) => (
              <label key={field} htmlFor={`${fieldId}-${field}`}>
                {['Ground X', 'Ground Y', 'Display height'][index]}
                <Input
                  id={`${fieldId}-${field}`}
                  type="number"
                  step="any"
                  min={field === 'height' ? 1 : 0}
                  value={values[field]}
                  onChange={(e) => set(field, e.target.value)}
                />
              </label>
            ))}
          </fieldset>
          <p className="hint">
            Height scales the artwork uniformly. Unsupported placements are omitted at their
            authored location; assets and collision stay unchanged.
          </p>
          {dirty && !valid && <p role="alert">Enter finite positions and a positive height.</p>}
          <ButtonStrip>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={!dirty || !valid || busy || geometryDirty}
            >
              Save placement
            </Button>
            <Button
              size="sm"
              disabled={!dirty || busy}
              onClick={() => {
                if (!draft) return;
                draft.changes = {};
                setError('');
                setNotice('Draft discarded. Saved placement retained.');
                refresh((n) => n + 1);
              }}
            >
              Discard placement draft
            </Button>
          </ButtonStrip>
        </form>
      )}
      {draft && (
        <ButtonStrip>
          <Button
            size="sm"
            disabled={dirty || busy || geometryDirty || !draft.undo.length}
            onClick={() => void perform('undo')}
          >
            Undo saved placement
          </Button>
          <Button
            size="sm"
            disabled={dirty || busy || geometryDirty || !draft.redo.length}
            onClick={() => void perform('redo')}
          >
            Redo saved placement
          </Button>
        </ButtonStrip>
      )}
      {error && (
        <div>
          <p role="alert">{error}</p>
          <Button
            size="sm"
            disabled={busy || dirty}
            onClick={() => {
              setError('');
              void reload().catch((e) => setError(String(e)));
            }}
          >
            Reload placement data
          </Button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
