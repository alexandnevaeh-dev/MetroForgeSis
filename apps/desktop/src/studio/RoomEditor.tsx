import { useEffect, useMemo, useState } from 'react';
import { CommandBar } from './CommandBar.js';
import { EditStatusBadge } from './EditStatusBadge.js';
import { TilePaintEditor, TilePalettePanel, type TileCoord } from './TilePaintEditor.js';
import { VirtualizedRoomList } from './VirtualizedRoomList.js';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import type { RoomCollisionPreview } from './metroforge-api.js';
import { Badge, Button, Input, Panel } from './ui/index.js';

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

const LAYERS: Array<{ id: LayerId; label: string }> = [
  { id: 'visual', label: 'Visual' },
  { id: 'collision', label: 'Collision' },
  { id: 'entities', label: 'Entities' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'progression', label: 'Progression' },
  { id: 'debug', label: 'Debug' },
];

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
  const [zoom, setZoom] = useState(100);
  const [selectedTile, setSelectedTile] = useState<TileCoord>({ col: 0, row: 2 });

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

  const widthTiles = selected ? Math.round((selected.width ?? 800) / TILE) : 0;
  const heightTiles = selected ? Math.round((selected.height ?? 600) / TILE) : 0;

  return (
    <section className="room-editor-screen">
      <ScreenHeader
        eyebrow="World"
        title="Room Editor"
        description="Layers, tools, and palette left — canvas center — inspector with mini preview."
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
            <aside className="editor-left-rail">
              <Panel level={1} title="Layers">
                <ul className="layer-list">
                  {LAYERS.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={layer === item.id ? 'layer-list-item active' : 'layer-list-item'}
                        onClick={() => setLayer(item.id)}
                        aria-pressed={layer === item.id}
                      >
                        <span>{item.label}</span>
                        <span className="layer-vis" aria-hidden="true">
                          {layer === item.id ? '●' : '○'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel level={1} title="Tools">
                <div className="editor-tools-grid" role="toolbar" aria-label="Room layer tools">
                  {LAYERS.map((item) => (
                    <button
                      key={`tool-${item.id}`}
                      type="button"
                      className={layer === item.id ? 'editor-tool-btn active' : 'editor-tool-btn'}
                      onClick={() => setLayer(item.id)}
                      title={item.label}
                    >
                      {item.label.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </Panel>

              {selected && (
                <TilePalettePanel
                  projectPath={selectedPath}
                  biomeId={selected.biomeId ?? 'biome_0'}
                  selectedTile={selectedTile}
                  onSelect={setSelectedTile}
                  interactive={layer === 'visual'}
                />
              )}

              <Panel level={1} title="Rooms" fill>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter rooms…"
                  aria-label="Filter rooms"
                />
                <p className="hint">
                  {filtered.length} of {rooms.length}
                </p>
                {filtered.length === 0 && (
                  <div className="empty-state">
                    <p>
                      {rooms.length === 0
                        ? 'No rooms in this project yet.'
                        : 'No rooms match this filter.'}
                    </p>
                    {rooms.length > 0 && (
                      <Button size="sm" onClick={() => setQuery('')}>
                        Clear filter
                      </Button>
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
              </Panel>
            </aside>

            <div className="panel editor-canvas editor-canvas-fill">
              <div className="editor-toolbar">
                <span className="hint mono">{selected?.id ?? 'No room'}</span>
                <span className="status-grow" />
                <Button size="sm" onClick={() => setZoom((z) => Math.max(50, z - 25))} aria-label="Zoom out">
                  −
                </Button>
                <span className="mono hint">{zoom}%</span>
                <Button size="sm" onClick={() => setZoom((z) => Math.min(200, z + 25))} aria-label="Zoom in">
                  +
                </Button>
                <Button size="sm" onClick={() => setZoom(100)}>
                  Reset
                </Button>
              </div>

              {selected && layer !== 'debug' && (
                <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}>
                  <RoomCanvasPreview room={selected} layer={layer} collision={collision} fill />
                </div>
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
                  selectedTile={selectedTile}
                  onSaved={() => loadRooms(selectedPath)}
                />
              )}
              {selected && layer === 'debug' && (
                <pre className="panel" style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                  {JSON.stringify(selected, null, 2)}
                </pre>
              )}

              <div className="row" style={{ marginTop: 'auto', justifyContent: 'flex-end', gap: '0.4rem' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    setError(null);
                    if (!selectedPath) return;
                    const r = await window.metroforge!.playInGodot!(selectedPath);
                    if (!r.success) setError(r.message);
                  }}
                >
                  Play Preview
                </Button>
              </div>
            </div>

            {selected && (
              <aside className="room-detail panel editor-inspector">
                <div className="room-mini-preview" aria-label="Room mini preview">
                  <RoomCanvasPreview room={selected} layer="visual" collision={collision} mini />
                </div>
                <h3 style={{ textTransform: 'none', letterSpacing: 0 }}>{selected.id}</h3>
                <dl className="settings-dl">
                  <dt>Name</dt>
                  <dd>{selected.id}</dd>
                  <dt>ID</dt>
                  <dd className="mono">{selected.id}</dd>
                  <dt>Archetype</dt>
                  <dd>
                    {selected.archetype ?? '—'}
                    {selected.worldArchetype && selected.worldArchetype !== selected.archetype
                      ? ` · world ${selected.worldArchetype}`
                      : ''}
                  </dd>
                  <dt>Width (tiles)</dt>
                  <dd>{widthTiles}</dd>
                  <dt>Height (tiles)</dt>
                  <dd>{heightTiles}</dd>
                  <dt>Biome / Theme</dt>
                  <dd>{selected.biomeId ?? '—'}</dd>
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
                <div className="row" style={{ marginTop: '0.45rem' }}>
                  {(selected.enemies ?? []).slice(0, 3).map((tag) => (
                    <Badge key={tag} tone="muted">
                      {tag}
                    </Badge>
                  ))}
                  {(selected.biomeId ? [selected.biomeId] : []).map((tag) => (
                    <Badge key={tag} tone="info">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="row" style={{ marginTop: '0.55rem' }}>
                  <Button
                    size="sm"
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
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      runRoomAction(() =>
                        window.metroforge!.regenerateRoom!(selectedPath, selected.id, 'encounter'),
                      )
                    }
                  >
                    Regenerate Encounter
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      runRoomAction(() =>
                        window.metroforge!.regenerateRoom!(selectedPath, selected.id, 'full'),
                      )
                    }
                  >
                    Regenerate Room
                  </Button>
                </div>
                <div className="row" style={{ marginTop: '0.45rem' }}>
                  <Button variant="primary" size="sm" onClick={() => navigate('World')}>
                    Open in World Editor
                  </Button>
                  <Button size="sm" onClick={() => navigate('Dungeon')}>
                    Dungeon
                  </Button>
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
  mini = false,
  fill = false,
}: {
  room: RoomRecord;
  layer: LayerId;
  collision?: RoomCollisionPreview | null;
  mini?: boolean;
  fill?: boolean;
}) {
  const w = room.width ?? 800;
  const h = room.height ?? 600;
  const scale = mini ? 0.18 : fill ? 0.55 : 0.35;
  const showTiles = layer === 'visual' || layer === 'collision';
  const showEntities = layer === 'visual' || layer === 'entities';
  const showNav = layer === 'visual' || layer === 'navigation' || layer === 'progression';
  const authoredRects = layer === 'collision' ? collision?.rects ?? [] : [];

  return (
    <div className={`room-canvas-wrap${fill ? ' room-canvas-fill' : ''}`}>
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
              <title>Weak floor → {floor.targetRoomId}</title>
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
      {!mini && (
        <p className="hint">
          {layer === 'collision'
            ? authoredRects.length > 0
              ? 'Collision layer from getRoomCollision.'
              : 'Occupancy overlay from painted cells — authored collision unavailable for this room.'
            : layer === 'entities'
              ? 'Entity markers are count layout from the room record (no authored x/y yet).'
              : 'Visual preview from room data. Weak floors use authored x/width when present.'}
        </p>
      )}
    </div>
  );
}
