import { describe, expect, it } from 'vitest';
import { decodePngRgba, encodePng } from '../src/png.js';
import { generateParallaxStrip, punchParallaxAlpha } from '../src/parallax-strip.js';

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
  it('paints far as an opaque sky+horizon plate', () => {
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

  it('paints compact mid/near ridgeline strips that are mostly filled', () => {
    const mid = generateParallaxStrip('mid', 11, 160, 40);
    const near = generateParallaxStrip('near', 13, 160, 36);
    expect(decodePngRgba(mid).height).toBe(40);
    expect(decodePngRgba(near).height).toBe(36);
    expect(countAlpha(mid, (a) => a > 200)).toBeGreaterThan(160 * 40 * 0.45);
    expect(countAlpha(near, (a) => a > 200)).toBeGreaterThan(160 * 36 * 0.45);
    expect(countAlpha(mid, (a, t) => t < 0.08 && a < 16)).toBeGreaterThan(40);
  });

  it('punches stacked AI landscapes into horizon strips', () => {
    const rgba = new Uint8Array(80 * 40 * 4);
    rgba.fill(255);
    const plate = encodePng(80, 40, rgba);
    const mid = punchParallaxAlpha(plate, 'mid');
    expect(countAlpha(mid, (a, t) => t < 0.25 && a < 16)).toBeGreaterThan(80 * 8);
    expect(punchParallaxAlpha(plate, 'far')).toEqual(plate);
  });
});
