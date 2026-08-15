import { describe, it, expect } from 'vitest';
import { encodePng, decodePngRgba, generateProceduralSprite, generateWalkCycleSheet, generateAttackSheet, generateVfxTexture, knockoutVfxBackground } from '../src/png.js';
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

describe('knockoutVfxBackground', () => {
  it('turns magenta chrome into alpha while keeping the spark', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 255;
      rgba[i + 1] = 0;
      rgba[i + 2] = 255;
      rgba[i + 3] = 255;
    }
    const center = (8 * width + 8) * 4;
    rgba[center] = 255;
    rgba[center + 1] = 240;
    rgba[center + 2] = 80;
    rgba[center + 3] = 255;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[3]).toBe(0);
    expect(decoded.rgba[center + 3]).toBeGreaterThan(0);
  });
});
