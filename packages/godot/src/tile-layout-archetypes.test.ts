import { describe, it, expect } from 'vitest';
import { buildRoomTileCells } from '../src/tile-layout.js';
import { measureRoomLayout, layoutsTooSimilar } from '../src/room-variety.js';

const BASE = { width: 800, height: 600, tileSize: 16 };

describe('archetype geometry is distinct', () => {
  it('boss, traversal, npc and combat rooms do not share a silhouette', () => {
    const seeds = { seed: 11 };
    const combat = buildRoomTileCells({ ...BASE, archetype: 'combat', ...seeds });
    const traversal = buildRoomTileCells({ ...BASE, width: 960, height: 900, archetype: 'traversal', ...seeds });
    const boss = buildRoomTileCells({ ...BASE, width: 960, height: 720, archetype: 'boss', ...seeds });
    const npc = buildRoomTileCells({ ...BASE, archetype: 'npc', ...seeds });
    const keys = [combat, traversal, boss, npc].map((layout) =>
      layout.platforms.map((p) => `${p.x}:${p.y}:${p.width}`).join('|'),
    );
    expect(new Set(keys).size).toBe(4);
  });

  it('puzzle rooms create multiple elevations', () => {
    const layout = buildRoomTileCells({ ...BASE, height: 900, archetype: 'puzzle', seed: 4 });
    expect(layout.platforms.length).toBeGreaterThanOrEqual(2);
    const metrics = measureRoomLayout({ ...BASE, height: 900, layout });
    expect(metrics.uniquePlatformHeights).toBeGreaterThan(1);
  });

  it('uniqueness salt changes a duplicate combat layout', () => {
    const a = buildRoomTileCells({ ...BASE, archetype: 'combat', seed: 1, uniquenessSalt: 0 });
    const b = buildRoomTileCells({ ...BASE, archetype: 'combat', seed: 1, uniquenessSalt: 1 });
    expect(a.platforms).not.toEqual(b.platforms);
  });

  it('layoutsTooSimilar detects identical platform sets', () => {
    const a = buildRoomTileCells({ ...BASE, archetype: 'connector', seed: 3 });
    const ma = measureRoomLayout({ ...BASE, layout: a });
    expect(layoutsTooSimilar(ma, ma, a.platforms, a.platforms, a.pits, a.pits)).toBe(true);
  });
});
