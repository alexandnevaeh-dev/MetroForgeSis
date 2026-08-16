import { describe, it, expect } from 'vitest';
import { encodePng, decodePngRgba } from '../png.js';
import { compileForRequest, SpriteCompiler } from './compilers.js';
import { runFoundryQA } from './qa.js';
import type { AssetRequest } from '@metroforge/schemas';

function opaquePng(width: number, height: number, rgb: [number, number, number] = [40, 90, 180]): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rgb[0];
    rgba[i * 4 + 1] = rgb[1];
    rgba[i * 4 + 2] = rgb[2];
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(width, height, rgba);
}

function transPng(width: number, height: number): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const on = x > 2 && x < width - 2 && y > 2 && y < height - 2;
      rgba[i] = 200;
      rgba[i + 1] = 40;
      rgba[i + 2] = 40;
      rgba[i + 3] = on ? 255 : 0;
    }
  }
  return encodePng(width, height, rgba);
}

const baseRequest = (overrides: Partial<AssetRequest> = {}): AssetRequest =>
  ({
    id: 'icon_test',
    assetType: 'icon',
    prompt: 'generic ui gem icon',
    style: { visualStyle: 'high-contrast pixel fantasy', pixelArt: true },
    dimensions: { width: 16, height: 16 },
    output: { engine: 'godot', transparentBackground: false },
    constraints: { commercialUseRequired: false, freeOnly: false },
    consistency: {},
    ...overrides,
  }) as AssetRequest;

describe('foundry compilers', () => {
  it('normalizes sprite dimensions', () => {
    const compiled = new SpriteCompiler().compile(transPng(64, 48), baseRequest());
    expect(compiled.width).toBe(16);
    expect(compiled.height).toBe(16);
    expect(compiled.transformations).toContain('nearest-neighbor');
  });

  it('preserves transparency after compile', () => {
    const compiled = compileForRequest(transPng(32, 32), baseRequest());
    const qa = runFoundryQA(compiled.buffer, baseRequest());
    expect(qa.passed).toBe(true);
  });

  it('knocks out a pale studio square so character sprites keep alpha', () => {
    const width = 24;
    const height = 24;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = 235;
      rgba[i * 4 + 1] = 238;
      rgba[i * 4 + 2] = 250;
      rgba[i * 4 + 3] = 255;
    }
    for (let y = 6; y < 20; y++) {
      for (let x = 8; x < 16; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = 20;
        rgba[i + 1] = 18;
        rgba[i + 2] = 28;
        rgba[i + 3] = 255;
      }
    }
    const req = baseRequest({
      id: 'player',
      assetType: 'player',
      dimensions: { width: 16, height: 16 },
      output: { engine: 'godot', transparentBackground: true },
    });
    const compiled = compileForRequest(encodePng(width, height, rgba), req);
    expect(compiled.transformations).toContain('studio-knockout');
    const decoded = decodePngRgba(compiled.buffer);
    expect(decoded.rgba[3]).toBe(0);
    const mid = ((8 * decoded.width + 8) * 4) + 3;
    expect(decoded.rgba[mid]).toBeGreaterThan(0);
  });

  it('tileset compiler rejects nothing when size is already aligned', () => {
    const req = baseRequest({
      id: 'tiles',
      assetType: 'tileset',
      dimensions: { width: 32, height: 32 },
      output: { engine: 'godot', tileSize: 16 },
    });
    const compiled = compileForRequest(opaquePng(32, 32), req);
    expect(compiled.width).toBe(32);
    expect(compiled.height).toBe(32);
  });
});

describe('foundry QA', () => {
  it('detects blank assets', () => {
    const blank = encodePng(8, 8, new Uint8Array(8 * 8 * 4));
    const qa = runFoundryQA(blank, baseRequest({ dimensions: { width: 8, height: 8 } }));
    expect(qa.passed).toBe(false);
    expect(qa.issues.some((i) => /blank/i.test(i))).toBe(true);
  });

  it('detects incorrect dimensions', () => {
    const qa = runFoundryQA(opaquePng(8, 8), baseRequest({ dimensions: { width: 16, height: 16 } }));
    expect(qa.passed).toBe(false);
    expect(qa.issues.some((i) => /Width/i.test(i))).toBe(true);
  });
});
