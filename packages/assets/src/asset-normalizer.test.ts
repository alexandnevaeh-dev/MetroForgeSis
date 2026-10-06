import { describe, expect, it } from 'vitest';
import { encodePng } from './png.js';
import { validateTechnicalPng } from './asset-normalizer.js';

describe('technical image validation', () => {
  it('accepts a visible PNG with expected dimensions', () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 255;
      rgba[i + 3] = 255;
    }
    const result = validateTechnicalPng(encodePng(4, 4, rgba), { width: 4, height: 4 });
    expect(result.valid).toBe(true);
    expect(result.visiblePixels).toBe(16);
  });

  it('rejects blank and dimension-mismatched PNGs', () => {
    const result = validateTechnicalPng(encodePng(2, 2, new Uint8Array(16)), { width: 4, height: 4, requireAlpha: true });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(['width 2 != 4', 'height 2 != 4', 'blank or fully transparent image']));
  });

  it('rejects malformed image bytes before visual analysis', () => {
    const result = validateTechnicalPng(Buffer.from('not-png'));
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
