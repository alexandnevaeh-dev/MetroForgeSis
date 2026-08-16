import { describe, it, expect } from 'vitest';
import { encodePng } from './png.js';
import { critiqueGameplayScreenshot, critiqueScreenshotDiversity } from './scene-critic.js';

function fillRect(
  rgba: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number, number],
): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
}

function solidPng(width: number, height: number, color: [number, number, number, number]): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  fillRect(rgba, width, 0, 0, width, height, color);
  return encodePng(width, height, rgba);
}

function composedGameplayPng(): Buffer {
  const width = 160;
  const height = 90;
  const rgba = new Uint8Array(width * height * 4);
  fillRect(rgba, width, 0, 0, width, height, [18, 22, 40, 255]);
  fillRect(rgba, width, 20, 8, 52, 48, [168, 196, 228, 255]);
  fillRect(rgba, width, 70, 10, 110, 50, [150, 180, 214, 255]);
  fillRect(rgba, width, 0, 68, width, height, [92, 58, 36, 255]);
  fillRect(rgba, width, 4, 2, 70, 10, [48, 190, 72, 255]);
  fillRect(rgba, width, 76, 3, 92, 9, [210, 50, 50, 255]);
  fillRect(rgba, width, 48, 46, 60, 68, [90, 150, 230, 255]);
  return encodePng(width, height, rgba);
}

describe('critiqueGameplayScreenshot', () => {
  it('passes a structured HUD + world frame', () => {
    const result = critiqueGameplayScreenshot(composedGameplayPng());
    expect(result.blank).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.uniqueColors).toBeGreaterThanOrEqual(4);
    expect(result.tags).toContain('gameplay-screenshot');
  });

  it('passes a 4-color HUD + floor + player fixture', () => {
    const width = 160;
    const height = 90;
    const rgba = new Uint8Array(width * height * 4);
    fillRect(rgba, width, 0, 0, width, height, [18, 22, 40, 255]);
    fillRect(rgba, width, 24, 10, 70, 46, [170, 198, 230, 255]);
    fillRect(rgba, width, 0, 68, width, height, [92, 58, 36, 255]);
    fillRect(rgba, width, 4, 2, 70, 10, [48, 190, 72, 255]);
    fillRect(rgba, width, 48, 46, 60, 68, [90, 150, 230, 255]);
    const result = critiqueGameplayScreenshot(encodePng(width, height, rgba));
    expect(result.issues).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('marks a black frame as blank rather than a content failure', () => {
    const result = critiqueGameplayScreenshot(solidPng(160, 90, [0, 0, 0, 255]));
    expect(result.blank).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.toLowerCase().includes('blank'))).toBe(true);
  });

  it('fails a solid white frame as too uniform', () => {
    const result = critiqueGameplayScreenshot(solidPng(160, 90, [255, 255, 255, 255]));
    expect(result.blank).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.includes('solid') || issue.includes('flat'))).toBe(true);
  });

  it('fails corrupt input', () => {
    const result = critiqueGameplayScreenshot(Buffer.from('not-a-png'));
    expect(result.passed).toBe(false);
    expect(result.blank).toBe(false);
  });

  it('fails occupancy≈1 with lumaStdDev~5 even when many similar hues are present', () => {
    const width = 160;
    const height = 90;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const n = (x + y) % 7;
        const i = (y * width + x) * 4;
        rgba[i] = 36 + n;
        rgba[i + 1] = 42 + n;
        rgba[i + 2] = 50 + n;
        rgba[i + 3] = 255;
      }
    }
    const result = critiqueGameplayScreenshot(encodePng(width, height, rgba));
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(70);
    expect(result.issues.some((issue) => issue.includes('wallpapered') || issue.includes('occupancy'))).toBe(
      true,
    );
  });

  it('fails a dimmed victory overlay capture', () => {
    const width = 160;
    const height = 90;
    const rgba = new Uint8Array(width * height * 4);
    fillRect(rgba, width, 0, 0, width, height, [22, 24, 30, 255]);
    fillRect(rgba, width, 64, 44, 96, 48, [180, 210, 240, 255]);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = Math.min(255, rgba[i]! + ((x + y) % 3));
        rgba[i + 1] = Math.min(255, rgba[i + 1]! + ((x + y) % 3));
        rgba[i + 2] = Math.min(255, rgba[i + 2]! + ((x + y) % 3));
      }
    }
    const result = critiqueGameplayScreenshot(encodePng(width, height, rgba));
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(70);
    expect(
      result.issues.some(
        (issue) => issue.includes('wallpapered') || issue.includes('occupancy') || issue.includes('flat'),
      ),
    ).toBe(true);
  });

  it('fails a wallpapered near-solid frame as excessively cluttered', () => {
    const rgba = new Uint8Array(160 * 90 * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 40;
      rgba[i + 1] = 44;
      rgba[i + 2] = 50;
      rgba[i + 3] = 255;
    }
    const result = critiqueGameplayScreenshot(encodePng(160, 90, rgba));
    expect(result.blank).toBe(false);
    expect(result.passed).toBe(false);
    expect(
      result.issues.some(
        (issue) =>
          issue.includes('cluttered') ||
          issue.includes('flat') ||
          issue.includes('solid') ||
          issue.includes('wallpapered'),
      ),
    ).toBe(true);
  });

  it('fails a set of identical room captures as copies', () => {
    const copy = composedGameplayPng();
    const result = critiqueScreenshotDiversity([copy, copy, copy]);
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('fails undersized images', () => {
    const result = critiqueGameplayScreenshot(solidPng(32, 32, [20, 80, 20, 255]));
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.includes('smaller'))).toBe(true);
  });
});
