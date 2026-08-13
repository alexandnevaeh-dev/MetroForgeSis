import { useCallback, useEffect, useMemo, useState } from 'react';

export interface TileCell {
  x: number;
  y: number;
  col: number;
  row: number;
}

interface TilePaintEditorProps {
  projectPath: string;
  roomId: string;
  biomeId: string;
  width: number;
  height: number;
  tileSize?: number;
  initialCells?: TileCell[];
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
  onSaved,
}: TilePaintEditorProps) {
  const [cells, setCells] = useState<TileCell[]>(initialCells);
  const [selectedTile, setSelectedTile] = useState({ col: 0, row: 2 });
  const [tilesetUrl, setTilesetUrl] = useState<string | null>(null);
  const [atlasSize, setAtlasSize] = useState(128);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setCells(initialCells);
  }, [roomId, initialCells]);

  useEffect(() => {
    if (!projectPath || !window.metroforge?.getTilesetPreview) return;
    window.metroforge.getTilesetPreview(projectPath, biomeId).then((preview) => {
      if (preview?.dataUrl) setTilesetUrl(preview.dataUrl);
      if (preview?.atlasSize) setAtlasSize(preview.atlasSize);
      if (preview?.tileSize) {
        /* keep prop default unless atlas reports */
      }
    });
  }, [projectPath, biomeId]);

  const cols = Math.floor(width / tileSize);
  const rows = Math.floor(height / tileSize);
  const paletteCols = Math.floor(atlasSize / tileSize);

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
    <div className="tile-paint panel">
      <h4>Tile Paint</h4>
      <div className="row">
        {tilesetUrl && (
          <div className="tile-palette">
            {Array.from({ length: paletteCols * paletteCols }).map((_, i) => {
              const col = i % paletteCols;
              const row = Math.floor(i / paletteCols);
              const active = selectedTile.col === col && selectedTile.row === row;
              return (
                <button
                  key={i}
                  type="button"
                  className={active ? 'palette-tile active' : 'palette-tile'}
                  style={{
                    width: tileSize,
                    height: tileSize,
                    backgroundImage: `url(${tilesetUrl})`,
                    backgroundPosition: `-${col * tileSize}px -${row * tileSize}px`,
                    backgroundSize: `${atlasSize}px ${atlasSize}px`,
                    imageRendering: 'pixelated',
                  }}
                  onClick={() => setSelectedTile({ col, row })}
                />
              );
            })}
          </div>
        )}
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
        <button type="button" className="primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save Tilemap'}
        </button>
        <button type="button" onClick={() => setCells([])} disabled={busy}>
          Clear
        </button>
      </div>
      {message && <p className="hint">{message}</p>}
    </div>
  );
}
