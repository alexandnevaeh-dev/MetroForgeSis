import { describe, expect, it } from 'vitest';
import { decodePngRgba, encodePng } from '../src/png.js';
import { generateParallaxStrip, punchParallaxAlpha, farPlateLooksLikeOutdoorLandscape } from '../src/parallax-strip.js';

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
    const { rgba, width, height } = decodePngRgba(generateParallaxStrip('far', 7, 160, 90));
    let mass = 0;
    let sampled = 0;
    for (let y = Math.floor(height * 0.55); y < height; y++) {
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

  it('renders a warm foundry far plate (not navy) when a mechanical-forge palette is supplied', () => {
    const palette = {
      global: ['#101018', '#8a6840', '#48b8c8', '#a84830'],
      shadows: ['#07070b', '#3e2f1d', '#20535a', '#4c2016'],
      highlights: ['#14141e', '#ad8250', '#5ae6fa', '#d25a3c'],
    };
    const { rgba, width, height } = decodePngRgba(generateParallaxStrip('far', 7, 160, 90, palette));
    let rSum = 0;
    let bSum = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      rSum += rgba[i]!;
      bSum += rgba[i + 2]!;
    }
    // Warm soot/ember gradient: red channel now leads blue (the navy default was blue-dominant).
    expect(rSum).toBeGreaterThan(bSum);
    // Still a dark backdrop plate, not a bright vista.
    let luma = 0;
    for (let i = 0; i < rgba.length; i += 4) luma += 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
    expect(luma / (width * height)).toBeLessThan(90);
    expect(farPlateLooksLikeOutdoorLandscape(generateParallaxStrip('far', 7, 640, 360, palette))).toBe(false);
  });

  it('paints near-parallax chains as warm soot shadows, not cold blue beacons, for a foundry palette', () => {
    const palette = {
      global: ['#101018', '#8a6840', '#48b8c8', '#a84830'],
      shadows: ['#07070b', '#3e2f1d', '#20535a', '#4c2016'],
      highlights: ['#14141e', '#ad8250', '#5ae6fa', '#d25a3c'],
    };
    const { rgba } = decodePngRgba(generateParallaxStrip('near', 31, 160, 90, palette));
    let blueDominant = 0;
    let opaque = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3]! < 40) continue;
      opaque += 1;
      if (rgba[i + 2]! > rgba[i]! + 2) blueDominant += 1; // blue clearly ahead of red
    }
    expect(opaque).toBeGreaterThan(0);
    // The old blue-black chains were blue-dominant; warm soot shadows keep blue <= red.
    expect(blueDominant / opaque).toBeLessThan(0.02);
  });

  it('paints far-plate vault ribs/lanterns warm (not the hardcoded cold-blue beacons) for a foundry palette', () => {
    const palette = {
      global: ['#101018', '#8a6840', '#48b8c8', '#a84830'],
      shadows: ['#07070b', '#3e2f1d', '#20535a', '#4c2016'],
      highlights: ['#14141e', '#ad8250', '#5ae6fa', '#d25a3c'],
    };
    const { rgba } = decodePngRgba(generateParallaxStrip('far', 7, 160, 90, palette));
    // The old vault ribs were (34,52,108): blue clearly ahead of red. Warm ribs keep red >= blue.
    let coldBlue = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 2]! > rgba[i]! + 20) coldBlue += 1;
    }
    expect(coldBlue).toBe(0);
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
