import { describe, expect, it } from 'vitest';
import { measureRoomLayout } from './room-variety.js';

describe('measureRoomLayout — decorationDensity', () => {
  it('reads 0 when neither tile-cell decor nor a decoration count is present', () => {
    const m = measureRoomLayout({
      width: 800,
      height: 600,
      tileSize: 32,
      layout: { cells: [], platforms: [], pits: [] },
    });
    expect(m.decorationDensity).toBe(0);
  });

  it('is no longer blind to sprite-based decoration (floor props + wall architecture)', () => {
    // Regression: the authored-Foundry room-assembly path paints its decoration as Sprite2D
    // nodes (EnvProp_*, wall-mounted arches/statues), never as decor_a/decor_b atlas tile cells —
    // so a room that visibly has props on screen still measured 0 without this input, and every
    // Foundry-themed generation reported "zero decoration density" regardless of what was placed.
    const withoutCount = measureRoomLayout({
      width: 800,
      height: 600,
      tileSize: 32,
      layout: { cells: [], platforms: [], pits: [] },
    });
    const withCount = measureRoomLayout({
      width: 800,
      height: 600,
      tileSize: 32,
      layout: { cells: [], platforms: [], pits: [] },
      decorationCount: 4,
    });
    expect(withoutCount.decorationDensity).toBe(0);
    expect(withCount.decorationDensity).toBeGreaterThan(0);
  });

  it('still counts decor_a/decor_b tile cells for pipelines that paint them directly', () => {
    const m = measureRoomLayout({
      width: 320,
      height: 320,
      tileSize: 32,
      layout: {
        cells: [
          { x: 1, y: 1, col: 6, row: 2 },
          { x: 2, y: 1, col: 7, row: 2 },
        ],
        platforms: [],
        pits: [],
      },
    });
    expect(m.decorationDensity).toBeGreaterThan(0);
  });
});

describe('measureRoomLayout — traversableAreaRatio', () => {
  it('measures openness within the reachable band, not the full room including decorative sky', () => {
    // Regression: a tall room with a compact, reasonably-filled floor band but a lot of purely
    // decorative headroom above it (hanging chains, a gantry — atmosphere, never meant to be
    // walked) used to measure occupancy against the WHOLE room rectangle, so every generously
    // tall room read as "too open" regardless of how well-composed its actual floor band was.
    const tileSize = 32;
    const width = 800;
    const height = 1600; // very tall — lots of decorative sky above the floor band
    const cols = width / tileSize; // 25
    // A floor band occupying most of the bottom ~6 rows (reasonably filled), with a platform
    // near the top of the reachable band.
    const cells = [];
    for (let x = 0; x < cols; x++) {
      for (let y = 44; y < 50; y++) {
        cells.push({ x, y, col: 1, row: 0 });
      }
    }
    const platforms = [{ x: 0, y: 41 * tileSize, width: 200, height: tileSize }];
    const tallRoom = measureRoomLayout({
      width,
      height,
      tileSize,
      layout: { cells, platforms, pits: [] },
    });
    // Same floor band, but the room is only as tall as the reachable band itself (no extra sky).
    const shortRoom = measureRoomLayout({
      width,
      height: 50 * tileSize,
      tileSize,
      layout: { cells, platforms, pits: [] },
    });
    // The two should read as comparably open/cramped — within a few points of each other — since
    // the actual playable geometry is identical. Before this fix, tallRoom's ratio was pulled
    // toward 1 (empty) by the ~41 extra all-air rows above the reachable band that shortRoom
    // doesn't have.
    expect(Math.abs(tallRoom.traversableAreaRatio - shortRoom.traversableAreaRatio)).toBeLessThan(0.1);
  });
});
