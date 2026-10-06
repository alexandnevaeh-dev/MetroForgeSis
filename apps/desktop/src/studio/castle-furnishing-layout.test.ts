import { describe, it, expect } from 'vitest';
import { furnishingSilhouette, validFurnishingAsset, type CastleFurnishing } from './castle-furnishing-layout.js';

describe('native-compatible furnishing grounding', () => {
  it('grounds the largest silhouette while ignoring scraps below it and faint pixels', () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    for (const [x, y] of [[2, 1], [3, 2], [4, 3], [2, 2], [3, 3], [7, 7]]) pixels[(y! * 8 + x!) * 4 + 3] = 255;
    pixels[(6 * 8 + 3) * 4 + 3] = 30;
    expect(furnishingSilhouette(pixels, 8, 8)).toEqual({ bottomInset: 4, halfWidth: 1.5 });
  });
  it('keeps native defaults for an empty silhouette', () => {
    expect(furnishingSilhouette(new Uint8ClampedArray(4 * 3 * 4), 4, 3)).toEqual({ bottomInset: 0, halfWidth: 2 });
  });
  it('rejects traversal and asset-role substitution before loading artwork', () => {
    const valid: CastleFurnishing = { id: 'RegionFurnishing_test', sectionId: 'test', chamberName: 'Study', role: 'lancet_window', asset: 'assets/architecture/stormglass/lancet_window.png', x: 640, floorY: 1024, targetHeight: 224, mounting: 'rear-wall' };
    expect(validFurnishingAsset(valid)).toBe(true);
    expect(validFurnishingAsset({ ...valid, asset: '../secret.png' })).toBe(false);
    expect(validFurnishingAsset({ ...valid, role: 'intact_statue' })).toBe(false);
    expect(validFurnishingAsset({ ...valid, x: Number.NaN })).toBe(false);
    expect(validFurnishingAsset({ ...valid, targetHeight: 1024 })).toBe(false);
  });
});
