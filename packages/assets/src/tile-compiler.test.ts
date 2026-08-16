import { describe, expect, it } from 'vitest';
import { TileCompiler, TILE_ATLAS } from '../src/tile-compiler.js';
import { decodePngRgba } from '../src/png.js';
import { critiqueAnimationIdentity, assembleContactSheet } from '../src/sprite-qa.js';
import { generateWalkCycleSheet, generateProceduralSprite } from '../src/png.js';

describe('TileCompiler', () => {
  it('emits a fixed autotile atlas with uniform tile size and no hard seam fail', () => {
    const compiled = new TileCompiler().compile({
      tileSize: 32,
      paletteHex: ['#141820', '#3c4454', '#5a8cdc', '#c84848'],
    });
    expect(compiled.width).toBe(TILE_ATLAS.cols * 32);
    expect(compiled.height).toBe(TILE_ATLAS.rows * 32);
    expect(compiled.tiles.size).toBeGreaterThan(8);
    const ground = compiled.tiles.get('tile_0_0');
    expect(ground).toBeTruthy();
    const decoded = decodePngRgba(ground!);
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(32);
    expect(compiled.passed).toBe(true);
  });
});

describe('sprite animation identity', () => {
  it('flags a bob walk cycle as fake animation', () => {
    const still = generateProceduralSprite({
      id: 'p',
      width: 32,
      height: 32,
      fill: [90, 140, 220, 255],
      shape: 'humanoid',
    });
    const sheet = generateWalkCycleSheet(
      { id: 'p', width: 32, height: 32, fill: [90, 140, 220, 255], shape: 'humanoid' },
      4,
      still,
    );
    const qa = critiqueAnimationIdentity(sheet, { frameWidth: 32, expectedFrames: 4, kind: 'walk' });
    expect(qa.fakeAnimation || !qa.checks.notFakeBobCycle).toBe(true);
  });

  it('builds a contact sheet from frames', () => {
    const still = generateProceduralSprite({
      id: 'p',
      width: 16,
      height: 16,
      fill: [20, 80, 20, 255],
      shape: 'humanoid',
    });
    const sheet = assembleContactSheet([
      { label: 'a', png: still },
      { label: 'b', png: still },
    ]);
    const decoded = decodePngRgba(sheet);
    expect(decoded.width).toBeGreaterThan(16);
    expect(decoded.height).toBeGreaterThan(0);
  });
});
