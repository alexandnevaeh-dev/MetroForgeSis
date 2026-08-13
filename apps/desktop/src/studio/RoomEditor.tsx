import { useEffect, useState } from 'react';
import type { StudioProject } from './types';
import { CommandBar } from './CommandBar';
import { EditStatusBadge } from './EditStatusBadge';
import { TilePaintEditor } from './TilePaintEditor';
import { VirtualizedRoomList } from './VirtualizedRoomList';

type RoomRecord = {
  id: string;
  archetype?: string;
  biomeId?: string;
  width?: number;
  height?: number;
  enemies?: string[];
  connections?: Array<{ direction: string; targetRoomId: string }>;
  tileCells?: Array<{ x: number; y: number; col: number; row: number }>;
};

export function RoomEditor() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = async (path: string) => {
    if (!window.metroforge?.listRooms) return;
    const list = await window.metroforge.listRooms(path);
    setRooms(list);
    if (list.length > 0) setSelectedRoomId((prev) => prev || list[0]!.id);
  };

  useEffect(() => {
    window.metroforge?.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) setSelectedPath((p) => p || list[0]!.path);
    });
  }, []);

  useEffect(() => {
    if (selectedPath) loadRooms(selectedPath);
  }, [selectedPath]);

  const selected = rooms.find((r) => r.id === selectedRoomId);

  const runRoomAction = async (action: () => Promise<{ success?: boolean; error?: string; message?: string }>) => {
    setError(null);
    setMessage(null);
    const result = await action();
    if (result.error || result.success === false) setError(result.error ?? 'Action failed');
    else setMessage(result.message ?? 'Done');
    await loadRooms(selectedPath);
  };

  return (
    <section>
      <h2>Room Editor <EditStatusBadge projectPath={selectedPath} /></h2>
      <p className="hint">Edit individual rooms — changes recompile only the affected `.tscn`.</p>
      <label>
        Project
        <select value={selectedPath} onChange={(e) => setSelectedPath(e.target.value)}>
          {projects.map((p) => (
            <option key={p.slug} value={p.path}>
              {p.title ?? p.slug}
            </option>
          ))}
        </select>
      </label>

      <CommandBar
        projectPath={selectedPath}
        selectedRoomId={selectedRoomId}
        onSuccess={() => loadRooms(selectedPath)}
      />

      <div className="room-editor-layout">
        <VirtualizedRoomList
          items={rooms}
          selectedId={selectedRoomId}
          onSelect={(room) => setSelectedRoomId(room.id)}
          renderItem={(room, active) => (
            <span className={active ? 'room-item active' : 'room-item'}>
              <strong>{room.id}</strong>
              <span>{room.archetype ?? 'room'}</span>
            </span>
          )}
        />

        {selected && (
          <aside className="room-detail panel">
            <h3>{selected.id}</h3>
            <dl className="settings-dl">
              <dt>Archetype</dt>
              <dd>{selected.archetype ?? '—'}</dd>
              <dt>Biome</dt>
              <dd>{selected.biomeId ?? '—'}</dd>
              <dt>Size</dt>
              <dd>
                {selected.width ?? 800}×{selected.height ?? 600}
              </dd>
              <dt>Enemies</dt>
              <dd>{(selected.enemies ?? []).join(', ') || 'none'}</dd>
              <dt>Connections</dt>
              <dd>
                {(selected.connections ?? [])
                  .map((c) => `${c.direction}→${c.targetRoomId}`)
                  .join(', ') || 'none'}
              </dd>
            </dl>

            <RoomCanvasPreview room={selected} />

            <TilePaintEditor
              projectPath={selectedPath}
              roomId={selected.id}
              biomeId={selected.biomeId ?? 'biome_0'}
              width={selected.width ?? 800}
              height={selected.height ?? 600}
              initialCells={selected.tileCells ?? []}
              onSaved={() => loadRooms(selectedPath)}
            />

            <div className="row">
              <button
                type="button"
                onClick={() =>
                  runRoomAction(() =>
                    window.metroforge!.updateRoom!(selectedPath, {
                      roomId: selected.id,
                      hasEnemy: true,
                    }),
                  )
                }
              >
                Add Enemy
              </button>
              <button
                type="button"
                onClick={() =>
                  runRoomAction(() =>
                    window.metroforge!.regenerateRoom!(selectedPath, selected.id, 'encounter'),
                  )
                }
              >
                Regenerate Encounter
              </button>
              <button
                type="button"
                onClick={() =>
                  runRoomAction(() =>
                    window.metroforge!.regenerateRoom!(selectedPath, selected.id, 'full'),
                  )
                }
              >
                Regenerate Room
              </button>
            </div>
          </aside>
        )}
      </div>

      {message && <p className="result success">{message}</p>}
      {error && <p className="result error">{error}</p>}
    </section>
  );
}

function RoomCanvasPreview({ room }: { room: RoomRecord }) {
  const w = room.width ?? 800;
  const h = room.height ?? 600;
  const scale = 0.35;

  return (
    <div className="room-canvas-wrap panel">
      <svg
        className="room-canvas"
        width={w * scale}
        height={h * scale}
        viewBox={`0 0 ${w} ${h}`}
      >
        <rect x={0} y={0} width={w} height={h} fill="#0f172a" />
        <rect x={0} y={h - 64} width={w} height={64} fill="#334155" />
        <circle cx={100} cy={h - 114} r={12} fill="#60a5fa" />
        {(room.enemies ?? []).map((_, i) => (
          <rect
            key={i}
            x={w - 150 - i * 40}
            y={h - 94}
            width={24}
            height={24}
            fill="#f87171"
          />
        ))}
        {(room.connections ?? []).map((c, i) => {
          let x = w / 2;
          let y = h - 80;
          if (c.direction === 'left') x = 12;
          if (c.direction === 'right') x = w - 24;
          if (c.direction === 'up') y = 24;
          return <rect key={i} x={x} y={y} width={24} height={24} fill="#fbbf24" opacity={0.8} />;
        })}
      </svg>
      <p className="hint">Visual preview from room data (collision/gameplay overlay simplified)</p>
    </div>
  );
}
