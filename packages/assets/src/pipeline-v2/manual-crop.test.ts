import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyManualCropRecipe, type ManualCropRecipe } from './manual-crop.js';
import { encodePng, decodePngRgba } from '../png.js';

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function checkerboardPng(w: number, h: number): Buffer {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Left half red, right half blue -- makes a crop's content independently verifiable.
      const isRight = x >= w / 2;
      rgba[i] = isRight ? 0 : 255;
      rgba[i + 1] = 0;
      rgba[i + 2] = isRight ? 255 : 0;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(w, h, rgba);
}

function recipe(overrides: Partial<ManualCropRecipe> = {}, sourceHash: string): ManualCropRecipe {
  return {
    assetId: 'test_asset',
    sourceHash,
    crop: { x0: 4, y0: 0, x1: 7, y1: 7 },
    reason: 'test',
    recordedBy: 'test-suite',
    recordedAt: '2026-09-06',
    ...overrides,
  };
}

describe('applyManualCropRecipe — reproducible, hash-bound manual selection (not automatic detection)', () => {
  it('is a no-op when no recipe is supplied — every existing/other asset unaffected', () => {
    const source = checkerboardPng(8, 8);
    const result = applyManualCropRecipe(source, undefined);
    expect(result.applied).toBe(false);
    expect(result.buffer).toBe(source);
    expect(result.actualSourceHash).toBe(sha256(source));
  });

  it('applies the exact recorded crop when the source hash matches', () => {
    const source = checkerboardPng(8, 8);
    const hash = sha256(source);
    const result = applyManualCropRecipe(source, recipe({}, hash));
    expect(result.applied).toBe(true);
    expect(result.cropRect).toEqual({ x0: 4, y0: 0, x1: 7, y1: 7 });
    expect(result.recordedBy).toBe('test-suite');

    const { rgba, width, height } = decodePngRgba(result.buffer);
    expect(width).toBe(4);
    expect(height).toBe(8);
    // The right half of the checkerboard was blue (0,0,255) -- confirm the crop actually took the
    // right region, not just returned a same-sized copy.
    expect(rgba[0]).toBe(0);
    expect(rgba[2]).toBe(255);
  });

  it('rejects (throws) a source-hash mismatch rather than silently applying the wrong crop', () => {
    const source = checkerboardPng(8, 8);
    const wrongHash = sha256(checkerboardPng(16, 16));
    expect(() => applyManualCropRecipe(source, recipe({}, wrongHash))).toThrow(/MANUAL_CROP_SOURCE_HASH_MISMATCH/);
  });

  it('rejects (throws) an out-of-bounds crop rectangle', () => {
    const source = checkerboardPng(8, 8);
    const hash = sha256(source);
    expect(() => applyManualCropRecipe(source, recipe({ crop: { x0: 0, y0: 0, x1: 100, y1: 100 } }, hash))).toThrow(/MANUAL_CROP_INVALID_BOUNDS/);
  });

  it('rejects (throws) a degenerate (zero-area or inverted) crop rectangle', () => {
    const source = checkerboardPng(8, 8);
    const hash = sha256(source);
    expect(() => applyManualCropRecipe(source, recipe({ crop: { x0: 5, y0: 5, x1: 5, y1: 5 } }, hash))).toThrow(/MANUAL_CROP_INVALID_BOUNDS/);
    expect(() => applyManualCropRecipe(source, recipe({ crop: { x0: 5, y0: 5, x1: 2, y1: 7 } }, hash))).toThrow(/MANUAL_CROP_INVALID_BOUNDS/);
  });

  it('changed bytes are never mistaken for a prior selection -- a different (even 1-byte-different) source fails the same recipe', () => {
    const source = checkerboardPng(8, 8);
    const hash = sha256(source);
    const mutated = Buffer.from(source);
    mutated[mutated.length - 1] = mutated[mutated.length - 1]! ^ 0xff;
    expect(() => applyManualCropRecipe(mutated, recipe({}, hash))).toThrow(/MANUAL_CROP_SOURCE_HASH_MISMATCH/);
  });
});
