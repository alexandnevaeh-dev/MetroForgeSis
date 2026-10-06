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
    const shrine780 = buildRoomTileCells({
      width: 800,
      height: 780,
      tileSize: 32,
      seed: 20260909,
      archetype: 'ability_shrine',
    });
    const shrineTop = Math.min(...shrine780.platforms.map((p) => p.y));
    expect(shrine780.platforms.length).toBeGreaterThanOrEqual(2);
    // Reachable geometry stays in the lower band; camera frames that band.
    expect(shrineTop).toBeGreaterThan(780 * 0.4);
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

  it('environment gallery bands raise RoomComposition above the foundry 43 baseline', () => {
    const envs = ['armory', 'laboratory', 'dungeon', 'castle_hall', 'laboratory', 'armory'] as const;
    const archetypes = ['combat', 'traversal', 'combat', 'challenge', 'puzzle', 'npc'] as const;
    const rooms = envs.map((environmentArchetype, i) => {
      const layout = buildRoomTileCells({
        width: 960,
        height: 720,
        tileSize: 16,
        archetype: archetypes[i],
        environmentArchetype,
        seed: 200 + i,
        availableAbilities: ['dash'],
        connections: [
          { direction: 'left', requirements: [] },
          { direction: 'right', requirements: [] },
        ],
      });
      const metrics = measureRoomLayout({
        width: 960,
        height: 720,
        tileSize: 16,
        layout,
        decorationCount: 8,
      });
      return { id: `room_${i}`, layoutMetrics: metrics };
    });
    // Inline the same scorer weights used by modern_metroidvania_gate RoomComposition.
    const avg = (sel: (m: (typeof rooms)[0]['layoutMetrics']) => number) =>
      rooms.reduce((s, r) => s + sel(r.layoutMetrics), 0) / rooms.length;
    const avgDecoration = avg((m) => m.decorationDensity);
    const avgPlatforms = avg((m) => m.platformCount);
    const multi = rooms.filter((r) => r.layoutMetrics.uniquePlatformHeights >= 2).length / rooms.length;
    const vert = rooms.filter((r) => r.layoutMetrics.verticality > 0.15).length / rooms.length;
    const avgElev = avg((m) => m.elevationChanges);
    const score = Math.min(
      100,
      Math.round(
        Math.min(25, avgDecoration * 500) +
          Math.min(20, avgPlatforms * 5) +
          Math.min(20, multi * 20) +
          vert * 15 +
          Math.min(10, avgElev * 4),
      ),
    );
    expect(multi).toBeGreaterThan(0.5);
    expect(avgPlatforms).toBeGreaterThan(2);
    expect(score).toBeGreaterThan(43);
  });
});

it('fills long entrance halls with repeated reachable stair bays and broad balconies', () => {
  const layout = buildRoomTileCells({ width: 1600, height: 768, tileSize: 16, seed: 11, archetype: 'tutorial' });
  expect(layout.platforms.length).toBeGreaterThanOrEqual(9);
  expect(Math.max(...layout.platforms.map(p => p.x + p.width))).toBeGreaterThan(1400);
  for (let i = 0; i < layout.platforms.length; i += 3) {
    const bay = layout.platforms.slice(i, i + 3);
    expect(bay).toHaveLength(3);
    expect(bay[2]!.width).toBeGreaterThanOrEqual(160);
    for (let j = 1; j < bay.length; j++) {
      expect(bay[j]!.x - (bay[j - 1]!.x + bay[j - 1]!.width)).toBeLessThanOrEqual(48);
      expect(bay[j - 1]!.y - bay[j]!.y).toBeLessThanOrEqual(96);
    }
  }
});

it.each(['puzzle', 'ability_shrine', 'ability_gate'])('keeps %s ascent gaps local when rooms expand', archetype => {
  for (const width of [800, 1600, 2560]) for (const tileSize of [16, 32]) {
    const layout = buildRoomTileCells({ width, height: 1024, tileSize, seed: 21, archetype });
    expect(layout.platforms.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < layout.platforms.length; i++) {
      const previous = layout.platforms[i - 1]!;
      const next = layout.platforms[i]!;
      expect(next.x - (previous.x + previous.width)).toBeLessThanOrEqual(32);
      expect(next.x + next.width).toBeLessThan(width - tileSize);
      expect(previous.y - next.y).toBeLessThanOrEqual(96);
    }
  }
});
