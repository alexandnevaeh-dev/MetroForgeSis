import { describe, it, expect } from 'vitest';
import { encodePng } from './png.js';
import { critiqueGameplayScreenshot } from './scene-critic.js';

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
    expect(result.passed).toBe(true);
    expect(result.uniqueColors).toBeGreaterThanOrEqual(4);
    expect(result.tags).toContain('gameplay-screenshot');
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

  it('fails undersized images', () => {
    const result = critiqueGameplayScreenshot(solidPng(32, 32, [20, 80, 20, 255]));
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.includes('smaller'))).toBe(true);
  });
});
