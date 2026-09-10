import { describe, expect, it } from 'vitest';
import { decodePngRgba } from './png.js';
import { WORLD_INTERACTABLE_ASSETS, generatePropSprite } from './prop-art.js';

function opaqueCount(png: Buffer): number {
  const { rgba } = decodePngRgba(png);
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! > 0) n += 1;
  }
  return n;
}

describe('world interactable prop art', () => {
  it('ships pickup, save shrine, and ability sprites', () => {
    expect(WORLD_INTERACTABLE_ASSETS.map((a) => a.id)).toEqual([
      'world_pickup',
      'world_save_shrine',
      'world_ability',
    ]);
  });

  it('paints opaque pixels for each interactable family', () => {
    for (const spec of WORLD_INTERACTABLE_ASSETS) {
      const png = generatePropSprite({
        width: spec.width,
        height: spec.height,
        fill: '#3a4a58',
        accent: '#c4a060',
        family: spec.family,
        seed: 42,
      });
      const decoded = decodePngRgba(png);
      expect(decoded.width).toBe(spec.width);
      expect(decoded.height).toBe(spec.height);
      expect(opaqueCount(png)).toBeGreaterThan(spec.width * spec.height * 0.12);
    }
  });
});
