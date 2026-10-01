import type { TileCell } from './room-assembler.js';
import type { PitGap, PlatformRect, RoomTileLayoutResult } from './tile-layout.js';

export interface RoomLayoutMetrics {
  silhouetteHash: string;
  platformCount: number;
  pitCount: number;
  elevationChanges: number;
  uniquePlatformHeights: number;
  traversableAreaRatio: number;
  verticality: number;
  hazardDensity: number;
  decorationDensity: number;
  combatSpacePx: number;
  silhouetteFilled: number;
}

const HAZARD_COL = 3;
const HAZARD_ROW = 2;
const DECOR_A = { col: 6, row: 2 };
const DECOR_B = { col: 7, row: 2 };

function cellKey(c: Pick<TileCell, 'x' | 'y'>): string {
  return `${c.x},${c.y}`;
}

export function measureRoomLayout(input: {
  width: number;
  height: number;
  tileSize: number;
  layout: RoomTileLayoutResult;
  /** Actual sprite-based decoration placed in this room (floor props + wall-mounted
   *  architecture/statues/arches). The tile-cell decor count below only sees decor_a/decor_b
   *  atlas cells; the authored-Foundry room-assembly path paints its dressing as Sprite2D nodes
   *  instead and never touches those atlas cells, so without this input decorationDensity reads a
   *  flat 0 for every room in that path regardless of how much is actually on screen. */
  decorationCount?: number;
}): RoomLayoutMetrics {
  const { width, height, tileSize, layout, decorationCount } = input;
  const cols = Math.max(1, Math.floor(width / tileSize));
  const rows = Math.max(1, Math.floor(height / tileSize));
  const total = cols * rows;
  const occupied = new Set(layout.cells.map(cellKey));
  const heights = layout.platforms.map((p) => p.y).sort((a, b) => a - b);
  const uniqueHeights = new Set(heights);
  let elevationChanges = uniqueHeights.size;
  for (let i = 1; i < heights.length; i++) {
    if (Math.abs(heights[i]! - heights[i - 1]!) >= tileSize) elevationChanges += 1;
  }
  const hazardCells = layout.cells.filter((c) => c.col === HAZARD_COL && c.row === HAZARD_ROW).length;
  const decorCells = layout.cells.filter(
    (c) =>
      (c.col === DECOR_A.col && c.row === DECOR_A.row) ||
      (c.col === DECOR_B.col && c.row === DECOR_B.row),
  ).length;
  const minY = layout.platforms.length
    ? Math.min(...layout.platforms.map((p) => p.y), height)
    : height;
  const combatSpacePx = Math.max(0, (height - minY) * width * 0.35);
  const silhouette = layout.cells
    .map((c) => `${c.x}:${c.y}:${c.col}:${c.row}`)
    .sort()
    .join('|');
  // Traversable-area-ratio measures openness within the actually-reachable band (from just above
  // the highest placed platform down through the floor), not the whole room rectangle. A tall
  // room's purely decorative sky headroom above that band (hanging chains, gantries — atmosphere,
  // never meant to be walked) is not "cramped or empty gameplay space"; measuring against the
  // full rectangle structurally biased every generously-tall room toward a false "too open"
  // reading regardless of how well-composed its actual floor band was.
  const bandTopRow = Math.max(0, Math.floor(Math.max(0, minY - tileSize * 3) / tileSize));
  const bandRows = Math.max(1, rows - bandTopRow);
  const bandTotal = cols * bandRows;
  let occupiedInBand = 0;
  for (const key of occupied) {
    const y = Number(key.slice(key.indexOf(',') + 1));
    if (y >= bandTopRow) occupiedInBand++;
  }
  const tileDecorDensity = bandTotal > 0 ? decorCells / bandTotal : 0;
  // Sprite-based decorations counted in the same units as the tile-cell density above (one
  // decoration ~= one occupied "decor cell" out of the reachable band), so a room that
  // relies on Sprite2D dressing instead of decor-atlas tiles is not scored as if it had none.
  // Using the reachable band (not the full room including decorative sky) matches
  // traversableAreaRatio and avoids tall rooms reading as chronically undressed.
  const spriteDecorDensity = bandTotal > 0 ? Math.min(1, (decorationCount ?? 0) / bandTotal) : 0;
  return {
    silhouetteHash: silhouette.slice(0, 64) || 'empty',
    platformCount: layout.platforms.length,
    pitCount: layout.pits.length,
    elevationChanges,
    uniquePlatformHeights: uniqueHeights.size,
    traversableAreaRatio: bandTotal > 0 ? Math.max(0, 1 - occupiedInBand / bandTotal) : 0,
    verticality: height > 0 ? (height - minY) / height : 0,
    hazardDensity: total > 0 ? hazardCells / total : 0,
    decorationDensity: Math.max(tileDecorDensity, spriteDecorDensity),
    combatSpacePx,
    silhouetteFilled: occupied.size,
  };
}

/** True when two layouts are essentially copies (same platform/pit/silhouette shape). */
export function layoutsTooSimilar(
  a: RoomLayoutMetrics,
  b: RoomLayoutMetrics,
  aPlatforms: PlatformRect[],
  bPlatforms: PlatformRect[],
  aPits: PitGap[],
  bPits: PitGap[],
): boolean {
  if (a.silhouetteFilled === b.silhouetteFilled && a.platformCount === b.platformCount && a.pitCount === b.pitCount) {
    const platA = aPlatforms.map((p) => `${p.x},${p.y},${p.width}`).sort().join('|');
    const platB = bPlatforms.map((p) => `${p.x},${p.y},${p.width}`).sort().join('|');
    const pitA = aPits.map((p) => `${p.x},${p.width}`).sort().join('|');
    const pitB = bPits.map((p) => `${p.x},${p.width}`).sort().join('|');
    if (platA === platB && pitA === pitB) return true;
  }
  return (
    a.platformCount === b.platformCount &&
    a.uniquePlatformHeights === b.uniquePlatformHeights &&
    a.pitCount === b.pitCount &&
    Math.abs(a.verticality - b.verticality) < 0.04 &&
    Math.abs(a.traversableAreaRatio - b.traversableAreaRatio) < 0.03
  );
}

export function roomSetHasExcessDuplicates(metrics: RoomLayoutMetrics[]): boolean {
  if (metrics.length < 3) return false;
  const keys = metrics.map(
    (m) => `${m.platformCount}:${m.uniquePlatformHeights}:${m.pitCount}:${Math.round(m.verticality * 8)}`,
  );
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const majority = Math.max(...counts.values());
  return majority / metrics.length > 0.55;
}
