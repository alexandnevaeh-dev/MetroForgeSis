import { describe, expect, it } from 'vitest';
import { decodePngRgba } from './png.js';
import {
  generatePropSprite,
  partitionPropFeatures,
  PROP_SUPPORTED_FEATURES,
  environmentDecorationPalette,
  interactablePalette,
} from './prop-art.js';

describe('environmentDecorationPalette', () => {
  const palette = {
    global: ['#284878', '#3ca064', '#dcb432', '#e87850'],
    shadows: ['#122036', '#1b482d', '#635117', '#683624'],
    accents: ['#dcb432', '#e87850'],
    highlights: ['#325a96', '#4bc87d', '#ffe13f', '#ff9664'],
  };

  it('never uses palette.global[0] (the void/sky swatch)', () => {
    const { fill, accent } = environmentDecorationPalette(palette);
    expect(fill).not.toBe(palette.global[0]);
    expect(accent).not.toBe(palette.global[0]);
  });

  it('picks a distinct swatch from interactablePalette so pickups still pop against scenery', () => {
    // Regression: environment decoration (statues, debris, wall architecture) previously used
    // palette.global[0] — the same "void/sky" blue interactablePalette explicitly avoids — so a
    // shrine/pews prop rendered in cool blue standing right next to warm soot-and-brass Foundry
    // rooms mismatched the whole room's material language.
    const decor = environmentDecorationPalette(palette);
    const interactable = interactablePalette(palette);
    expect(decor.fill).not.toBe(interactable.fill);
  });

  it('falls back sanely when the palette is missing fields entirely', () => {
    const { fill, accent } = environmentDecorationPalette(undefined);
    expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
    expect(accent).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

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
