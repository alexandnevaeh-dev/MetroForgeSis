import { useCallback, useEffect, useMemo, useState } from 'react';
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

export function TilePalettePanel({
  projectPath,
  biomeId,
  tileSize = 16,
  selectedTile,
  onSelect,
  interactive = true,
}: TilePalettePanelProps) {
  const [tilesetUrl, setTilesetUrl] = useState<string | null>(null);
  const [atlasSize, setAtlasSize] = useState(128);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setTilesetUrl(null);
    if (!projectPath || !window.metroforge?.getTilesetPreview) return;
    let cancelled = false;
    window.metroforge.getTilesetPreview(projectPath, biomeId).then((preview) => {
      if (cancelled) return;
      if (preview?.dataUrl) setTilesetUrl(preview.dataUrl);
      if (preview?.atlasSize) setAtlasSize(preview.atlasSize);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath, biomeId]);

  const paletteCols = Math.floor(atlasSize / tileSize);

  return (
    <Panel
      level={1}
      className="tile-palette-dock"
      title="Tile Palette"
      actions={<Badge tone="muted">{biomeId}</Badge>}
    >
      {!loaded ? (
        <p className="hint">Loading tileset…</p>
      ) : !tilesetUrl ? (
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
          >
            {Array.from({ length: paletteCols * paletteCols }).map((_, i) => {
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
                    backgroundImage: `url(${tilesetUrl})`,
                    backgroundPosition: `-${col * tileSize}px -${row * tileSize}px`,
                    backgroundSize: `${atlasSize}px ${atlasSize}px`,
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

interface TilePaintEditorProps {
  projectPath: string;
  roomId: string;
  biomeId: string;
  width: number;
  height: number;
  tileSize?: number;
  initialCells?: TileCell[];
  selectedTile: TileCoord;
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
  onSaved,
}: TilePaintEditorProps) {
  const [cells, setCells] = useState<TileCell[]>(initialCells);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const paint = useCallback(
    (x: number, y: number) => {
      setCells((prev) => {
        const next = prev.filter((c) => !(c.x === x && c.y === y));
        next.push({ x, y, col: selectedTile.col, row: selectedTile.row });
        return next;
      });
    },
    [selectedTile],
  );

  const save = async () => {
    if (!window.metroforge?.updateRoom) return;
    setBusy(true);
    setMessage(null);
    const result = await window.metroforge.updateRoom(projectPath, {
      roomId,
      tileCells: cells,
    });
    setBusy(false);
    if (result.error || result.success === false) setMessage(result.error ?? 'Save failed');
    else {
      setMessage('Tilemap saved and room recompiled');
      onSaved?.();
    }
  };

  const scale = Math.min(1, 640 / width);

  return (
    <div className="tile-paint">
      <div className="mf-panel-head">
        <h3 className="mf-panel-title">Paint · {biomeId}</h3>
        <span className="hint mono">
          tile {selectedTile.col},{selectedTile.row}
        </span>
      </div>
      <div
        className="tile-canvas-wrap"
        style={{ width: width * scale, height: height * scale, overflow: 'auto' }}
      >
        <svg width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`}>
          <rect x={0} y={0} width={width} height={height} fill="#0f172a" />
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
                  onClick={() => paint(x, y)}
                  style={{ cursor: 'crosshair' }}
                />
                {cell && (
                  <rect
                    x={px + 1}
                    y={py + 1}
                    width={tileSize - 2}
                    height={tileSize - 2}
                    fill={`hsl(${(cell.col * 17 + cell.row * 53) % 360}, 55%, 42%)`}
                  />
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
      {message && <p className="hint">{message}</p>}
    </div>
  );
}
