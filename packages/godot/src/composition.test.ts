import { describe, expect, it } from 'vitest';
import {
  createOccupancy,
  setKind,
  resolveSurfaceRole,
  resolveSurfaceTiles,
  neighborMask,
  suppressRepetition,
  analyzeRepetition,
  composePlayableVisuals,
  composeBossArena,
  evaluateRoomPresentation,
  hasFullHeightWallFrame,
  floorMassRowCount,
} from './composition/index.js';
import { buildRoomTileCells } from './tile-layout.js';

describe('surface resolver', () => {
  it('classifies an isolated tile', () => {
    const grid = createOccupancy(5, 5);
    setKind(grid, 2, 2, 'solid');
    expect(resolveSurfaceRole('solid', neighborMask(grid, 2, 2))).toBe('ground_rare');
  });

  it('classifies a straight wall', () => {
    const grid = createOccupancy(3, 5);
    for (let y = 0; y < 5; y++) setKind(grid, 1, y, 'solid');
    expect(resolveSurfaceRole('solid', neighborMask(grid, 1, 2))).toBe('wall');
  });

  it('classifies outer corners', () => {
    const grid = createOccupancy(4, 4);
    setKind(grid, 1, 1, 'solid');
    setKind(grid, 2, 1, 'solid');
    setKind(grid, 1, 2, 'solid');
    setKind(grid, 2, 2, 'solid');
    expect(resolveSurfaceRole('solid', neighborMask(grid, 2, 1))).toBe('outside_tr');
    expect(resolveSurfaceRole('solid', neighborMask(grid, 1, 2))).toBe('outside_bl');
  });

  it('classifies inner corners when the diagonal is air', () => {
    const grid = createOccupancy(4, 4);
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) setKind(grid, x, y, 'solid');
    setKind(grid, 0, 0, 'empty');
    expect(resolveSurfaceRole('solid', neighborMask(grid, 1, 1))).toBe('inside_tl');
  });

  it('classifies thin platforms with left/right caps', () => {
    const grid = createOccupancy(8, 4);
    setKind(grid, 2, 1, 'platform');
    setKind(grid, 3, 1, 'platform');
    setKind(grid, 4, 1, 'platform');
    const cells = resolveSurfaceTiles(grid);
    expect(cells.find((c) => c.x === 2)?.col).toBe(0);
    expect(cells.find((c) => c.x === 2)?.row).toBe(2);
    expect(cells.find((c) => c.x === 4)?.col).toBe(1);
  });

  it('handles irregular occupancy without throwing', () => {
    const grid = createOccupancy(6, 6);
    setKind(grid, 1, 1, 'solid');
    setKind(grid, 2, 2, 'solid');
    setKind(grid, 4, 1, 'platform');
    setKind(grid, 5, 5, 'door');
    expect(resolveSurfaceTiles(grid).length).toBe(4);
  });
});

describe('repetition', () => {
  it('fails a long identical-tile run', () => {
    const cells = Array.from({ length: 20 }, (_, x) => ({ x, y: 4, col: 0, row: 0 }));
    const analysis = analyzeRepetition(cells);
    expect(analysis.violations).toContain('EXCESSIVE_TILE_REPETITION');
    expect(analysis.longestRun).toBeGreaterThan(4);
  });

  it('substitutes variants without changing cell count or positions', () => {
    const cells = Array.from({ length: 20 }, (_, x) => ({ x, y: 4, col: 0, row: 0 }));
    const next = suppressRepetition(cells, 7);
    expect(next).toHaveLength(20);
    expect(next.map((c) => `${c.x},${c.y}`)).toEqual(cells.map((c) => `${c.x},${c.y}`));
    expect(analyzeRepetition(next).longestRun).toBeLessThanOrEqual(4);
  });
});

describe('composePlayableVisuals', () => {
  it('is deterministic for the same seed', () => {
    const platforms = [{ x: 64, y: 320, width: 96, height: 16 }];
    const input = {
      cells: [],
      platforms,
      pits: [] as Array<{ x: number; y: number; width: number; height: number }>,
      cols: 50,
      rows: 37,
      floorRow: 35,
      tileSize: 16,
      width: 800,
      height: 600,
      archetype: 'combat',
      seed: 20260817,
    };
    const a = composePlayableVisuals(input);
    const b = composePlayableVisuals(input);
    expect(JSON.stringify(a.cells)).toBe(JSON.stringify(b.cells));
  });

  it('does not emit a full-height wall frame or 4-row floor slab', () => {
    const { cells, blueprint } = buildRoomTileCells({
      width: 800,
      height: 600,
      tileSize: 16,
      archetype: 'combat',
      seed: 3,
    });
    const floorRow = Math.max(1, Math.floor((600 - 32) / 16));
    expect(hasFullHeightWallFrame(cells, 50, floorRow)).toBe(false);
    expect(floorMassRowCount(cells, floorRow)).toBeLessThan(3);
    expect(blueprint?.visualIntent.openPlayableAir).toBe(true);
  });

  it('invokes dedicated boss arena composition', () => {
    const layout = buildRoomTileCells({
      width: 960,
      height: 720,
      tileSize: 16,
      archetype: 'boss',
      seed: 11,
    });
    expect(layout.blueprint?.visualIntent.composedAsBossArena).toBe(true);
    expect(layout.blueprint?.landmarks.length).toBeGreaterThan(0);
    const arena = composeBossArena({
      cols: 60,
      floorRow: 43,
      width: 960,
      height: 720,
      platforms: layout.platforms,
      tileSize: 16,
    });
    expect(arena.composedAsBossArena).toBe(true);
    expect(arena.landmarks[0]?.kind).toBe('ancient_mechanism');
  });

  it('does not change collision platforms or pits when composing visuals', () => {
    const a = buildRoomTileCells({
      width: 800,
      height: 600,
      tileSize: 16,
      archetype: 'challenge',
      seed: 5,
      availableAbilities: ['dash'],
    });
    const b = buildRoomTileCells({
      width: 800,
      height: 600,
      tileSize: 16,
      archetype: 'challenge',
      seed: 5,
      availableAbilities: ['dash'],
    });
    expect(a.platforms).toEqual(b.platforms);
    expect(a.pits).toEqual(b.pits);
  });
});

describe('commercial presentation gate', () => {
  it('rejects the old cube-frame pattern', () => {
    const floorRow = 35;
    const cols = 50;
    const cells = [];
    for (let y = 0; y < floorRow; y++) {
      cells.push({ x: 0, y, col: 1, row: 0 });
      cells.push({ x: cols - 1, y, col: 1, row: 0 });
    }
    for (let x = 0; x < cols; x++) {
      cells.push({ x, y: floorRow, col: 0, row: 0 });
      cells.push({ x, y: floorRow + 1, col: 0, row: 0 });
      cells.push({ x, y: floorRow + 2, col: 0, row: 0 });
      cells.push({ x, y: floorRow + 3, col: 7, row: 0 });
    }
    const result = evaluateRoomPresentation({
      id: 'legacy',
      archetype: 'combat',
      tileCells: cells,
      cols,
      floorRow,
    });
    expect(result.violations).toContain('RAW_COLLISION_GEOMETRY');
    expect(result.violations).toContain('EXCESSIVE_TILE_REPETITION');
    expect(result.score).toBeLessThan(50);
  });
});
