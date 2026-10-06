import { describe, expect, it } from 'vitest';
import { encodePng, decodePngRgba } from '../png.js';
import { reconcileAlpha } from './alpha-reconciliation.js';

/** Opaque colorful square — simulates an AI edit provider that ignored the transparency request. */
function opaqueRgb(size: number): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = (i * 5) % 255;
    rgba[i * 4 + 1] = (i * 7) % 255;
    rgba[i * 4 + 2] = (i * 11) % 255;
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(size, size, rgba);
}

/** Procedural-style sprite: opaque center circle, transparent elsewhere — a real silhouette. */
function silhouette(size: number): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = (x - cx) ** 2 + (y - cy) ** 2 < r * r;
      rgba[i] = 80;
      rgba[i + 1] = 120;
      rgba[i + 2] = 200;
      rgba[i + 3] = inside ? 255 : 0;
    }
  }
  return encodePng(size, size, rgba);
}

/** AI output that DOES have real transparency of its own. */
function realTransparentOutput(size: number): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      rgba[i] = 200;
      rgba[i + 1] = 100;
      rgba[i + 2] = 50;
      rgba[i + 3] = x < size / 2 ? 255 : 0;
    }
  }
  return encodePng(size, size, rgba);
}

describe('reconcileAlpha', () => {
  it('composites AI RGB onto the source silhouette when the AI output is fully opaque', () => {
    const ai = opaqueRgb(32);
    const source = silhouette(32);
    const result = reconcileAlpha(ai, source);
    expect(result.passthrough).toBe(false);

    const decoded = decodePngRgba(result.buffer);
    // Corner (outside the source silhouette) should now be transparent, matching the source mask.
    const cornerAlpha = decoded.rgba[3];
    expect(cornerAlpha).toBe(0);
    // Center (inside the source silhouette) should be opaque and carry the AI's RGB, not the source's.
    const centerIdx = (16 * 32 + 16) * 4;
    expect(decoded.rgba[centerIdx + 3]).toBe(255);
  });

  it('preserves output dimensions matching the source, even when the AI output has different dimensions', () => {
    const ai = opaqueRgb(64); // AI returned a different size than requested
    const source = silhouette(32);
    const result = reconcileAlpha(ai, source);
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
  });

  it('passes through unchanged (resized only) when the AI output already has real transparency', () => {
    const ai = realTransparentOutput(32);
    const source = silhouette(32);
    const result = reconcileAlpha(ai, source);
    expect(result.passthrough).toBe(true);
    const decoded = decodePngRgba(result.buffer);
    // Right half should still be transparent from the AI's own output, not overridden by source mask.
    const rightIdx = (16 * 32 + 24) * 4;
    expect(decoded.rgba[rightIdx + 3]).toBe(0);
  });

  it('mask dilation grows the opaque region outward from the source silhouette', () => {
    const ai = opaqueRgb(32);
    const source = silhouette(32);
    const withoutDilation = reconcileAlpha(ai, source);
    const withDilation = reconcileAlpha(ai, source, { maskDilatePx: 3 });

    const countOpaque = (buf: Buffer) => {
      const decoded = decodePngRgba(buf);
      let count = 0;
      for (let i = 0; i < decoded.rgba.length; i += 4) if (decoded.rgba[i + 3]! > 0) count++;
      return count;
    };
    expect(countOpaque(withDilation.buffer)).toBeGreaterThan(countOpaque(withoutDilation.buffer));
  });

  it('mask feathering produces intermediate alpha values at the silhouette edge instead of a hard cut', () => {
    const ai = opaqueRgb(32);
    const source = silhouette(32);
    const feathered = reconcileAlpha(ai, source, { maskFeatherPx: 2 });
    const decoded = decodePngRgba(feathered.buffer);
    const alphas = new Set<number>();
    for (let i = 3; i < decoded.rgba.length; i += 4) alphas.add(decoded.rgba[i]!);
    // A hard-edged mask only ever has 0 or 255; feathering should introduce values in between.
    const hasIntermediate = [...alphas].some((a) => a > 0 && a < 255);
    expect(hasIntermediate).toBe(true);
  });
});
