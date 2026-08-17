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
    expect(farPlateLooksLikeOutdoorLandscape(generateParallaxStrip('far', 7, w, h))).toBe(false);
  });
});
