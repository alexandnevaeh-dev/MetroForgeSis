import { describe, expect, it } from 'vitest';
import { decodePngRgba } from './png.js';
import { generateTopDownWoodlandTileset, WOODLAND_ATLAS_COLUMNS, WOODLAND_ATLAS_ROWS, WOODLAND_TILE_SIZE } from './topdown-woodland-tileset.js';

describe('top-down woodland tileset', () => {
  it('matches the established 8x6 32px terrain contract', () => {
    const image = decodePngRgba(generateTopDownWoodlandTileset());
    expect(image.width).toBe(WOODLAND_TILE_SIZE * WOODLAND_ATLAS_COLUMNS);
    expect(image.height).toBe(WOODLAND_TILE_SIZE * WOODLAND_ATLAS_ROWS);
  });
  it('gives ground, wall, path and water distinct centers', () => {
    const image = decodePngRgba(generateTopDownWoodlandTileset());
    const center = (c: number, r: number) => {
      const i = ((r * 32 + 16) * image.width + c * 32 + 16) * 4;
      return Array.from(image.rgba.slice(i, i + 3)).join(',');
    };
    expect(new Set([center(0, 0), center(1, 0), center(3, 0), center(3, 2)]).size).toBe(4);
  });
  it('keeps base grass edges seamless', () => {
    const image = decodePngRgba(generateTopDownWoodlandTileset());
    const color = (x: number, y: number) => Array.from(image.rgba.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
    for (let n = 0; n < 32; n++) {
      expect(color(0, n)).toEqual(color(31, n));
      expect(color(n, 0)).toEqual(color(n, 31));
    }
  });
});
