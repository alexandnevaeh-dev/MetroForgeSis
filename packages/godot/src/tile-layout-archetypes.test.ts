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
    const miniboss = buildRoomTileCells({ ...BASE, width: 960, height: 720, archetype: 'miniboss', ...seeds });
    const keys = [combat, traversal, boss, npc, miniboss].map((layout) =>
      layout.platforms.map((p) => `${p.x}:${p.y}:${p.width}`).join('|'),
    );
    expect(new Set(keys).size).toBe(5);
  });

  it('ability shrine and gate always have platforms and verticality', () => {
    for (const archetype of ['ability_shrine', 'ability_gate'] as const) {
      const layout = buildRoomTileCells({
        ...BASE,
        archetype,
        seed: 21,
        connections: [{ direction: 'right', requirements: ['dash'] }],
        availableAbilities: ['dash'],
      });
      const metrics = measureRoomLayout({ ...BASE, layout });
      expect(layout.platforms.length).toBeGreaterThanOrEqual(2);
      expect(metrics.uniquePlatformHeights).toBeGreaterThanOrEqual(2);
      expect(metrics.verticality).toBeGreaterThan(0);
    }
  });

  it('tutorial staircase differs from combat arena platforms', () => {
    const tutorial = buildRoomTileCells({ ...BASE, archetype: 'tutorial', seed: 11 });
    const combat = buildRoomTileCells({ ...BASE, archetype: 'combat', seed: 11 });
    const tMetrics = measureRoomLayout({ ...BASE, layout: tutorial });
    const cMetrics = measureRoomLayout({ ...BASE, layout: combat });
    expect(tMetrics.uniquePlatformHeights).toBeGreaterThan(1);
    expect(tMetrics.platformCount).toBeGreaterThanOrEqual(3);
    expect(cMetrics.platformCount).toBeGreaterThanOrEqual(2);
    expect(combat.platforms.map((p) => p.y).join(',')).not.toEqual(tutorial.platforms.map((p) => p.y).join(','));
  });

  it('32px tiles still stack climbRows so uniqueHeights is not a single jump-legal row', () => {
    const input = { width: 800, height: 600, tileSize: 32, seed: 11 };
    const tutorial = buildRoomTileCells({ ...input, archetype: 'tutorial' });
    const combat = buildRoomTileCells({ ...input, archetype: 'combat' });
    const traversal = buildRoomTileCells({ ...input, height: 720, archetype: 'traversal' });
    const shrine = buildRoomTileCells({
      ...input,
      archetype: 'ability_shrine',
      connections: [{ direction: 'right', requirements: ['dash'] }],
      availableAbilities: ['dash'],
    });
    const tM = measureRoomLayout({ ...input, layout: tutorial });
    const cM = measureRoomLayout({ ...input, layout: combat });
    const vM = measureRoomLayout({ ...input, height: 720, layout: traversal });
    const sM = measureRoomLayout({ ...input, layout: shrine });
    expect(tM.uniquePlatformHeights).toBeGreaterThanOrEqual(2);
    expect(tM.platformCount).toBeGreaterThanOrEqual(3);
    expect(cM.platformCount).toBeGreaterThanOrEqual(2);
    expect(vM.uniquePlatformHeights).toBeGreaterThanOrEqual(2);
    expect(sM.uniquePlatformHeights).toBeGreaterThanOrEqual(2);
    const gate = buildRoomTileCells({
      ...input,
      height: 780,
      archetype: 'ability_gate',
      connections: [
        { direction: 'left', requirements: ['dash'] },
        { direction: 'right', requirements: [] },
      ],
      availableAbilities: ['dash'],
    });
    expect(gate.pits).toHaveLength(0);
    expect(measureRoomLayout({ ...input, height: 780, layout: gate }).uniquePlatformHeights).toBeGreaterThanOrEqual(2);
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
