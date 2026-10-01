import { describe, expect, it } from 'vitest';
import { generateTopDownWorld, isWalkableTile, type TopDownArea } from './world.js';

// The shipped top-down Player.tscn has a 20x20 collision body. Testing tile
// connectivity alone misses passages that look open but cannot fit that body.
function reachablePois(area: TopDownArea): string[] {
  const radius = Math.ceil(10 / area.tileSize);
  const clear = (x: number, y: number): boolean => {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (!isWalkableTile(area.tiles[y + dy]?.[x + dx] ?? -1)) return false;
    return true;
  };
  const first = area.pois.find((p) => p.kind === 'spawn') ?? area.pois[0]!;
  const sx = Math.floor(first.x / area.tileSize),
    sy = Math.floor(first.y / area.tileSize);
  const queue: Array<[number, number]> = clear(sx, sy) ? [[sx, sy]] : [];
  const seen = new Set(queue.map(([x, y]) => y * area.widthTiles + x));
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const key = ny! * area.widthTiles + nx!;
      if (!seen.has(key) && clear(nx!, ny!)) {
        seen.add(key);
        queue.push([nx!, ny!]);
      }
    }
  }
  return area.pois
    .filter(
      (p) =>
        !seen.has(
          Math.floor(p.y / area.tileSize) * area.widthTiles + Math.floor(p.x / area.tileSize),
        ),
    )
    .map((p) => p.id);
}

describe('physical top-down routes', () => {
  it.each([1, 42, 424242, 20260929])(
    'connects every POI with player-sized clearance (seed %i)',
    (seed) => {
      for (const area of generateTopDownWorld({ seed, profile: 'TINY_TEST' }).overworld.areas)
        expect(reachablePois(area), area.id).toEqual([]);
    },
  );
  it.each([8, 16, 32])('respects tile size %i and keeps perimeter walls intact', (tileSize) => {
    const world = generateTopDownWorld({ seed: 42, profile: 'TINY_TEST', tileSize }).overworld;
    for (const area of world.areas) {
      expect(reachablePois(area), area.id).toEqual([]);
      for (let x = 0; x < area.widthTiles; x++) {
        expect(isWalkableTile(area.tiles[0]![x]!)).toBe(false);
        expect(isWalkableTile(area.tiles[area.heightTiles - 1]![x]!)).toBe(false);
      }
      for (const row of area.tiles) {
        expect(isWalkableTile(row[0]!)).toBe(false);
        expect(isWalkableTile(row[row.length - 1]!)).toBe(false);
      }
    }
  });
  it('gives room purposes distinct proportions and varies layouts with the seed', () => {
    const a = generateTopDownWorld({ seed: 42, profile: 'TINY_TEST' }).overworld.areas.filter(
      (a) => a.kind === 'dungeon',
    );
    const b = generateTopDownWorld({ seed: 43, profile: 'TINY_TEST' }).overworld.areas.filter(
      (a) => a.kind === 'dungeon',
    );
    expect(new Set(a.map((a) => a.widthTiles + 'x' + a.heightTiles)).size).toBe(4);
    expect(a[1]!.widthTiles).toBeGreaterThan(a[2]!.widthTiles);
    for (const area of a) expect(area.pois.filter((p) => p.kind === 'spawn')).toHaveLength(1);
    expect(a.map((a) => a.tiles)).not.toEqual(b.map((a) => a.tiles));
  });
  it('is deterministic and retains architectural obstacles', () => {
    const options = { seed: 42, profile: 'TINY_TEST' as const };
    expect(generateTopDownWorld(options)).toEqual(generateTopDownWorld(options));
    const library = generateTopDownWorld(options).overworld.areas.find(
      (a) => a.name === 'Flooded Archive',
    )!;
    expect(
      library.tiles
        .slice(1, -1)
        .flatMap((row) => row.slice(1, -1))
        .filter((t) => !isWalkableTile(t)).length,
    ).toBeGreaterThan(10);
  });
});

describe('woodland redesign routes', () => {
  it.each([1, 42, 20260929])(
    'keeps every objective physically reachable in the redesigned field (%i)',
    (seed) => {
      const options = {
        seed,
        profile: 'TINY_TEST' as const,
        tileSize: 32,
        layoutStyle: 'woodland_ruins' as const,
      };
      const result = generateTopDownWorld(options);
      expect(result).toEqual(generateTopDownWorld(options));
      for (const area of result.overworld.areas) expect(reachablePois(area), area.id).toEqual([]);
      const field = result.overworld.areas[0]!;
      expect(field.name).toBe('Verdant Ruins');
      expect(field.tiles.flat().filter((t) => t === 1).length).toBeGreaterThan(50);
      expect(field.tiles.flat().filter((t) => t === 2).length).toBeGreaterThan(5);
    },
  );
});
