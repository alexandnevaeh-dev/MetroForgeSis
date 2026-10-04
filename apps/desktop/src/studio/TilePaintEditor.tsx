import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Badge, Button, EmptyState, Panel } from './ui/index.js';

import { tileDrafts, tileDraftKey, type TileCell, type TileDraft } from './tile-drafts.js';
import type { CastleBackgroundPreview } from './BiomeBackgroundEditor.js';
export type { TileCell } from './tile-drafts.js';

export type TileCoord = { col: number; row: number };

interface TilePalettePanelProps {
  projectPath: string;
  biomeId: string;
  tileSize?: number;
  selectedTile: TileCoord;
  onSelect: (tile: TileCoord) => void;
  /** When false, tiles remain visible but selection is disabled (non-visual layers). */
  interactive?: boolean;
}

function useTilesetArtwork(projectPath: string, biomeId: string) {
  const [artwork, setArtwork] = useState<{ url: string; width: number; height: number } | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setArtwork(null);
    setLoaded(false);
    async function load() {
      try {
        const preview = await window.metroforge?.getTilesetPreview?.(projectPath, biomeId);
        if (!preview?.dataUrl || cancelled) return;
        const image = new Image();
        image.src = preview.dataUrl;
        await image.decode();
        if (!cancelled && image.naturalWidth > 0 && image.naturalHeight > 0) {
          setArtwork({
            url: preview.dataUrl,
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        }
      } catch {
        /* Missing/failed artwork remains visibly unavailable. */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectPath, biomeId]);
  return { artwork, loaded };
}

export function TilePalettePanel({
  projectPath,
  biomeId,
  tileSize = 16,
  selectedTile,
  onSelect,
  interactive = true,
}: TilePalettePanelProps) {
  const { artwork, loaded } = useTilesetArtwork(projectPath, biomeId);
  const paletteCols = Math.floor((artwork?.width ?? 0) / tileSize);
  const paletteRows = Math.floor((artwork?.height ?? 0) / tileSize);

  return (
    <Panel
      level={1}
      className="tile-palette-dock"
      title="Tile Palette"
      actions={<Badge tone="muted">{biomeId}</Badge>}
    >
      {!loaded ? (
        <p className="hint">Loading tileset…</p>
      ) : !artwork ? (
        <EmptyState
          title="No tiles"
          description={`No tileset atlas for ${biomeId}. Generate or import a tileset to paint.`}
        />
      ) : (
        <>
          {!interactive && (
            <p className="hint">Switch to Visual layer to paint with the selected tile.</p>
          )}
          <div
            className={interactive ? 'tile-palette' : 'tile-palette tile-palette-disabled'}
            aria-disabled={!interactive}
            style={{ gridTemplateColumns: `repeat(${paletteCols}, ${tileSize}px)` }}
          >
            {Array.from({ length: paletteCols * paletteRows }).map((_, i) => {
              const col = i % paletteCols;
              const row = Math.floor(i / paletteCols);
              const active = selectedTile.col === col && selectedTile.row === row;
              return (
                <button
                  key={i}
                  type="button"
                  className={active ? 'palette-tile active' : 'palette-tile'}
                  disabled={!interactive}
                  style={{
                    width: tileSize,
                    height: tileSize,
                    backgroundImage: `url(${artwork.url})`,
                    backgroundPosition: `-${col * tileSize}px -${row * tileSize}px`,
                    backgroundSize: `${artwork.width}px ${artwork.height}px`,
                    imageRendering: 'pixelated',
                  }}
                  onClick={() => onSelect({ col, row })}
                  aria-label={`Tile ${col},${row}`}
                />
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}

export type TilePaintTool = 'select' | 'paint' | 'erase';

interface TilePaintEditorProps {
  projectPath: string;
  roomId: string;
  biomeId: string;
  width: number;
  height: number;
  tileSize?: number;
  initialCells?: TileCell[];
  selectedTile: TileCoord;
  tool?: TilePaintTool;
  background?: CastleBackgroundPreview | null;
  collisionRects?: Array<{ x: number; y: number; w: number; h: number }>;
  zoom?: number;
  fit?: boolean;
  onSaved?: () => void | Promise<void>;
}

const EMPTY_CELLS: TileCell[] = [];
const EMPTY_RECTS: NonNullable<TilePaintEditorProps['collisionRects']> = [];

export function TilePaintEditor({
  projectPath,
  roomId,
  biomeId,
  width,
  height,
  tileSize = 16,
  initialCells = EMPTY_CELLS,
  selectedTile,
  tool = 'select',
  background,
  collisionRects = EMPTY_RECTS,
  zoom = 100,
  fit = true,
  onSaved,
}: TilePaintEditorProps) {
  const { artwork, loaded } = useTilesetArtwork(projectPath, biomeId);
  const atlasId = useId();
  const gridId = useId();
  const instructionsId = useId();
  const actionButton = useRef<HTMLDivElement>(null);
  const [focusedCell, setFocusedCell] = useState({ x: 0, y: 0 });
  const key = tileDraftKey(projectPath, roomId);
  const initial = useMemo<TileDraft>(
    () => ({
      cells: initialCells,
      base: initialCells,
      dirty: false,
      busy: false,
      conflict: false,
      message: null,
    }),
    [key, initialCells],
  );
  const draft = useSyncExternalStore(tileDrafts.subscribe, () => tileDrafts.get(key) ?? initial);
  useEffect(() => {
    tileDrafts.load(key, initialCells);
  }, [key, initialCells]);
  useEffect(() => {
    // A failed pending save may have skipped a newer saved snapshot. Reconcile
    // retained drafts after the lock clears; a successful save already owns its
    // acknowledged cells and must not be reset by React's prior render snapshot.
    if (!draft.busy && draft.dirty) tileDrafts.load(key, initialCells);
  }, [key, initialCells, draft.busy, draft.dirty]);
  const cols = Math.max(1, Math.floor(width / tileSize));
  const rows = Math.max(1, Math.floor(height / tileSize));
  useEffect(() => {
    setFocusedCell((cell) => ({
      x: Math.max(0, Math.min(cols - 1, cell.x)),
      y: Math.max(0, Math.min(rows - 1, cell.y)),
    }));
  }, [key, cols, rows]);

  const applyTool = (x: number, y: number) => {
    const current = tileDrafts.get(key);
    if (tool === 'select' || current.busy) return;
    if (tool === 'paint' && !artwork) return;
    const cells = current.cells.filter((cell) => cell.x !== x || cell.y !== y);
    if (tool === 'paint') cells.push({ x, y, ...selectedTile });
    tileDrafts.edit(key, cells);
  };
  const save = async () => {
    if (!window.metroforge?.updateRoom) return;
    const snapshot = tileDrafts.beginSave(key);
    if (!snapshot) return;
    try {
      const result = await window.metroforge.updateRoom(projectPath, {
        roomId,
        tileCells: snapshot.cells,
        tileCellsBase: snapshot.base,
      });
      if (result.error || result.success === false) {
        tileDrafts.finishSave(
          key,
          null,
          result.error ||
            result.errors?.join('; ') ||
            'Save failed. Your draft is retained; try again.',
        );
        return;
      }
      let message = 'Tilemap saved and room recompiled. Restart preview to apply.';
      try {
        await onSaved?.();
      } catch (error) {
        message = `Tiles saved, but preview refresh failed: ${error instanceof Error ? error.message : String(error)}`;
      }
      tileDrafts.finishSave(key, snapshot.cells, message);
    } catch (error) {
      tileDrafts.finishSave(
        key,
        null,
        `Could not save tiles. Draft retained: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const canApply = tool !== 'select' && !draft.busy && (tool === 'erase' || !!artwork);
  const cover = background ? Math.max(width / background.width, height / background.height) : 1;
  const scale = (0.55 * zoom) / 100;

  return (
    <div className="tile-paint room-tile-workspace" aria-busy={draft.busy}>
      <div className="room-tile-workspace-heading">
        <Badge tone={draft.dirty ? 'warning' : 'muted'}>
          {draft.dirty ? 'Unsaved tiles' : 'Saved tiles'}
        </Badge>
        <span className="hint">
          {tool === 'select'
            ? 'Select Paint or Erase to edit'
            : `${tool === 'erase' ? 'Erase' : 'Paint'} · tile ${selectedTile.col},${selectedTile.row}`}
        </span>
      </div>
      {tool !== 'select' && (
        <p className="hint" id={instructionsId}>
          Click a cell to edit. On the cell button, arrows move; Enter or Space applies the tool.
          Drafts stay here during navigation.
        </p>
      )}
      {!artwork && (
        <p className="hint" role="status">
          {loaded
            ? 'Tileset unavailable. Occupied cells are shown; painting is disabled.'
            : 'Loading tileset artwork…'}
        </p>
      )}
      <div className="room-canvas-wrap room-canvas-fill room-canvas-pixelated">
        <svg
          className="room-canvas room-tile-canvas"
          aria-label={`${roomId} saved geometry and ${draft.dirty ? 'draft' : 'saved'} tiles`}
          width={fit ? '100%' : width * scale}
          height={fit ? undefined : height * scale}
          viewBox={`0 0 ${width} ${height}`}
          style={fit ? { aspectRatio: width / height, display: 'block' } : undefined}
          onPointerDown={(event) => {
            if (!canApply || event.button !== 0) return;
            const matrix = event.currentTarget.getScreenCTM();
            if (!matrix) return;
            const point = event.currentTarget.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            const local = point.matrixTransform(matrix.inverse());
            const x = Math.max(0, Math.min(cols - 1, Math.floor(local.x / tileSize)));
            const y = Math.max(0, Math.min(rows - 1, Math.floor(local.y / tileSize)));
            setFocusedCell({ x, y });
            applyTool(x, y);
            actionButton.current
              ?.querySelector<HTMLButtonElement>('[data-cell-action]')
              ?.focus({ preventScroll: true });
          }}
        >
          <defs>
            {artwork && (
              <image
                id={atlasId}
                href={artwork.url}
                width={artwork.width}
                height={artwork.height}
              />
            )}
            <pattern id={gridId} width={tileSize} height={tileSize} patternUnits="userSpaceOnUse">
              <path
                d={`M ${tileSize} 0 L 0 0 0 ${tileSize}`}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect className="room-floor" width={width} height={height} />
          {background && (
            <image
              className="room-scene-background"
              aria-label="Saved castle background"
              href={background.dataUrl}
              x={(width - background.width * cover) * 0.5}
              y={(height - tileSize * 2 - background.height * cover) * background.anchorY}
              width={background.width * cover}
              height={background.height * cover}
              opacity={background.opacity}
            />
          )}
          {collisionRects.map((rect, i) => (
            <rect
              key={`geometry-${i}`}
              className="room-occupancy room-tile-geometry"
              x={rect.x}
              y={rect.y}
              width={rect.w}
              height={rect.h}
            />
          ))}
          {draft.cells.map((cell) => (
            <g key={`${cell.x},${cell.y}`} data-tile-cell={`${cell.x},${cell.y}`}>
              {artwork ? (
                <svg
                  x={cell.x * tileSize}
                  y={cell.y * tileSize}
                  width={tileSize}
                  height={tileSize}
                  viewBox={`${cell.col * tileSize} ${cell.row * tileSize} ${tileSize} ${tileSize}`}
                  overflow="hidden"
                >
                  <use href={`#${atlasId}`} />
                </svg>
              ) : (
                <rect
                  className="room-paint"
                  x={cell.x * tileSize}
                  y={cell.y * tileSize}
                  width={tileSize}
                  height={tileSize}
                />
              )}
            </g>
          ))}
          <rect pointerEvents="none" width={width} height={height} fill={`url(#${gridId})`} />
          {tool !== 'select' && (
            <rect
              className="room-tile-cursor"
              pointerEvents="none"
              x={focusedCell.x * tileSize + 1}
              y={focusedCell.y * tileSize + 1}
              width={tileSize - 2}
              height={tileSize - 2}
              fill="none"
            />
          )}
        </svg>
      </div>
      <div className="row room-tile-actions" ref={actionButton}>
        {tool !== 'select' && (
          <Button
            data-cell-action
            size="sm"
            disabled={!canApply}
            aria-describedby={instructionsId}
            onClick={() => applyTool(focusedCell.x, focusedCell.y)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) {
                if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
                return;
              }
              const directions: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              };
              const direction = directions[event.key];
              if (!direction) return;
              event.preventDefault();
              setFocusedCell((cell) => ({
                x: Math.max(0, Math.min(cols - 1, cell.x + direction[0])),
                y: Math.max(0, Math.min(rows - 1, cell.y + direction[1])),
              }));
            }}
          >
            {tool === 'erase' ? 'Erase' : 'Paint'} cell {focusedCell.x + 1}, {focusedCell.y + 1}
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={() => void save()}
          disabled={draft.busy || !draft.dirty || draft.conflict}
        >
          {draft.busy ? 'Saving…' : 'Save Tilemap'}
        </Button>
        <Button
          size="sm"
          onClick={() => tileDrafts.discard(key, initialCells)}
          disabled={draft.busy || !draft.dirty}
        >
          Discard draft
        </Button>
        <span className="hint mono">{draft.cells.length} occupied cells</span>
      </div>
      {draft.conflict && (
        <p className="hint" role="alert">
          Saved tiles changed while this draft was open. Discard the draft to load the current saved
          tiles before editing again.
        </p>
      )}
      {draft.message && (
        <p className="hint" role="status">
          {draft.message}
        </p>
      )}
    </div>
  );
}
