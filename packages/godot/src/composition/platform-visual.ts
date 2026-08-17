import { type OccupancyGrid, type VisualCell, setKind, getKind, roleToCell } from './surface-roles.js';
import type { GeometryRect, PlatformVisualStrategy } from './room-blueprint.js';

export function markPlatformOccupancy(grid: OccupancyGrid, platforms: GeometryRect[], tileSize: number): void {
  for (const platform of platforms) {
    const row = Math.floor(platform.y / tileSize);
    const start = Math.floor(platform.x / tileSize);
    const length = Math.max(2, Math.round(platform.width / tileSize));
    for (let i = 0; i < length; i++) {
      setKind(grid, start + i, row, 'platform');
    }
  }
}

/** Visual treatment only — collision PlatformRect is unchanged. */
export function dressPlatforms(input: {
  grid: OccupancyGrid;
  platforms: GeometryRect[];
  tileSize: number;
  floorRow: number;
  strategy: PlatformVisualStrategy;
}): VisualCell[] {
  const extras: VisualCell[] = [];
  for (const platform of input.platforms) {
    const row = Math.floor(platform.y / input.tileSize);
    const start = Math.floor(platform.x / input.tileSize);
    const end = start + Math.max(2, Math.round(platform.width / input.tileSize)) - 1;
    const embedded = row >= input.floorRow - 1;
    const strategy = embedded ? 'embedded' : input.strategy;
    if (strategy === 'supported' || strategy === 'ruined' || strategy === 'mechanical') {
      const supportRow = row + 1;
      if (supportRow < input.floorRow) {
        for (const x of [start, end]) {
          if (getKind(input.grid, x, supportRow) === 'empty') {
            setKind(input.grid, x, supportRow, 'solid');
          }
        }
      }
    }
    if (strategy === 'suspended' || strategy === 'floating_magic') {
      const chainRow = row - 1;
      if (chainRow > 0) {
        extras.push(roleToCell(start, chainRow, 'decor_b'));
        extras.push(roleToCell(end, chainRow, 'decor_b'));
      }
    }
  }
  return extras;
}
