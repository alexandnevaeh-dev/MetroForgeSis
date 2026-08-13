import { useEffect, useMemo, useState } from 'react';
import { CommandBar } from './CommandBar.js';
import { EditStatusBadge } from './EditStatusBadge.js';
import { TilePaintEditor } from './TilePaintEditor.js';
import { VirtualizedRoomList } from './VirtualizedRoomList.js';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import type { RoomCollisionPreview } from './metroforge-api.js';

type RoomRecord = {
  id: string;
  index?: number;
  archetype?: string;
  worldArchetype?: string;
  biomeId?: string;
  width?: number;
  height?: number;
  enemies?: string[];
  npcs?: string[];
  collectibles?: string[];
  connections?: Array<{ direction: string; targetRoomId: string; requirements?: string[] }>;
  tileCells?: Array<{ x: number; y: number; col: number; row: number }>;
  weakFloors?: Array<{ x: number; width: number; targetRoomId: string }>;
};

type LayerId = 'visual' | 'collision' | 'entities' | 'navigation' | 'progression' | 'debug';

const TILE = 16;

export function RoomEditor() {
  const { selectedPath, hasActiveProject, focusRoomId, setFocusRoomId, navigate } = useStudio();
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layer, setLayer] = useState<LayerId>('visual');
  const [collision, setCollision] = useState<RoomCollisionPreview | null>(null);

  const loadRooms = async (path: string) => {
    if (!window.metroforge?.listRooms) return;
    const list = await window.metroforge.listRooms(path);
    setRooms(list as RoomRecord[]);
    setSelectedRoomId((prev) => {
      if (focusRoomId && list.some((room) => room.id === focusRoomId)) return focusRoomId;
      if (prev && list.some((room) => room.id === prev)) return prev;
      return list[0]?.id ?? '';
    });
  };

  useEffect(() => {
    if (selectedPath) void loadRooms(selectedPath);
  }, [selectedPath]);

  useEffect(() => {
    if (focusRoomId) setSelectedRoomId(focusRoomId);
  }, [focusRoomId]);

  useEffect(() => {
    if (!selectedPath || !selectedRoomId || !window.metroforge?.getRoomCollision) {
      setCollision(null);
      return;
    }
    let cancelled = false;
    void window.metroforge.getRoomCollision(selectedPath, selectedRoomId).then((data) => {
      if (!cancelled) setCollision(data?.error ? { ...data, rects: [] } : data);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPath, selectedRoomId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((room) => {
      const hay = [
        room.id,
        room.archetype,
        room.worldArchetype,
        room.biomeId,
        ...(room.enemies ?? []),
        ...(room.npcs ?? []),
        ...(room.collectibles ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rooms, query]);

  const selected = rooms.find((r) => r.id === selectedRoomId) ?? filtered[0];

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
      <ScreenHeader
        eyebrow="World"
        title="Room Editor"
        description="Palette, canvas, and inspector around listRooms / updateRoom / regenerateRoom. Occupancy uses painted tileCells from the room record."
        actions={
          <>
            <ProjectSelect />
            <EditStatusBadge projectPath={selectedPath} />
          </>
        }
      />
      <NoProjectHint />

      {hasActiveProject && (
        <>
      <CommandBar
        projectPath={selectedPath}
        selectedRoomId={selectedRoomId}
        onSuccess={() => loadRooms(selectedPath)}
      />

      <div className="editor-workspace">
        <div className="panel">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter rooms, archetypes, entities…"
            aria-label="Filter rooms"
          />
          <p className="hint">
            {filtered.length} of {rooms.length} rooms
          </p>
          {filtered.length === 0 && (
            <div className="empty-state">
              <p>
                {rooms.length === 0
                  ? 'No rooms in this project yet.'
                  : 'No rooms match this filter.'}
              </p>
              {rooms.length > 0 && (
                <button type="button" onClick={() => setQuery('')}>
                  Clear filter
                </button>
              )}
            </div>
          )}
          <VirtualizedRoomList
            items={filtered}
            selectedId={selected?.id}
            onSelect={(room) => {
              setSelectedRoomId(room.id);
              setFocusRoomId(room.id);
            }}
            renderItem={(room, active) => (
              <span className={active ? 'room-item active' : 'room-item'}>
                <strong>{room.id}</strong>
                <span>{room.worldArchetype ?? room.archetype ?? 'room'}</span>
              </span>
            )}
          />
        </div>

        <div className="panel editor-canvas">
          <div className="layer-bar" role="tablist" aria-label="Room layers">
            {(['visual', 'collision', 'entities', 'navigation', 'progression', 'debug'] as LayerId[]).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={layer === id}
                className={layer === id ? 'tab active' : 'tab'}
                onClick={() => setLayer(id)}
              >
                {id}
              </button>
            ))}
          </div>
          {selected && layer !== 'debug' && (
            <RoomCanvasPreview room={selected} layer={layer} collision={collision} />
          )}
          {selected && layer === 'collision' && (
            <p className="hint">
              {collision?.rects?.length
                ? `Authored collision: ${collision.rects.length} rects (${collision.widthTiles}×${collision.heightTiles} @ ${collision.tileSize}px).`
                : collision?.error
                  ? `${collision.error} Showing painted tileCells occupancy instead.`
                  : `Occupancy from ${selected.tileCells?.length ?? 0} painted tile cells.`}
            </p>
          )}
          {selected && layer === 'visual' && (
            <TilePaintEditor
              projectPath={selectedPath}
              roomId={selected.id}
              biomeId={selected.biomeId ?? 'biome_0'}
              width={selected.width ?? 800}
              height={selected.height ?? 600}
              initialCells={selected.tileCells ?? []}
              onSaved={() => loadRooms(selectedPath)}
            />
          )}
          {selected && layer === 'debug' && (
            <pre className="panel" style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
              {JSON.stringify(selected, null, 2)}
            </pre>
          )}
        </div>

        {selected && (
          <aside className="room-detail panel">
            <h3>{selected.id}</h3>
            <dl className="settings-dl">
              <dt>Archetype</dt>
              <dd>
                {selected.archetype ?? '—'}
                {selected.worldArchetype && selected.worldArchetype !== selected.archetype
                  ? ` · world ${selected.worldArchetype}`
                  : ''}
              </dd>
              <dt>Biome</dt>
              <dd>{selected.biomeId ?? '—'}</dd>
              <dt>Size</dt>
              <dd>
                {selected.width ?? 800}×{selected.height ?? 600}
              </dd>
              <dt>Enemies</dt>
              <dd>{(selected.enemies ?? []).join(', ') || 'none'}</dd>
              <dt>NPCs</dt>
              <dd>{(selected.npcs ?? []).join(', ') || 'none'}</dd>
              <dt>Collectibles</dt>
              <dd>{(selected.collectibles ?? []).join(', ') || 'none'}</dd>
              <dt>Connections</dt>
              <dd>
                {(selected.connections ?? [])
                  .map((c) => `${c.direction}→${c.targetRoomId}`)
                  .join(', ') || 'none'}
              </dd>
              <dt>Painted cells</dt>
              <dd>{selected.tileCells?.length ?? 0}</dd>
            </dl>
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
            <div className="row" style={{ marginTop: '0.5rem' }}>
              <button type="button" onClick={() => navigate('World')}>
                World
              </button>
              <button type="button" onClick={() => navigate('Dungeon')}>
                Dungeon
              </button>
            </div>
          </aside>
        )}
      </div>

      {message && <p className="result success">{message}</p>}
      {error && <p className="result error">{error}</p>}
        </>
      )}
    </section>
  );
}

function RoomCanvasPreview({
  room,
  layer,
  collision,
}: {
  room: RoomRecord;
  layer: LayerId;
  collision?: RoomCollisionPreview | null;
}) {
  const w = room.width ?? 800;
  const h = room.height ?? 600;
  const scale = 0.35;
  const showTiles = layer === 'visual' || layer === 'collision';
  const showEntities = layer === 'visual' || layer === 'entities';
  const showNav = layer === 'visual' || layer === 'navigation' || layer === 'progression';
  const authoredRects = layer === 'collision' ? collision?.rects ?? [] : [];

  return (
    <div className="room-canvas-wrap panel">
      <svg className="room-canvas" width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`}>
        <rect className="room-floor" x={0} y={0} width={w} height={h} />
        <rect className="room-ground" x={0} y={h - 64} width={w} height={64} />
        {showTiles &&
          authoredRects.length === 0 &&
          (room.tileCells ?? []).map((cell, i) => (
            <rect
              key={`tile-${i}`}
              className={layer === 'collision' ? 'room-occupancy' : 'room-paint'}
              x={cell.x * TILE}
              y={cell.y * TILE}
              width={TILE}
              height={TILE}
            />
          ))}
        {authoredRects.map((rect, i) => (
          <rect
            key={`col-${i}`}
            className="room-occupancy"
            x={rect.x}
            y={rect.y}
            width={Math.max(1, rect.w)}
            height={Math.max(1, rect.h)}
          />
        ))}
        {showNav &&
          (room.weakFloors ?? []).map((floor, i) => (
            <rect
              key={`weak-${i}`}
              className="room-weak-floor"
              x={floor.x}
              y={h - 64}
              width={Math.max(24, floor.width)}
              height={12}
            >
              <title>
                Weak floor → {floor.targetRoomId}
              </title>
            </rect>
          ))}
        {showEntities && <circle className="room-player" cx={100} cy={h - 114} r={12} />}
        {showEntities &&
          (room.enemies ?? []).map((enemy, i) => (
            <g key={`e-${enemy}-${i}`}>
              <rect className="room-enemy" x={w - 150 - i * 40} y={h - 94} width={24} height={24} />
              <title>{enemy}</title>
            </g>
          ))}
        {showEntities &&
          (room.npcs ?? []).map((npc, i) => (
            <g key={`n-${npc}-${i}`}>
              <circle className="room-npc" cx={160 + i * 36} cy={h - 120} r={10} />
              <title>{npc}</title>
            </g>
          ))}
        {showEntities &&
          (room.collectibles ?? []).map((item, i) => (
            <g key={`c-${item}-${i}`}>
              <rect className="room-collectible" x={220 + i * 28} y={h - 160} width={14} height={14} />
              <title>{item}</title>
            </g>
          ))}
        {showNav &&
          (room.connections ?? []).map((c, i) => {
            let x = w / 2;
            let y = h - 80;
            if (c.direction === 'left') x = 12;
            if (c.direction === 'right') x = w - 24;
            if (c.direction === 'up') y = 24;
            const locked = (c.requirements?.length ?? 0) > 0;
            return (
              <g key={`door-${i}`}>
                <rect
                  className={locked ? 'room-door-locked' : 'room-door'}
                  x={x}
                  y={y}
                  width={24}
                  height={24}
                />
                <title>
                  {c.direction} → {c.targetRoomId}
                  {locked ? ` (${c.requirements!.join(', ')})` : ''}
                </title>
              </g>
            );
          })}
      </svg>
      <p className="hint">
        {layer === 'collision'
          ? authoredRects.length > 0
            ? 'Collision layer from getRoomCollision.'
            : 'Occupancy overlay from painted cells — authored collision unavailable for this room.'
          : layer === 'entities'
            ? 'Entity markers are count layout from the room record (no authored x/y yet).'
            : 'Visual preview from room data. Weak floors use authored x/width when present.'}
      </p>
    </div>
  );
}
