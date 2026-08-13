import { describe, it, expect } from 'vitest';
import { encodePng, generateProceduralSprite, generateWalkCycleSheet, generateAttackSheet, generateVfxTexture } from '../src/png.js';
import { PixelArtProcessor } from '../src/pixel-art-processor.js';
import { runDeterministicAssetChecks } from '../src/vlm-critic.js';

describe('PNG encoder', () => {
  it('encodes valid PNG', () => {
    const png = generateProceduralSprite({
      id: 'test',
      width: 16,
      height: 16,
      fill: [255, 0, 0, 255],
      shape: 'humanoid',
    });
    expect(png[0]).toBe(137);
    expect(png.toString('ascii', 1, 4)).toBe('PNG');
  });

  it('generates VFX burst textures', () => {
    const png = generateVfxTexture({
      id: 'hit_spark',
      size: 16,
      core: [255, 240, 120, 255],
      edge: [255, 80, 40, 255],
      style: 'burst',
    });
    expect(png[0]).toBe(137);
    const check = runDeterministicAssetChecks(png, 16, 16);
    expect(check.passed).toBe(true);
  });

  it('generates walk cycle spritesheet', () => {
    const base = generateProceduralSprite({
      id: 'player',
      width: 32,
      height: 32,
      fill: [90, 140, 220, 255],
      shape: 'humanoid',
    });
    const sheet = generateWalkCycleSheet(
      {
        id: 'player',
        width: 32,
        height: 32,
        fill: [90, 140, 220, 255],
        shape: 'humanoid',
      },
      4,
      base,
    );
    const check = runDeterministicAssetChecks(sheet, 128, 32);
    expect(check.passed).toBe(true);
  });

  it('generates attack swing spritesheet', () => {
    const base = generateProceduralSprite({
      id: 'enemy',
      width: 32,
      height: 32,
      fill: [200, 40, 40, 255],
      shape: 'enemy',
    });
    const sheet = generateAttackSheet(
      {
        id: 'enemy',
        width: 32,
        height: 32,
        fill: [200, 40, 40, 255],
        shape: 'enemy',
      },
      4,
      base,
    );
    const check = runDeterministicAssetChecks(sheet, 128, 32);
    expect(check.passed).toBe(true);
    expect(sheet.equals(base)).toBe(false);
  });

  it('round-trips through pixel art processor', () => {
    const source = generateProceduralSprite({
      id: 'test',
      width: 32,
      height: 32,
      fill: [90, 140, 220, 255],
      shape: 'enemy',
    });
    const processor = new PixelArtProcessor();
    const result = processor.process(source, { targetWidth: 16, targetHeight: 16, tileSize: 16 });
    const check = runDeterministicAssetChecks(result.buffer, 16, 16);
    expect(check.passed).toBe(true);
  });
});

describe('PixelArtProcessor sliceTiles', () => {
  it('slices tileset into tiles', () => {
    const rgba = new Uint8Array(32 * 32 * 4);
    rgba.fill(255);
    const source = encodePng(32, 32, rgba);
    const processor = new PixelArtProcessor();
    const tiles = processor.sliceTiles(source, 16);
    expect(tiles.size).toBe(4);
  });
});
