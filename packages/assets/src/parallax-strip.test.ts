import { describe, expect, it } from 'vitest';
import { decodePngRgba, encodePng } from '../src/png.js';
import { generateParallaxStrip, punchParallaxAlpha, farPlateLooksLikeOutdoorLandscape, partitionBackgroundFeatures, BACKGROUND_SUPPORTED_FEATURES } from '../src/parallax-strip.js';

function countAlpha(png: Buffer, pred: (a: number, t: number) => boolean): number {
  const { rgba, width, height } = decodePngRgba(png);
  let n = 0;
  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3]!;
      if (pred(a, t)) n++;
    }
  }
  return n;
}

describe('parallax strips', () => {
  it('paints far as an opaque night-citadel plate, not an outdoor vista', () => {
    const far = generateParallaxStrip('far', 7, 160, 90);
    const { width, height } = decodePngRgba(far);
    expect(width).toBe(160);
    expect(height).toBe(90);
    expect(countAlpha(far, (a) => a > 200)).toBe(160 * 90);
    const { rgba } = decodePngRgba(far);
    let luma = 0;
    const rows = Math.floor(90 * 0.4);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < 160; x++) {
        const i = (y * 160 + x) * 4;
        luma += (rgba[i]! + rgba[i + 1]! + rgba[i + 2]!) / 3;
      }
    }
    expect(luma / (160 * rows)).toBeLessThan(90);
  });

  it('paints sparse mid colonnades and near occluders with mostly transparent air', () => {
    const mid = generateParallaxStrip('mid', 11, 160, 90);
    const near = generateParallaxStrip('near', 13, 160, 90);
    expect(decodePngRgba(mid).height).toBe(90);
    expect(decodePngRgba(near).height).toBe(90);
    const midOpaque = countAlpha(mid, (a) => a > 200);
    const nearOpaque = countAlpha(near, (a) => a > 180);
    const total = 160 * 90;
    expect(midOpaque).toBeGreaterThan(total * 0.04);
    expect(midOpaque).toBeLessThan(total * 0.28);
    expect(nearOpaque).toBeGreaterThan(total * 0.02);
    expect(nearOpaque).toBeLessThan(total * 0.22);
    expect(countAlpha(mid, (a, t) => t < 0.15 && a < 16)).toBeGreaterThan(160 * 8);
    expect(countAlpha(near, (a, t) => t > 0.45 && t < 0.75 && a < 16)).toBeGreaterThan(160 * 12);
    const midHash = countAlpha(mid, (a) => a > 200);
    const nearHash = countAlpha(near, (a) => a > 180);
    expect(midHash).not.toBe(nearHash);
  });

  it('punches stacked AI landscapes into horizon strips', () => {
    const rgba = new Uint8Array(80 * 40 * 4);
    rgba.fill(255);
    const plate = encodePng(80, 40, rgba);
    const overlay = punchParallaxAlpha(plate, 'overlay');
    expect(countAlpha(overlay, (a, t) => t < 0.12 && a < 16)).toBeGreaterThan(80 * 4);
    expect(punchParallaxAlpha(plate, 'far')).toEqual(plate);
    expect(punchParallaxAlpha(plate, 'mid')).toEqual(plate);
  });

  it('keeps the upper far plate as sky instead of a repeating clerestory grid', () => {
    const { rgba, width, height } = decodePngRgba(generateParallaxStrip('far', 7, 160, 90));
    const skyRows = Math.floor(height * 0.45);
    let masonryLike = 0;
    let sampled = 0;
    for (let y = 0; y < skyRows; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = rgba[i]!;
        const g = rgba[i + 1]!;
        const b = rgba[i + 2]!;
        sampled += 1;
        if (b < 90 && Math.abs(r - g) < 12 && g < 55) masonryLike += 1;
      }
    }
    expect(masonryLike / sampled).toBeLessThan(0.08);
  });

  it('rejects green pine/landscape far plates and accepts procedural citadel far', () => {
    const w = 80;
    const h = 40;
    const pine = new Uint8Array(w * h * 4);
    for (let i = 0; i < pine.length; i += 4) {
      pine[i] = 40;
      pine[i + 1] = 110;
      pine[i + 2] = 50;
      pine[i + 3] = 255;
    }
    expect(farPlateLooksLikeOutdoorLandscape(encodePng(w, h, pine))).toBe(true);
    expect(farPlateLooksLikeOutdoorLandscape(generateParallaxStrip('far', 7, 640, 360))).toBe(false);
  });

  it('rejects moon-window-on-water far plates as outdoor landscape', () => {
    const w = 80;
    const h = 40;
    const plate = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        plate[i + 3] = 255;
        const cx = x - w * 0.5;
        const cy = y - h * 0.42;
        if (cx * cx + cy * cy < 90) {
          plate[i] = 220;
          plate[i + 1] = 230;
          plate[i + 2] = 240;
        } else if (y > h * 0.55) {
          plate[i] = 120;
          plate[i + 1] = 170;
          plate[i + 2] = 210;
        } else {
          plate[i] = 20;
          plate[i + 1] = 30;
          plate[i + 2] = 60;
        }
      }
    }
    expect(farPlateLooksLikeOutdoorLandscape(encodePng(w, h, plate))).toBe(true);
  });

  it('paints receding hall mass in the lower far plate instead of empty night', () => {
    // The pier/wall/dado band (t≈0.55–0.72, before the lit floor) is the region this checks —
    // that architecture now ramps toward the floor's glow by design (see the QA-critic crop-
    // robustness comment on paintFarHallMass), so sampling all the way to the floor itself would
    // measure the wrong thing. The dark-mass claim still holds where the ramp hasn't kicked in yet.
    const { rgba, width, height } = decodePngRgba(generateParallaxStrip('far', 7, 160, 90));
    let mass = 0;
    let sampled = 0;
    for (let y = Math.floor(height * 0.55); y < Math.floor(height * 0.72); y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const g = rgba[i + 1]!;
        const b = rgba[i + 2]!;
        sampled += 1;
        if (b < 110 && g < 80) mass += 1;
      }
    }
    expect(mass / sampled).toBeGreaterThan(0.18);
  });

  it('does not paint a circular moon in the upper far plate', () => {
    const { rgba, width, height } = decodePngRgba(generateParallaxStrip('far', 7, 160, 90));
    let bright = 0;
    let sampled = 0;
    for (let y = 0; y < Math.floor(height * 0.28); y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        sampled += 1;
        const luma = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
        if (luma > 160) bright += 1;
      }
    }
    expect(bright / sampled).toBeLessThan(0.012);
  });
});

describe('generateParallaxStrip biome material features (fifteenth session)', () => {
  it('is byte-identical to the un-featured output when no features are passed, for every layer', () => {
    for (const layer of ['far', 'mid', 'near'] as const) {
      const a = generateParallaxStrip(layer, 7, 160, 90, undefined);
      const b = generateParallaxStrip(layer, 7, 160, 90, undefined, undefined);
      expect(a.equals(b)).toBe(true);
    }
  });

  it('declares an unrecognized feature explicitly instead of silently ignoring it', () => {
    const { supported, unsupported } = partitionBackgroundFeatures(['corrosion', 'panel_grates', 'lava_flow']);
    expect(supported).toEqual(['corrosion']);
    expect(unsupported).toEqual(['panel_grates', 'lava_flow']);
    expect(BACKGROUND_SUPPORTED_FEATURES).not.toContain('panel_grates');
  });

  it('never applies material features to the far layer (protects the outdoor-landscape QA check)', () => {
    const plain = generateParallaxStrip('far', 7, 160, 90, [[20, 60, 30], [40, 90, 50], [60, 120, 70]]);
    const featured = generateParallaxStrip('far', 7, 160, 90, [[20, 60, 30], [40, 90, 50], [60, 120, 70]], [
      'vegetation',
      'corrosion',
    ]);
    expect(plain.equals(featured)).toBe(true);
  });

  it('applying a feature to the near layer changes pixels but only on already-opaque architecture, never introducing new opaque area', () => {
    const palette: [number, number, number][] = [
      [20, 30, 25],
      [40, 60, 45],
      [70, 100, 75],
      [90, 130, 95],
      [30, 120, 40],
      [50, 140, 60],
    ];
    const base = decodePngRgba(generateParallaxStrip('near', 21, 320, 180, palette));
    const featured = decodePngRgba(generateParallaxStrip('near', 21, 320, 180, palette, ['vegetation', 'corrosion']));
    let changed = 0;
    for (let i = 0; i < base.rgba.length; i += 4) {
      // Alpha channel must be untouched by material dressing — only color, never transparency.
      expect(featured.rgba[i + 3]).toBe(base.rgba[i + 3]);
      if (base.rgba[i] !== featured.rgba[i] || base.rgba[i + 1] !== featured.rgba[i + 1] || base.rgba[i + 2] !== featured.rgba[i + 2]) {
        changed++;
        expect(base.rgba[i + 3]).toBeGreaterThanOrEqual(40); // only dressed where already opaque
      }
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('same seed + features reproduces identical output; a different seed varies it', () => {
    const palette: [number, number, number][] = [[15, 30, 40], [40, 60, 70], [80, 110, 120], [100, 130, 140], [90, 60, 40], [60, 100, 60]];
    const a = generateParallaxStrip('mid', 55, 320, 180, palette, ['corrosion', 'stains']);
    const b = generateParallaxStrip('mid', 55, 320, 180, palette, ['corrosion', 'stains']);
    const c = generateParallaxStrip('mid', 99, 320, 180, palette, ['corrosion', 'stains']);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
