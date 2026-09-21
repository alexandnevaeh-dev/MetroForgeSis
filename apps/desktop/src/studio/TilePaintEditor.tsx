import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge, Button, EmptyState, Panel } from './ui/index.js';

export interface TileCell {
  x: number;
  y: number;
  col: number;
  row: number;
}

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
  const [artwork, setArtwork] = useState<{ url: string; width: number; height: number } | null>(null);
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
          setArtwork({ url: preview.dataUrl, width: image.naturalWidth, height: image.naturalHeight });
        }
      } catch { /* Missing/failed artwork remains visibly unavailable. */ }
      finally { if (!cancelled) setLoaded(true); }
    }
    void load();
    return () => { cancelled = true; };
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

export type TilePaintTool = 'paint' | 'erase';

interface TilePaintEditorProps {
  projectPath: string;
  roomId: string;
  biomeId: string;
  width: number;
  height: number;
  tileSize?: number;
  initialCells?: TileCell[];
  selectedTile: TileCoord;
  /** Paint places the selected atlas tile; erase removes cells. */
  tool?: TilePaintTool;
  onSaved?: () => void;
}

export function TilePaintEditor({
  projectPath,
  roomId,
  biomeId,
  width,
  height,
  tileSize = 16,
  initialCells = [],
  selectedTile,
  tool = 'paint',
  onSaved,
}: TilePaintEditorProps) {
  const { artwork, loaded } = useTilesetArtwork(projectPath, biomeId);
  const atlasId = useId();
  const [cells, setCells] = useState<TileCell[]>(initialCells);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);


  useEffect(() => {
    setCells(initialCells);
  }, [roomId, initialCells]);

  const cols = Math.floor(width / tileSize);
  const rows = Math.floor(height / tileSize);

  const cellKey = (x: number, y: number) => `${x},${y}`;
  const cellMap = useMemo(() => {
    const map = new Map<string, TileCell>();
    for (const c of cells) map.set(cellKey(c.x, c.y), c);
    return map;
  }, [cells]);

  const applyTool = useCallback(
    (x: number, y: number) => {
      if (pending.current) return;
      setCells((prev) => {
        const without = prev.filter((c) => !(c.x === x && c.y === y));
        if (tool === 'erase') return without;
        without.push({ x, y, col: selectedTile.col, row: selectedTile.row });
        return without;
      });
    },
    [selectedTile, tool],
  );

  const save = async () => {
    if (pending.current || !window.metroforge?.updateRoom) return;
    pending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.metroforge.updateRoom(projectPath, { roomId, tileCells: cells });
      if (!mounted.current) return;
      if (result.error || result.success === false) {
        setMessage(result.error ?? result.errors?.join('; ') ?? 'Save failed. Your painted tiles are still here; try again.');
      } else {
        setMessage('Tilemap saved and room recompiled');
        onSaved?.();
      }
    } catch (error) {
      if (mounted.current) setMessage(`Could not save tilemap: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const scale = Math.min(1, 640 / width);

  return (
    <div className="tile-paint">
      <div className="mf-panel-head">
        <h3 className="mf-panel-title">{tool === 'erase' ? 'Erase' : 'Paint'} · {biomeId}</h3>
        <span className="hint mono">
          {tool === 'erase' ? 'remove cells' : `tile ${selectedTile.col},${selectedTile.row}`}
        </span>
      </div>
      {!artwork && <p className="hint" role="status">{loaded ? 'Tileset artwork unavailable. Showing occupied cells.' : 'Loading tileset artwork…'}</p>}
      <div
        className="tile-canvas-wrap"
        style={{ width: width * scale, height: height * scale, overflow: 'auto' }}
      >
        <svg
          width={width * scale}
          height={height * scale}
          viewBox={`0 0 ${width} ${height}`}
          style={{ imageRendering: 'pixelated' }}
        >
          {artwork && <defs><image id={atlasId} href={artwork.url} width={artwork.width} height={artwork.height} /></defs>}
          <rect x={0} y={0} width={width} height={height} fill="var(--canvas-bg, #0f172a)" />
          {Array.from({ length: cols * rows }).map((_, i) => {
            const x = i % cols;
            const y = Math.floor(i / cols);
            const cell = cellMap.get(cellKey(x, y));
            const px = x * tileSize;
            const py = y * tileSize;
            return (
              <g key={i}>
                <rect
                  x={px}
                  y={py}
                  width={tileSize}
                  height={tileSize}
                  fill={cell ? '#475569' : '#1e293b'}
                  stroke="#334155"
                  strokeWidth={0.5}
                  onClick={() => applyTool(x, y)}
                  style={{ cursor: tool === 'erase' ? 'cell' : 'crosshair' }}
                />
                {cell && artwork && (
                  <svg
                    pointerEvents="none"
                    x={px} y={py} width={tileSize} height={tileSize}
                    viewBox={`${cell.col * tileSize} ${cell.row * tileSize} ${tileSize} ${tileSize}`}
                    overflow="hidden"
                  >
                    <use href={`#${atlasId}`} />
                  </svg>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="row">
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save Tilemap'}
        </Button>
        <Button size="sm" onClick={() => setCells([])} disabled={busy}>
          Clear
        </Button>
      </div>
      {message && <p className="hint" role="status">{message}</p>}
    </div>
  );
}
