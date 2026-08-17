import { describe, it, expect } from 'vitest';
import { DEFAULT_MOVEMENT_STATS } from '@metroforge/procedural';
import { buildRoomTileCells, floorTopPx } from '../src/tile-layout.js';

const BASE = { width: 800, height: 600, tileSize: 16 };

function cellsKey(cells: { x: number; y: number; col: number; row: number }[]): string {
  return cells
    .map((c) => `${c.x},${c.y},${c.col},${c.row}`)
    .sort()
    .join('|');
}

describe('buildRoomTileCells — structure', () => {
  it('always paints a walkable floor row (visual tiles, not raw collision cubes)', () => {
    const { cells } = buildRoomTileCells({ ...BASE, archetype: 'combat', seed: 1 });
    const floorRow = Math.max(1, Math.floor((BASE.height - BASE.tileSize * 2) / BASE.tileSize));
    const floorCells = cells.filter((c) => c.y === floorRow);
    expect(floorCells.length).toBeGreaterThan(30);
    const massRows = new Set(cells.filter((c) => c.y >= floorRow && c.y <= floorRow + 3).map((c) => c.y));
    expect(massRows.size).toBeLessThan(3);
  });

  it('floorTopPx agrees with the painted ground row', () => {
    const top = floorTopPx(BASE.height, BASE.tileSize);
    const floorRow = Math.max(1, Math.floor((BASE.height - BASE.tileSize * 2) / BASE.tileSize));
    expect(top).toBe(floorRow * BASE.tileSize);
  });
});

describe('buildRoomTileCells — seeded variation', () => {
  it('produces different cell layouts for two different seeds at the same archetype', () => {
    const a = buildRoomTileCells({ ...BASE, archetype: 'combat', seed: 1 });
    const b = buildRoomTileCells({ ...BASE, archetype: 'combat', seed: 2 });
    expect(cellsKey(a.cells)).not.toBe(cellsKey(b.cells));
  });

  it('produces different platform placements for two different seeds at the same archetype', () => {
    const a = buildRoomTileCells({ ...BASE, archetype: 'challenge', seed: 11 });
    const b = buildRoomTileCells({ ...BASE, archetype: 'challenge', seed: 42 });
    expect(a.platforms).not.toEqual(b.platforms);
  });

  it('is deterministic: the same seed always produces the same layout', () => {
    const a = buildRoomTileCells({ ...BASE, archetype: 'traversal', seed: 7 });
    const b = buildRoomTileCells({ ...BASE, archetype: 'traversal', seed: 7 });
    expect(cellsKey(a.cells)).toBe(cellsKey(b.cells));
    expect(a.platforms).toEqual(b.platforms);
    expect(a.pits).toEqual(b.pits);
  });

  it('varies room width/height archetypes still diverge across many seeds (not archetype-uniform)', () => {
    const layouts = Array.from({ length: 8 }, (_, i) =>
      cellsKey(buildRoomTileCells({ ...BASE, archetype: 'combat', seed: i + 1 }).cells),
    );
    const distinct = new Set(layouts);
    // At minimum, not every seed collapses to the exact same shape.
    expect(distinct.size).toBeGreaterThan(1);
  });
});

describe('buildRoomTileCells — movement-feasibility bounds', () => {
  it('keeps every platform vertically reachable from the floor within a real single-jump apex', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { platforms } = buildRoomTileCells({
        ...BASE,
        archetype: 'combat',
        seed,
        movement: DEFAULT_MOVEMENT_STATS,
      });
      const floorTop = floorTopPx(BASE.height, BASE.tileSize);
      for (const p of platforms) {
        const gapAboveFloor = floorTop - (p.y + p.height);
        // A single jump's real apex, with the same safety factor tile-layout.ts uses internally.
        expect(gapAboveFloor).toBeLessThanOrEqual(DEFAULT_MOVEMENT_STATS.jumpHeight * 0.82 + BASE.tileSize);
      }
    }
  });

  it('leaves the player real collision height (48px) of clearance below every platform', () => {
    // Regression coverage: an earlier off-by-one in platformRowRange left exactly 48px of
    // clearance under a shaft platform — precisely the player's own collision height with zero
    // margin — which wedged a real playtest bot ("walk_timeout") during manual verification.
    const PLAYER_COLLISION_HEIGHT_PX = 48;
    for (const tileSize of [16, 32]) {
      for (const archetype of ['combat', 'traversal', 'challenge']) {
        for (let seed = 1; seed <= 20; seed++) {
          const { platforms } = buildRoomTileCells({
            width: 960,
            height: 900,
            tileSize,
            archetype,
            seed,
            availableAbilities: ['dash'],
          });
          const floorTop = floorTopPx(900, tileSize);
          for (const p of platforms) {
            const clearance = floorTop - (p.y + p.height);
            expect(clearance).toBeGreaterThan(PLAYER_COLLISION_HEIGHT_PX);
          }
        }
      }
    }
  });

  it('sizes pit gaps within real dash reach so every pit is actually crossable', () => {
    const dashReachPx = DEFAULT_MOVEMENT_STATS.dashSpeed * DEFAULT_MOVEMENT_STATS.dashDuration;
    let checked = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { pits } = buildRoomTileCells({
        ...BASE,
        archetype: 'challenge',
        seed,
        availableAbilities: ['dash'],
      });
      for (const pit of pits) {
        checked++;
        expect(pit.width).toBeLessThanOrEqual(dashReachPx);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('never carves a pit in the same span reserved for a ground_slam weak floor', () => {
    const { pits } = buildRoomTileCells({
      ...BASE,
      archetype: 'challenge',
      seed: 5,
      availableAbilities: ['dash'],
      connections: [{ direction: 'down', requirements: ['ground_slam'] }],
    });
    expect(pits.length).toBe(0);
  });

  it('never carves a dash-reach pit before dash/air_dash is actually unlocked, even for challenge rooms', () => {
    // Regression coverage: a pit sized to dash reach in a room the player visits before picking
    // up dash is a real softlock (dash is gated behind GameManager.has_ability at runtime) — this
    // is exactly what stranded the playtest bot in an early arena room during manual verification.
    for (let seed = 1; seed <= 15; seed++) {
      const { pits } = buildRoomTileCells({
        ...BASE,
        width: 960,
        height: 900,
        archetype: 'challenge',
        seed,
        availableAbilities: [],
      });
      expect(pits.length).toBe(0);
    }
  });
});

describe('buildRoomTileCells — archetype features', () => {
  it('challenge rooms get a pit (a real jump/dash gap) once dash is actually unlocked', () => {
    let sawPit = false;
    for (let seed = 1; seed <= 15; seed++) {
      const { pits } = buildRoomTileCells({
        ...BASE,
        width: 960,
        height: 900,
        archetype: 'challenge',
        seed,
        availableAbilities: ['dash'],
      });
      if (pits.length > 0) sawPit = true;
    }
    expect(sawPit).toBe(true);
  });

  it('traversal rooms paint a multi-row vertical shaft of ascending platforms', () => {
    const { platforms } = buildRoomTileCells({ ...BASE, width: 960, archetype: 'traversal', seed: 3 });
    // At least the low platform plus shaft steps.
    expect(platforms.length).toBeGreaterThanOrEqual(2);
    const rows = new Set(platforms.map((p) => p.y));
    expect(rows.size).toBeGreaterThan(1);
  });

  it('secret rooms reached via an optional connection get a concealment pit and an offset niche', () => {
    const { platforms, pits, cells } = buildRoomTileCells({
      ...BASE,
      archetype: 'secret',
      seed: 4,
      availableAbilities: ['dash'],
      connections: [{ direction: 'left', requirements: [], optional: true }],
    });
    expect(platforms.length).toBeGreaterThan(0);
    expect(pits.length).toBeGreaterThan(0);
    // Niche sits near an extreme edge, not the generic mid-room placement the old code used.
    const nicheCols = platforms.map((p) => p.x / BASE.tileSize);
    const cols = Math.floor(BASE.width / BASE.tileSize);
    expect(nicheCols.some((c) => c < cols * 0.2 || c > cols * 0.8)).toBe(true);
    expect(cells.length).toBeGreaterThan(0);
  });

  it('secret rooms reached via a non-optional connection skip the concealment pit', () => {
    const { pits } = buildRoomTileCells({
      ...BASE,
      archetype: 'secret',
      seed: 4,
      availableAbilities: ['dash'],
      connections: [{ direction: 'left', requirements: [], optional: false }],
    });
    expect(pits.length).toBe(0);
  });

  it('secret rooms skip the concealment pit before dash/air_dash is unlocked, even if optional', () => {
    const { pits } = buildRoomTileCells({
      ...BASE,
      archetype: 'secret',
      seed: 4,
      availableAbilities: [],
      connections: [{ direction: 'left', requirements: [], optional: true }],
    });
    expect(pits.length).toBe(0);
  });

  it('ability_gate columns for a vertical ability size their height to that ability real reach', () => {
    const doubleJump = buildRoomTileCells({
      ...BASE,
      archetype: 'ability_gate',
      seed: 9,
      connections: [{ direction: 'right', requirements: ['double_jump'] }],
    });
    const wallJump = buildRoomTileCells({
      ...BASE,
      archetype: 'ability_gate',
      seed: 9,
      connections: [{ direction: 'right', requirements: ['wall_jump'] }],
    });
    const doorRowsDoubleJump = doubleJump.cells.filter((c) => c.col === 5 && c.row === 2).length;
    const doorRowsWallJump = wallJump.cells.filter((c) => c.col === 5 && c.row === 2).length;
    // Wall-jump is modeled as an (effectively) unbounded room-height climb — its column must be
    // taller than a double_jump-gated column sized to a single jump-and-a-half reach.
    expect(doorRowsWallJump).toBeGreaterThan(doorRowsDoubleJump);
  });

  it('combat/tutorial/arena rooms are not identical across seeds (not one fixed shape per archetype)', () => {
    const seeds = [1, 2, 3, 4, 5];
    const shapes = seeds.map(
      (seed) => cellsKey(buildRoomTileCells({ ...BASE, archetype: 'combat', seed }).cells),
    );
    expect(new Set(shapes).size).toBeGreaterThan(1);
  });
});

describe('buildRoomTileCells — playable air', () => {
  it('does not fill combat interiors with rear masonry so biome backgrounds can show', () => {
    const { cells } = buildRoomTileCells({ ...BASE, archetype: 'combat', seed: 1 });
    const floorRow = Math.max(1, Math.floor((BASE.height - BASE.tileSize * 2) / BASE.tileSize));
    const cols = Math.floor(BASE.width / BASE.tileSize);
    const interiorMass = cells.filter(
      (c) =>
        c.x > 0 &&
        c.x < cols - 1 &&
        c.y > 0 &&
        c.y < floorRow &&
        c.col === 1 &&
        c.row === 0,
    );
    expect(interiorMass.length).toBe(0);
  });
});

describe('buildRoomTileCells — role/atlas agreement', () => {
  it('every painted cell stays inside the 8x6 TILE_ATLAS', () => {
    const { cells } = buildRoomTileCells({ ...BASE, archetype: 'ability_shrine', seed: 2 });
    for (const c of cells) {
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(8);
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeLessThan(6);
    }
  });
});
