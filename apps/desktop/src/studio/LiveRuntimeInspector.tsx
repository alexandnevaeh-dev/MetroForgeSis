import { useEffect, useRef, useState } from 'react';
import type { LivePlacementInspection } from './metroforge-api.js';
import { Button, Input, InspectorSection, Select } from './ui/index.js';

type RuntimeObject = {
  nodePath: string;
  instanceId: string;
  name: string;
  x: number;
  y: number;
  authored?: unknown;
  inspection?: LivePlacementInspection;
  saveUnavailable?: string;
};
type Move = RuntimeObject;

export function LiveRuntimeInspector({
  projectPath,
  sessionStartedAt,
}: {
  projectPath: string;
  sessionStartedAt: string;
}) {
  const [objects, setObjects] = useState<RuntimeObject[]>([]);
  const [selection, setSelection] = useState('');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Inspect the running scene to select an object.');
  const [undoHistory, setUndo] = useState<Move[]>([]);
  const undo = undoHistory.at(-1);
  const [redoHistory, setRedo] = useState<Move[]>([]);
  const redo = redoHistory.at(-1);
  const pending = useRef(false);
  const mounted = useRef(true);
  const objectsRef = useRef(objects);
  const selectionRef = useRef(selection);
  objectsRef.current = objects;
  selectionRef.current = selection;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Poll runtime viewport picks (Ctrl+click in the Godot window / pick_at) into the inspector.
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => {
      if (pending.current || !mounted.current || !window.metroforge) return;
      void window.metroforge.playtestCommand(projectPath, 'get_state', {}).then((response) => {
        if (!mounted.current || !response.ok || !response.result) return;
        const sel = response.result.selection as
          | { nodePath?: string; x?: number; y?: number }
          | null
          | undefined;
        if (!sel || typeof sel.nodePath !== 'string') return;
        if (sel.nodePath === selectionRef.current) return;
        const match = objectsRef.current.find((object) => object.nodePath === sel.nodePath);
        if (!match) return;
        const next =
          Number.isFinite(sel.x) && Number.isFinite(sel.y)
            ? { ...match, x: Number(sel.x), y: Number(sel.y) }
            : match;
        setObjects((items) =>
          items.map((item) => (item.nodePath === next.nodePath ? { ...item, x: next.x, y: next.y } : item)),
        );
        setSelection(next.nodePath);
        setX(String(next.x));
        setY(String(next.y));
        setStatus(`Selected ${next.nodePath} from the game viewport (Ctrl+click).`);
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [connected, projectPath]);

  const selected = objects.find((object) => object.nodePath === selection);
  const invalid =
    x.trim() === '' ||
    y.trim() === '' ||
    !Number.isFinite(Number(x)) ||
    !Number.isFinite(Number(y));

  function select(object?: RuntimeObject) {
    setSelection(object?.nodePath ?? '');
    setX(object ? String(object.x) : '');
    setY(object ? String(object.y) : '');
  }

  async function request(
    command: string,
    payload: Record<string, unknown>,
    success: (result: Record<string, unknown>) => void | Promise<void>,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!window.metroforge)
        throw new Error('Open Metroforge desktop to connect to the running game.');
      const response = await window.metroforge.playtestCommand(projectPath, command, payload);
      if (!mounted.current) return;
      if (!response.ok || !response.result)
        throw new Error(
          response.error ??
            'Runtime did not acknowledge this change. Inspect again before retrying.',
        );
      await success(response.result);
    } catch (cause) {
      if (mounted.current) {
        setConnected(false);
        setStatus('Command not confirmed. Inspect the scene again before editing.');
        setError(String(cause instanceof Error ? cause.message : cause));
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function inspect() {
    void request('get_state', {}, async (result) => {
      const inspected = Array.isArray(result.objects)
        ? result.objects.filter(
            (item): item is RuntimeObject =>
              item &&
              typeof item.nodePath === 'string' &&
              item.nodePath !== '.' &&
              typeof item.instanceId === 'string' &&
              typeof item.name === 'string' &&
              Number.isFinite(item.x) &&
              Number.isFinite(item.y),
          )
        : [];
      const items = await Promise.all(
        inspected.map(async (object): Promise<RuntimeObject> => {
          if (!object.authored)
            return {
              ...object,
              saveUnavailable: 'This object has no authored placement. Changes remain temporary.',
            };
          try {
            const inspection = await window.metroforge!.inspectLivePlacement(projectPath, {
              nodePath: object.nodePath,
              instanceId: object.instanceId,
              sessionStartedAt,
            });
            return { ...object, ...inspection.position, inspection };
          } catch (cause) {
            return {
              ...object,
              saveUnavailable: cause instanceof Error ? cause.message : String(cause),
            };
          }
        }),
      );
      if (!mounted.current) return;
      setObjects(items);
      setConnected(true);
      select(items.find((object) => object.nodePath === selection) ?? items[0]);
      setUndo([]);
      setRedo([]);
      setStatus(
        items.length
          ? `${items.length} ${items.length === 1 ? 'object' : 'objects'} available. Ctrl+click in the Godot window to select. Coordinates are relative to each object's parent.`
          : 'No editable objects in the current scene.',
      );
    });
  }

  function move(target: RuntimeObject, nextX: number, nextY: number, history: 'apply' | 'undo' | 'redo' = 'apply') {
    void request(
      'set_entity_position',
      { nodePath: target.nodePath, expectedInstanceId: target.instanceId, x: nextX, y: nextY },
      (result) => {
        const previous = result.previous as { x?: number; y?: number } | undefined;
        if (
          !Number.isFinite(result.x) ||
          !Number.isFinite(result.y) ||
          !Number.isFinite(previous?.x) ||
          !Number.isFinite(previous?.y)
        ) {
          setConnected(false);
          setStatus('Command not confirmed. Inspect the scene again before editing.');
          setError('Unexpected runtime response. Inspect the scene before making another change.');
          setUndo([]);
          setRedo([]);
          return;
        }
        const updated = { ...target, x: Number(result.x), y: Number(result.y) };
        setObjects((items) =>
          items.map((item) => (item.instanceId === target.instanceId ? updated : item)),
        );
        select(updated);
        const inverse = { ...target, x: Number(previous?.x), y: Number(previous?.y) };
        if (history === 'undo') {
          setUndo((items) => items.slice(0, -1));
          setRedo((items) => [...items, inverse].slice(-100));
        } else {
          setUndo((items) => [...items, inverse].slice(-100));
          setRedo((items) => history === 'redo' ? items.slice(0, -1) : []);
        }
        setStatus(
          history === 'undo'
            ? 'Position restored in the running game.'
            : 'Position applied in the running game.',
        );
      },
    );
  }

  async function savePlacement() {
    if (pending.current || !selected?.inspection || !window.metroforge) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await window.metroforge.saveLivePlacement(projectPath, selected.inspection, {
        x: selected.x,
        y: selected.y,
      });
      if (!mounted.current) return;
      const update = (item: RuntimeObject): RuntimeObject =>
        item.instanceId === selected.instanceId
          ? { ...item, inspection: { ...selected.inspection!, source: saved } }
          : {
              ...item,
              inspection: undefined,
              saveUnavailable: 'Source changed. Inspect again before saving this object.',
            };
      setObjects((items) => items.map(update));
      setUndo((items) => items.map(update));
      setRedo((items) => items.map(update));
      setStatus(
        'Placement saved for future play sessions. Undo position still affects only the running game.',
      );
    } catch (cause) {
      if (mounted.current) {
        setConnected(false);
        setUndo([]);
        setRedo([]);
        setObjects((items) =>
          items.map((item) => ({
            ...item,
            inspection: undefined,
            saveUnavailable: 'Inspect again before saving.',
          })),
        );
        setStatus('Save not confirmed. Inspect again before retrying.');
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <InspectorSection title="Live objects">
      <p className="hint">
        Apply, Undo and Redo change the running game. Save placement keeps the position for future play
        sessions. Pause moving objects for precise placement. Ctrl+click an object in the Godot window to
        select it here after Inspect.
      </p>
      <Button size="sm" disabled={busy} onClick={inspect}>
        Inspect running scene
      </Button>
      <div aria-busy={busy}>
        <label>
          Object
          <Select
            value={selection}
            disabled={busy || !objects.length}
            onChange={(event) =>
              select(objects.find((object) => object.nodePath === event.target.value))
            }
          >
            {!objects.length && <option value="">No objects inspected</option>}
            {objects.map((object) => (
              <option key={object.instanceId} value={object.nodePath}>
                {object.nodePath}
              </option>
            ))}
          </Select>
        </label>
        <div className="row">
          <label>
            X
            <Input
              type="number"
              step="any"
              value={x}
              disabled={busy || !selected}
              onChange={(event) => setX(event.target.value)}
            />
          </label>
          <label>
            Y
            <Input
              type="number"
              step="any"
              value={y}
              disabled={busy || !selected}
              onChange={(event) => setY(event.target.value)}
            />
          </label>
        </div>
        <div className="row">
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !connected || !selected || invalid}
            onClick={() => selected && move(selected, Number(x), Number(y))}
          >
            Apply position
          </Button>
          <Button
            size="sm"
            disabled={busy || !connected || !undo}
            onClick={() => undo && move(undo, undo.x, undo.y, 'undo')}
          >
            Undo position
          </Button>
          <Button
            size="sm"
            disabled={busy || !connected || !redo}
            onClick={() => redo && move(redo, redo.x, redo.y, 'redo')}
          >
            Redo position
          </Button>
        </div>
        <Button
          size="sm"
          disabled={
            busy ||
            !connected ||
            !selected?.inspection ||
            invalid ||
            Number(x) !== selected.x ||
            Number(y) !== selected.y ||
            (selected.x === selected.inspection.source.x &&
              selected.y === selected.inspection.source.y)
          }
          onClick={() => void savePlacement()}
        >
          Save placement
        </Button>
        {selected && (
          <p className="hint">
            {selected.inspection
              ? `Saved position: ${selected.inspection.source.x}, ${selected.inspection.source.y}. Apply coordinate changes before saving.`
              : (selected.saveUnavailable ??
                'Inspect again to check whether this placement can be saved.')}
          </p>
        )}
      </div>
      <p className="hint" role="status">
        {busy ? 'Waiting for the running game…' : status}
      </p>
      {error && (
        <p className="result error" role="alert">
          {error}
        </p>
      )}
    </InspectorSection>
  );
}
