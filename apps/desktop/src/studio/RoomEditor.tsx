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
import {
  Badge,
  Button,
  EditorToolButton,
  EditorToolbar,
  EditorViewport,
  EditorWorkbench,
  EditorZoomControls,
  EmptyViewport,
  InspectorSection,
  Panel,
  SearchField,
  ViewModeTabs,
} from './ui/index.js';

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

/** View-mode tabs (Concept A Room Editor reference). */
type ViewModeId = 'visual' | 'collision' | 'entities' | 'navigation' | 'progression' | 'debug';

const VIEW_MODES: Array<{ id: ViewModeId; label: string }> = [
  { id: 'visual', label: 'Visual' },
  { id: 'collision', label: 'Collision' },
  { id: 'entities', label: 'Entities' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'progression', label: 'Progression' },
  { id: 'debug', label: 'Debug' },
];

/** Overlay channels derived from real room IPC — not inventing Ground/Props/Lights. */
const OVERLAY_LAYERS: Array<{ id: ViewModeId; label: string }> = [
  { id: 'visual', label: 'Tiles' },
  { id: 'collision', label: 'Collision' },
  { id: 'entities', label: 'Entities' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'progression', label: 'Progression' },
  { id: 'debug', label: 'Debug' },
];

type PaintTool = 'select' | 'paint' | 'erase';

const TILE = 16;

function roomHasGeometry(room: RoomRecord, collision: RoomCollisionPreview | null): boolean {
  return (
    (room.tileCells?.length ?? 0) > 0 ||
    (collision?.rects?.length ?? 0) > 0 ||
    (room.weakFloors?.length ?? 0) > 0 ||
    (room.connections?.length ?? 0) > 0
  );
}

export function RoomEditor() {
  const { selectedPath, hasActiveProject, focusRoomId, setFocusRoomId, navigate } = useStudio();
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewModeId>('visual');
  const [collision, setCollision] = useState<RoomCollisionPreview | null>(null);
  const [zoom, setZoom] = useState(100);
  const [selectedTile, setSelectedTile] = useState<TileCoord>({ col: 0, row: 2 });
  const [paintTool, setPaintTool] = useState<PaintTool>('paint');
  const [gridSnap, setGridSnap] = useState(true);

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
  const hasGeometry = selected ? roomHasGeometry(selected, collision) : false;

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
  const tileSize = collision?.tileSize ?? TILE;

  return (
    <section className="workspace-screen room-editor-screen">
      <ScreenHeader
        compact
        eyebrow="World"
        title="Room Editor"
        description="View modes · layers/tools · canvas · inspector. Authored geometry only."
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
            compact
            projectPath={selectedPath}
            selectedRoomId={selectedRoomId}
            onSuccess={() => loadRooms(selectedPath)}
          />

          <ViewModeTabs
            label="Room view mode"
            items={VIEW_MODES.map((item) => ({ id: item.id, label: item.label }))}
            value={viewMode}
            onChange={(id) => setViewMode(id as ViewModeId)}
          />

          <EditorWorkbench className="room-editor-workspace">
            <aside className="editor-left-rail">
              <Panel level={1} title="Hierarchy">
                <SearchField
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter rooms…"
                  aria-label="Filter rooms"
                />
                <p className="hint type-caption">
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
                    <span className={active ? 'room-item active room-item-compact' : 'room-item room-item-compact'}>
                      <strong>{room.id}</strong>
                      <span>{room.worldArchetype ?? room.archetype ?? 'room'}</span>
                    </span>
                  )}
                />
              </Panel>

              <Panel level={1} title="Layers">
                <ul className="layer-list">
                  {OVERLAY_LAYERS.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={viewMode === item.id ? 'layer-list-item active' : 'layer-list-item'}
                        onClick={() => setViewMode(item.id)}
                        aria-pressed={viewMode === item.id}
                      >
                        <span>{item.label}</span>
                        <span className="layer-vis" aria-hidden="true">
                          {viewMode === item.id ? '●' : '○'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel level={1} title="Tools">
                <div className="editor-tools-grid" role="toolbar" aria-label="Room paint tools">
                  {(
                    [
                      { id: 'select' as const, label: 'Select', hint: 'Select' },
                      { id: 'paint' as const, label: 'Paint', hint: 'Paint tiles (Visual)' },
                      { id: 'erase' as const, label: 'Erase', hint: 'Erase (Visual)' },
                    ] as const
                  ).map((tool) => (
                    <EditorToolButton
                      key={tool.id}
                      active={paintTool === tool.id}
                      onClick={() => {
                        setPaintTool(tool.id);
                        if (tool.id !== 'select') setViewMode('visual');
                      }}
                      title={tool.hint}
                      disabled={tool.id !== 'select' && viewMode !== 'visual' && paintTool !== tool.id}
                    >
                      {tool.label}
                    </EditorToolButton>
                  ))}
                </div>
                <p className="hint type-caption" style={{ marginTop: '0.35rem' }}>
                  Paint/Erase apply on Visual via TilePaintEditor → tileCells → rooms.json → Godot.
                </p>
              </Panel>

              {selected && (
                <div className="tile-palette-dock-slot">
                  <TilePalettePanel
                    projectPath={selectedPath}
                    biomeId={selected.biomeId ?? 'biome_0'}
                    selectedTile={selectedTile}
                    onSelect={setSelectedTile}
                    interactive={viewMode === 'visual' && paintTool !== 'select'}
                  />
                </div>
              )}
            </aside>

            <EditorViewport
              className="room-editor-canvas"
              toolbar={
                <EditorToolbar>
                  <span className="hint mono">{selected?.id ?? 'No room selected'}</span>
                  <Badge tone="muted">{viewMode}</Badge>
                  <span className="status-grow" />
                  <Button
                    size="sm"
                    aria-pressed={gridSnap}
                    onClick={() => setGridSnap((v) => !v)}
                    title="Grid snap preference (paint uses tile grid)"
                  >
                    Snap {gridSnap ? 'On' : 'Off'}
                  </Button>
                  <EditorZoomControls zoom={zoom} onZoomChange={setZoom} onFit={() => setZoom(100)} />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!selectedPath}
                    onClick={async () => {
                      setError(null);
                      if (!selectedPath) return;
                      const r = await window.metroforge!.playInGodot!(selectedPath);
                      if (!r.success) setError(r.message);
                    }}
                  >
                    Play Preview
                  </Button>
                </EditorToolbar>
              }
              footer={
                selected ? (
                  <div className="room-canvas-status" role="status">
                    <span>Grid: {tileSize}px</span>
                    <span>Snap {gridSnap ? 'On' : 'Off'}</span>
                    <span>
                      Size: {widthTiles} × {heightTiles} tiles
                    </span>
                    <span>Cells: {selected.tileCells?.length ?? 0}</span>
                    <span>
                      Collision: {collision?.rects?.length ?? 0}
                      {collision?.error ? ' (fallback)' : ''}
                    </span>
                    <span className="status-grow" />
                    <span className="mono">{selected.id}</span>
                  </div>
                ) : null
              }
            >
              {!selected ? (
                <EmptyViewport
                  title={rooms.length === 0 ? 'No rooms in this project' : 'Select a room'}
                  description={
                    rooms.length === 0
                      ? 'listRooms returned no room records. Generate or open a project that has authored rooms.'
                      : 'Choose a room from the left list to inspect metadata and paint tiles when geometry exists.'
                  }
                  meta={
                    <dl className="settings-dl empty-viewport-dl">
                      <dt>Project rooms</dt>
                      <dd>{rooms.length}</dd>
                      <dt>Active filter</dt>
                      <dd>{query.trim() ? `"${query.trim()}" → ${filtered.length}` : 'none'}</dd>
                      <dt>View mode</dt>
                      <dd>{viewMode}</dd>
                    </dl>
                  }
                  actions={
                    <>
                      <Button variant="primary" size="sm" onClick={() => navigate('Studio')}>
                        Generation Studio
                      </Button>
                      <Button size="sm" onClick={() => navigate('World')}>
                        World Editor
                      </Button>
                      <Button size="sm" onClick={() => navigate('Create')}>
                        New Game
                      </Button>
                      {rooms.length > 0 && query && (
                        <Button size="sm" onClick={() => setQuery('')}>
                          Clear filter
                        </Button>
                      )}
                    </>
                  }
                />
              ) : viewMode === 'debug' ? (
                <pre className="panel room-debug-json mono" role="region" aria-label="Room debug JSON">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              ) : viewMode === 'visual' ? (
                <>
                  {!hasGeometry && (
                    <EmptyViewport
                      title="No authored geometry yet"
                      description="This room has no tileCells, collision rects, weak floors, or connections. Paint tiles below or regenerate the room — the canvas will not invent tiles or enemies."
                      meta={
                        <dl className="settings-dl empty-viewport-dl">
                          <dt>Room</dt>
                          <dd className="mono">{selected.id}</dd>
                          <dt>Archetype</dt>
                          <dd>{selected.archetype ?? '—'}</dd>
                          <dt>Size</dt>
                          <dd>
                            {widthTiles} × {heightTiles} @ {tileSize}px
                          </dd>
                          <dt>Biome</dt>
                          <dd>{selected.biomeId ?? '—'}</dd>
                        </dl>
                      }
                      actions={
                        <>
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
                          <Button size="sm" onClick={() => navigate('Studio')}>
                            Generation Studio
                          </Button>
                        </>
                      }
                    />
                  )}
                  {hasGeometry && (
                    <div
                      className="room-canvas-zoom"
                      style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
                    >
                      <RoomCanvasPreview room={selected} layer={viewMode} collision={collision} fill />
                    </div>
                  )}
                  <TilePaintEditor
                    projectPath={selectedPath}
                    roomId={selected.id}
                    biomeId={selected.biomeId ?? 'biome_0'}
                    width={selected.width ?? 800}
                    height={selected.height ?? 600}
                    initialCells={selected.tileCells ?? []}
                    selectedTile={selectedTile}
                    tool={paintTool === 'erase' ? 'erase' : 'paint'}
                    onSaved={() => loadRooms(selectedPath)}
                  />
                </>
              ) : !hasGeometry && viewMode !== 'entities' ? (
                <EmptyViewport
                  title={`No ${viewMode} geometry`}
                  description="Authored overlay data is empty for this room. Entity counts still appear in the inspector when present on the room record."
                  meta={
                    <dl className="settings-dl empty-viewport-dl">
                      <dt>Room</dt>
                      <dd className="mono">{selected.id}</dd>
                      <dt>Tile cells</dt>
                      <dd>{selected.tileCells?.length ?? 0}</dd>
                      <dt>Collision rects</dt>
                      <dd>{collision?.rects?.length ?? 0}</dd>
                    </dl>
                  }
                />
              ) : (
                <>
                  <div
                    className="room-canvas-zoom"
                    style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
                  >
                    <RoomCanvasPreview room={selected} layer={viewMode} collision={collision} fill />
                  </div>
                  {viewMode === 'collision' && (
                    <p className="hint">
                      {collision?.rects?.length
                        ? `Authored collision: ${collision.rects.length} rects (${collision.widthTiles}×${collision.heightTiles} @ ${collision.tileSize}px).`
                        : collision?.error
                          ? `${collision.error} Showing painted tileCells occupancy instead.`
                          : `Occupancy from ${selected.tileCells?.length ?? 0} painted tile cells.`}
                    </p>
                  )}
                  {viewMode === 'entities' && (
                    <p className="hint">
                      Entity lists come from the room record. Positions are not authored — canvas shows counts
                      only, not invented spawn markers.
                    </p>
                  )}
                </>
              )}
            </EditorViewport>

            <aside className="room-detail panel editor-inspector">
              {selected ? (
                <>
                  <InspectorSection title="Preview">
                    {hasGeometry ? (
                      <div className="room-mini-preview" aria-label="Room mini preview">
                        <RoomCanvasPreview room={selected} layer="visual" collision={collision} mini />
                      </div>
                    ) : (
                      <p className="hint">No geometry thumbnail — room has no authored tiles/collision yet.</p>
                    )}
                  </InspectorSection>
                  <InspectorSection title="Room">
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
                      <dt>Dimensions</dt>
                      <dd>
                        {widthTiles} × {heightTiles} tiles · {selected.width ?? 800}×{selected.height ?? 600}px
                      </dd>
                      <dt>Biome</dt>
                      <dd>{selected.biomeId ?? '—'}</dd>
                    </dl>
                    <div className="row" style={{ marginTop: '0.45rem', flexWrap: 'wrap', gap: '0.25rem' }}>
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
                  </InspectorSection>
                  <InspectorSection title="Contents">
                    <ul className="stat-list">
                      <li>Enemies ({(selected.enemies ?? []).length})</li>
                      <li>NPCs ({(selected.npcs ?? []).length})</li>
                      <li>Collectibles ({(selected.collectibles ?? []).length})</li>
                      <li>Painted cells ({selected.tileCells?.length ?? 0})</li>
                      <li>Weak floors ({selected.weakFloors?.length ?? 0})</li>
                      <li>Connections ({selected.connections?.length ?? 0})</li>
                    </ul>
                    {(selected.enemies?.length || selected.npcs?.length || selected.collectibles?.length) ? (
                      <dl className="settings-dl" style={{ marginTop: '0.4rem' }}>
                        {(selected.enemies ?? []).length > 0 && (
                          <>
                            <dt>Enemy ids</dt>
                            <dd>{selected.enemies!.join(', ')}</dd>
                          </>
                        )}
                        {(selected.npcs ?? []).length > 0 && (
                          <>
                            <dt>NPC ids</dt>
                            <dd>{selected.npcs!.join(', ')}</dd>
                          </>
                        )}
                        {(selected.collectibles ?? []).length > 0 && (
                          <>
                            <dt>Collectible ids</dt>
                            <dd>{selected.collectibles!.join(', ')}</dd>
                          </>
                        )}
                      </dl>
                    ) : null}
                  </InspectorSection>
                  <InspectorSection title="Connections">
                    {(selected.connections ?? []).length === 0 ? (
                      <p className="hint">No connections on this room record.</p>
                    ) : (
                      <ul className="stat-list">
                        {(selected.connections ?? []).map((c, i) => (
                          <li key={`${c.direction}-${c.targetRoomId}-${i}`}>
                            <button
                              type="button"
                              className="status-link"
                              onClick={() => {
                                setSelectedRoomId(c.targetRoomId);
                                setFocusRoomId(c.targetRoomId);
                              }}
                            >
                              {c.direction} → {c.targetRoomId}
                            </button>
                            {(c.requirements?.length ?? 0) > 0 ? (
                              <span className="hint"> · {c.requirements!.join(', ')}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </InspectorSection>
                  <InspectorSection title="Actions">
                    <div className="row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
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
                      <Button variant="primary" size="sm" onClick={() => navigate('World')}>
                        World Editor
                      </Button>
                      <Button size="sm" onClick={() => navigate('Dungeon')}>
                        Dungeon
                      </Button>
                    </div>
                  </InspectorSection>
                </>
              ) : (
                <EmptyViewport
                  className="inspector-empty"
                  title="Inspector"
                  description="Room properties appear when a room is selected from listRooms."
                  meta={
                    <dl className="settings-dl empty-viewport-dl">
                      <dt>Rooms loaded</dt>
                      <dd>{rooms.length}</dd>
                    </dl>
                  }
                />
              )}
            </aside>
          </EditorWorkbench>

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
  layer: ViewModeId;
  collision?: RoomCollisionPreview | null;
  mini?: boolean;
  fill?: boolean;
}) {
  const w = room.width ?? 800;
  const h = room.height ?? 600;
  const scale = mini ? 0.18 : fill ? 0.55 : 0.35;
  const showTiles = layer === 'visual' || layer === 'collision';
  const showNav = layer === 'visual' || layer === 'navigation' || layer === 'progression';
  const authoredRects = layer === 'collision' ? collision?.rects ?? [] : [];
  const tileCells = room.tileCells ?? [];
  const hasPaint = tileCells.length > 0 || authoredRects.length > 0;

  if (layer === 'entities') {
    return (
      <div className={`room-canvas-wrap${fill ? ' room-canvas-fill' : ''} room-entities-summary`}>
        <ul className="stat-list">
          <li>Enemies: {(room.enemies ?? []).length || 'none'}</li>
          <li>NPCs: {(room.npcs ?? []).length || 'none'}</li>
          <li>Collectibles: {(room.collectibles ?? []).length || 'none'}</li>
        </ul>
        <p className="hint">No authored entity coordinates — listing ids only (no fake spawn markers).</p>
        {(room.enemies ?? []).length > 0 && <p className="mono hint">{room.enemies!.join(', ')}</p>}
        {(room.npcs ?? []).length > 0 && <p className="mono hint">{room.npcs!.join(', ')}</p>}
        {(room.collectibles ?? []).length > 0 && (
          <p className="mono hint">{room.collectibles!.join(', ')}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`room-canvas-wrap${fill ? ' room-canvas-fill' : ''} room-canvas-pixelated`}>
      <svg
        className="room-canvas"
        width={w * scale}
        height={h * scale}
        viewBox={`0 0 ${w} ${h}`}
        style={{ imageRendering: 'pixelated' }}
      >
        <rect className="room-floor" x={0} y={0} width={w} height={h} />
        {hasPaint && (
          <defs>
            <pattern id={`room-grid-${room.id}`} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
              <path d={`M ${TILE} 0 L 0 0 0 ${TILE}`} fill="none" stroke="rgba(128,140,160,0.25)" strokeWidth="0.5" />
            </pattern>
          </defs>
        )}
        {hasPaint && <rect x={0} y={0} width={w} height={h} fill={`url(#room-grid-${room.id})`} />}
        {showTiles &&
          authoredRects.length === 0 &&
          tileCells.map((cell, i) => (
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
            : 'Visual preview from authored tileCells / connections only — no invented player or enemy sprites.'}
        </p>
      )}
    </div>
  );
}
