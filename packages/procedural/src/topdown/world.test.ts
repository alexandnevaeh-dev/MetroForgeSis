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
});
