import { describe, it, expect } from 'vitest';
import {
  generateTopDownWorld,
  collisionRectsFromTiles,
  isWalkableTile,
  TILE_GRASS,
  TILE_WALL,
  TILE_WATER,
  type TopDownArea,
  type TopDownPoi,
} from './world.js';
import { validateWorldConnectivity } from '../world.js';

describe('generateTopDownWorld', () => {
  it('builds a connected TINY_TEST overworld plus mini dungeon', () => {
    const result = generateTopDownWorld({ seed: 42, profile: 'TINY_TEST' });
    expect(result.overworld.areas.some((a: TopDownArea) => a.id === 'overworld')).toBe(true);
    expect(result.overworld.areas.filter((a: TopDownArea) => a.kind === 'dungeon')).toHaveLength(4);
    expect(result.overworld.dungeonItemId).toBe('wind_disc');
    expect(result.roomIds[0]).toBe('overworld');
    const { connected, unreachableRoomIds } = validateWorldConnectivity(result.worldGraph);
    expect(connected).toBe(true);
    expect(unreachableRoomIds).toHaveLength(0);
    const overworld = result.overworld.areas.find((a: TopDownArea) => a.id === 'overworld')!;
    expect(overworld.pois.some((p: TopDownPoi) => p.kind === 'spawn')).toBe(true);
    expect(overworld.pois.some((p: TopDownPoi) => p.kind === 'dungeon_entrance')).toBe(true);
    expect(overworld.collisionRects.length).toBeGreaterThan(0);
  });

  it('merges blocked tiles into collision rectangles', () => {
    const tiles = [
      [TILE_WALL, TILE_WALL, TILE_GRASS],
      [TILE_WATER, TILE_GRASS, TILE_GRASS],
    ];
    const rects = collisionRectsFromTiles(tiles, 16);
    expect(rects).toEqual([
      { x: 0, y: 0, w: 32, h: 16 },
      { x: 0, y: 16, w: 16, h: 16 },
    ]);
    expect(isWalkableTile(TILE_GRASS)).toBe(true);
    expect(isWalkableTile(TILE_WALL)).toBe(false);
  });

  // Regression coverage for the P0 autonomous-playtest failure (docs/debug/
  // TOPDOWN_PLAYTEST_REPAIR.md): carveField's per-cell random water/wall scatter used to run
  // fully independently of POI placement, so a POI (chest, portal, spawn...) could generate
  // directly on top of a blocked tile, and two randomly-scattered obstacles could end up
  // diagonally touching, pinching the only nearby path to zero real width — both confirmed via a
  // real headless PlaytestAgent run to permanently wedge the input-simulated bot. Every seed
  // below reproduced at least one of these two defects before the `clearWalkableFootprint`/
  // `removeDiagonalPinches` fix in generateTopDownWorld.
  const REGRESSION_SEEDS = [424242, 777001, 20260814, 1, 99999, 5551234];

  it.each(REGRESSION_SEEDS)(
    'places every overworld POI on a walkable tile (seed %i)',
    (seed) => {
      const result = generateTopDownWorld({ seed, profile: 'TINY_TEST' });
      const overworld = result.overworld.areas.find((a: TopDownArea) => a.id === 'overworld')!;
      const tileSize = overworld.tileSize;
      for (const poi of overworld.pois) {
        const tx = Math.floor(poi.x / tileSize);
        const ty = Math.floor(poi.y / tileSize);
        const tile = overworld.tiles[ty]?.[tx];
        expect(
          isWalkableTile(tile as number),
          `POI ${poi.id} (${poi.kind}) at tile (${tx},${ty}) is not walkable (tile=${tile})`,
        ).toBe(true);
      }
    },
  );

  it.each(REGRESSION_SEEDS)(
    'never leaves a diagonal-only blocked pinch in the overworld field (seed %i)',
    (seed) => {
      const result = generateTopDownWorld({ seed, profile: 'TINY_TEST' });
      const overworld = result.overworld.areas.find((a: TopDownArea) => a.id === 'overworld')!;
      const tiles = overworld.tiles;
      const blocked = (x: number, y: number): boolean =>
        tiles[y]?.[x] === TILE_WALL || tiles[y]?.[x] === TILE_WATER;
      const pinches: string[] = [];
      for (let y = 0; y < tiles.length - 1; y++) {
        for (let x = 0; x < (tiles[0]?.length ?? 0) - 1; x++) {
          const nw = blocked(x, y);
          const ne = blocked(x + 1, y);
          const sw = blocked(x, y + 1);
          const se = blocked(x + 1, y + 1);
          if ((nw && se && !ne && !sw) || (ne && sw && !nw && !se)) {
            pinches.push(`(${x},${y})`);
          }
        }
      }
      expect(pinches, `diagonal-only pinches at: ${pinches.join(', ')}`).toHaveLength(0);
    },
  );
});
