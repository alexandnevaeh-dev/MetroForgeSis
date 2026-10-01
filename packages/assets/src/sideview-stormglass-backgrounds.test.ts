import { describe, expect, it } from 'vitest';
import { decodePngRgba } from './png.js';
import { generateStormglassBackground, type StormglassBackgroundLayer } from './sideview-stormglass-backgrounds.js';

const layers: Array<[StormglassBackgroundLayer, number, number]> = [
  ['far', 960, 540], ['mid', 960, 320], ['near', 960, 320], ['foreground', 960, 540], ['overlay', 640, 360],
];
describe('Stormglass parallax family', () => {
  it.each(layers)('%s has the runtime dimensions and visible content', (layer, width, height) => {
    const image = decodePngRgba(generateStormglassBackground(layer));
    expect([image.width, image.height]).toEqual([width, height]);
    expect(image.rgba.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
  });
  it('keeps atmospheric layers transparent', () => {
    for (const layer of ['mid', 'near', 'foreground', 'overlay'] as const) {
      const image = decodePngRgba(generateStormglassBackground(layer));
      expect(image.rgba.some((v, i) => i % 4 === 3 && v === 0)).toBe(true);
    }
  });
  it('uses a detailed palette instead of placeholder block fields', () => {
    for (const layer of ['far', 'mid', 'near'] as const) {
      const image = decodePngRgba(generateStormglassBackground(layer));
      const colors = new Set<string>();
      for (let i = 0; i < image.rgba.length; i += 4) {
        if (image.rgba[i + 3] === 0) continue;
        colors.add(`${image.rgba[i]},${image.rgba[i + 1]},${image.rgba[i + 2]},${image.rgba[i + 3]}`);
      }
      expect(colors.size).toBeGreaterThan(layer === 'far' ? 100 : 3);
    }
  });
});
