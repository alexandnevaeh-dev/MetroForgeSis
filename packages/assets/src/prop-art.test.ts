import { describe, expect, it } from 'vitest';
import { decodePngRgba } from './png.js';
import { generatePropSprite, partitionPropFeatures, PROP_SUPPORTED_FEATURES } from './prop-art.js';

describe('generatePropSprite biome material features (fifteenth session)', () => {
  const base = { width: 48, height: 48, fill: '#384d60', accent: '#a9c3cb', family: 'pipe', seed: 17 };

  it('is byte-identical to the un-featured output when no features are passed', () => {
    const a = generatePropSprite(base);
    const b = generatePropSprite({ ...base, features: undefined });
    expect(a.equals(b)).toBe(true);
  });

  it('declares an unrecognized/unsupported feature explicitly', () => {
    const { supported, unsupported } = partitionPropFeatures(['corrosion', 'panel_grates', 'damaged_modules']);
    expect(supported).toEqual(['corrosion']);
    expect(unsupported).toEqual(['panel_grates', 'damaged_modules']);
    expect(PROP_SUPPORTED_FEATURES).not.toContain('panel_grates');
  });

  it('applying a feature changes pixels only within the opaque silhouette, never the transparent background', () => {
    const plain = decodePngRgba(generatePropSprite(base));
    const featured = decodePngRgba(generatePropSprite({ ...base, features: ['corrosion', 'vegetation'] }));
    let changed = 0;
    for (let i = 0; i < plain.rgba.length; i += 4) {
      expect(featured.rgba[i + 3]).toBe(plain.rgba[i + 3]); // alpha untouched
      if (plain.rgba[i] !== featured.rgba[i] || plain.rgba[i + 1] !== featured.rgba[i + 1] || plain.rgba[i + 2] !== featured.rgba[i + 2]) {
        changed++;
        expect(plain.rgba[i + 3]).toBe(255); // only inside the opaque prop silhouette
      }
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('same seed + features reproduces identical output; a different seed varies it', () => {
    const a = generatePropSprite({ ...base, features: ['stains'] });
    const b = generatePropSprite({ ...base, features: ['stains'] });
    const c = generatePropSprite({ ...base, seed: 99, features: ['stains'] });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
