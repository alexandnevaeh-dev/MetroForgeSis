import { describe, expect, it } from 'vitest';
import { TileCompiler, TILE_ATLAS } from '../src/tile-compiler.js';
import { decodePngRgba, encodePng } from '../src/png.js';
import { critiqueAnimationIdentity, assembleContactSheet } from '../src/sprite-qa.js';
import { generateWalkCycleSheet, generateProceduralSprite } from '../src/png.js';

/** Distinct opaque RGB combinations within a tile's 1px-inset interior (the border row/col is
 * deliberately left as a flat shared-edge color for autotile seam matching — see
 * tile-compiler.ts's paintTile()/measureSeams(), so it must be excluded from a "is this tile
 * textured" measurement or a real regression there would be masked by the untextured border). */
function distinctInteriorColors(tilePng: Buffer): number {
  const { rgba, width, height } = decodePngRgba(tilePng);
  const seen = new Set<number>();
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3]! < 16) continue;
      seen.add((rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!);
    }
  }
  return seen.size;
}

/** Population variance of per-pixel luminance within a tile's interior. A perfectly flat fill
 * (the bug this phase fixes) has variance 0; any real texture/dither/material pattern pushes it
 * well above 0. */
function interiorLuminanceVariance(tilePng: Buffer): number {
  const { rgba, width, height } = decodePngRgba(tilePng);
  const lums: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3]! < 16) continue;
      lums.push(0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!);
    }
  }
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
  return lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length;
}

function interiorMeanLuma(tilePng: Buffer): number {
  const { rgba, width, height } = decodePngRgba(tilePng);
  const lums: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3]! < 16) continue;
      lums.push(0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!);
    }
  }
  return lums.reduce((a, b) => a + b, 0) / lums.length;
}
function syntheticBiomeSourcePng(size = 96): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const band = Math.floor((x + y) / 6) % 2;
      const ripple = ((x * 13 + y * 29) % 17) - 8; // small deterministic local variation
      const base = band === 0 ? 120 : 70;
      const v = Math.max(0, Math.min(255, base + ripple));
      const i = (y * size + x) * 4;
      rgba[i] = v;
      rgba[i + 1] = Math.max(0, Math.min(255, v + 20));
      rgba[i + 2] = Math.max(0, Math.min(255, v - 10));
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

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

  it('does not paint tiles as a flat single-color block even with no AI source image (procedural fallback)', () => {
    // opts.sourcePng is undefined here — this is the common local-dev path (no image provider
    // configured), which must still produce real, non-flat texture, not just a different flat fill.
    const compiled = new TileCompiler().compile({
      tileSize: 32,
      paletteHex: ['#141820', '#3c4454', '#5a8cdc', '#c84848'],
    });
    const ground = compiled.tiles.get('tile_0_0')!;
    const wall = compiled.tiles.get('tile_1_0')!;
    const breakable = compiled.tiles.get('tile_4_2')!;
    expect(distinctInteriorColors(ground)).toBeGreaterThanOrEqual(4);
    expect(interiorLuminanceVariance(ground)).toBeGreaterThan(4);
    expect(distinctInteriorColors(wall)).toBeGreaterThanOrEqual(4);
    // breakable should read distinctly cracked (higher-contrast interior) rather than a flat slab.
    expect(distinctInteriorColors(breakable)).toBeGreaterThanOrEqual(4);
    expect(compiled.passed).toBe(true);
    expect(compiled.seamIssues).toEqual([]);
  });

  it('inherits real spatial texture patterns from an AI-generated source image, not just its dominant flat color', () => {
    const source = syntheticBiomeSourcePng();
    const compiled = new TileCompiler().compile({
      sourcePng: source,
      tileSize: 32,
      paletteHex: ['#141820', '#3c4454', '#5a8cdc', '#c84848'],
    });
    const ground = compiled.tiles.get('tile_0_0')!;
    const ceiling = compiled.tiles.get('tile_2_0')!;
    expect(distinctInteriorColors(ground)).toBeGreaterThanOrEqual(4);
    expect(interiorLuminanceVariance(ground)).toBeGreaterThan(4);
    expect(distinctInteriorColors(ceiling)).toBeGreaterThanOrEqual(4);
    expect(compiled.passed).toBe(true);
    expect(compiled.seamIssues).toEqual([]);
  });

  it('does not use sky/cream as walkable ground and keeps ground darker than walls', () => {
    const cream = encodePng(48, 48, (() => {
      const rgba = new Uint8Array(48 * 48 * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 232;
        rgba[i + 1] = 224;
        rgba[i + 2] = 208;
        rgba[i + 3] = 255;
      }
      return rgba;
    })());
    const compiled = new TileCompiler().compile({ sourcePng: cream, tileSize: 16 });
    const ground = compiled.tiles.get('tile_0_0')!;
    const wall = compiled.tiles.get('tile_1_0')!;
    const platform = compiled.tiles.get('tile_3_0')!;
    expect(interiorMeanLuma(ground)).toBeLessThan(140);
    expect(interiorMeanLuma(ground)).toBeLessThan(interiorMeanLuma(wall) - 4);
    expect(Math.abs(interiorMeanLuma(platform) - interiorMeanLuma(ground))).toBeGreaterThan(4);
    expect(compiled.passed).toBe(true);
  });

  it('does not turn a gameplay style-bible (sky/grass/gold) into lime ledges or night-dark stone', () => {
    const compiled = new TileCompiler().compile({
      tileSize: 32,
      paletteHex: ['#284878', '#3ca064', '#dcb432', '#e87850'],
    });
    const ground = compiled.tiles.get('tile_0_0')!;
    const wall = compiled.tiles.get('tile_1_0')!;
    const platform = compiled.tiles.get('tile_3_0')!;
    const gL = interiorMeanLuma(ground);
    const wL = interiorMeanLuma(wall);
    const pL = interiorMeanLuma(platform);
    expect(wL).toBeGreaterThanOrEqual(60);
    expect(gL).toBeLessThan(wL - 4);
    const { rgba, width, height } = decodePngRgba(platform);
    let greenVotes = 0;
    let n = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        if (rgba[i + 3]! < 16) continue;
        n++;
        if (rgba[i + 1]! > rgba[i]! + 20 && rgba[i + 1]! > rgba[i + 2]! + 15) greenVotes++;
      }
    }
    expect(greenVotes / Math.max(n, 1)).toBeLessThan(0.35);
    expect(pL).toBeGreaterThan(gL + 4);
    const wallPx = decodePngRgba(wall);
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;
    for (let y = 1; y < wallPx.height - 1; y++) {
      for (let x = 1; x < wallPx.width - 1; x++) {
        const i = (y * wallPx.width + x) * 4;
        if (wallPx.rgba[i + 3]! < 16) continue;
        rSum += wallPx.rgba[i]!;
        gSum += wallPx.rgba[i + 1]!;
        bSum += wallPx.rgba[i + 2]!;
        count++;
      }
    }
    const wr = rSum / count;
    const wg = gSum / count;
    const wb = bSum / count;
    expect(wg).toBeGreaterThan(wr + 2);
    expect(wb).toBeGreaterThan(wr);
    expect(wb - wg).toBeLessThan(18);
  });

  it('keeps every role at its documented atlas (col,row) — tile-layout.ts/room-assembler.ts depend on this exact mapping', () => {
    expect(TILE_ATLAS.roles.ground).toEqual({ col: 0, row: 0 });
    expect(TILE_ATLAS.roles.wall).toEqual({ col: 1, row: 0 });
    expect(TILE_ATLAS.roles.breakable).toEqual({ col: 4, row: 2 });
    expect(TILE_ATLAS.roles.decor_b).toEqual({ col: 7, row: 2 });
    expect(Object.keys(TILE_ATLAS.roles)).toHaveLength(24);
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
