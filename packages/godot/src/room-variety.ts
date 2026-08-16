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
}): RoomLayoutMetrics {
  const { width, height, tileSize, layout } = input;
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
  return {
    silhouetteHash: silhouette.slice(0, 64) || 'empty',
    platformCount: layout.platforms.length,
    pitCount: layout.pits.length,
    elevationChanges,
    uniquePlatformHeights: uniqueHeights.size,
    traversableAreaRatio: total > 0 ? Math.max(0, 1 - occupied.size / total) : 0,
    verticality: height > 0 ? (height - minY) / height : 0,
    hazardDensity: total > 0 ? hazardCells / total : 0,
    decorationDensity: total > 0 ? decorCells / total : 0,
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
