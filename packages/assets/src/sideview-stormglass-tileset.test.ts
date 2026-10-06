import { describe, expect, it } from 'vitest';
import { decodePngRgba } from './png.js';
import { generateStormglassTileset, STORMGLASS_ATLAS_HEIGHT, STORMGLASS_ATLAS_WIDTH } from './sideview-stormglass-tileset.js';

describe('Stormglass side-view terrain', () => {
  it('matches the canonical 8x6 32px atlas', () => {
    const image = decodePngRgba(generateStormglassTileset());
    expect([image.width, image.height]).toEqual([STORMGLASS_ATLAS_WIDTH, STORMGLASS_ATLAS_HEIGHT]);
  });
  it('keeps required gameplay roles visually distinct', () => {
    const image = decodePngRgba(generateStormglassTileset());
    const tileHash = (c: number, r: number) => {
      const bytes: number[] = [];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const i = ((r * 32 + y) * image.width + c * 32 + x) * 4;
        bytes.push(...image.rgba.slice(i, i + 4));
      }
      return Buffer.from(bytes).toString('base64');
    };
    expect(new Set([tileHash(0, 0), tileHash(3, 0), tileHash(3, 2), tileHash(5, 2)]).size).toBe(4);
  });
  it('has no transparent holes in structural ground and wall roles', () => {
    const image = decodePngRgba(generateStormglassTileset());
    for (const c of [0, 1, 2]) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++)
      expect(image.rgba[(y * image.width + c * 32 + x) * 4 + 3]).toBe(255);
  });
  it('gives each Stormglass biome a distinct terrain material family', () => {
    const atlases = [0, 1, 2, 3].map((biome) => generateStormglassTileset(biome));
    expect(new Set(atlases.map((atlas) => atlas.toString('base64'))).size).toBe(4);
    for (const atlas of atlases) {
      const image = decodePngRgba(atlas);
      expect([image.width, image.height]).toEqual([256, 192]);
    }
  });
});
