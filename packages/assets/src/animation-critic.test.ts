import { describe, it, expect } from 'vitest';
import {
  generateProceduralSprite,
  generateWalkCycleSheet,
  generateAttackSheet,
  generateHurtFlashSheet,
  generateTilesetSource,
  encodePng,
  decodePngRgba,
} from './png.js';
import { critiqueAnimationSheet, critiqueTilesetSheet } from './animation-critic.js';
import { deterministicCritique } from './vision-critic-shared.js';

const spec = {
  id: 'enemy',
  width: 32,
  height: 32,
  fill: [200, 40, 40, 255] as [number, number, number, number],
  shape: 'enemy' as const,
};

function repeatedFrameSheet(): Buffer {
  const sprite = generateProceduralSprite(spec);
  const { rgba, width, height } = decodePngRgba(sprite);
  const frames = 4;
  const sheet = new Uint8Array(width * frames * height * 4);
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4;
        const di = (y * width * frames + f * width + x) * 4;
        sheet[di] = rgba[si]!;
        sheet[di + 1] = rgba[si + 1]!;
        sheet[di + 2] = rgba[si + 2]!;
        sheet[di + 3] = rgba[si + 3]!;
      }
    }
  }
  return encodePng(width * frames, height, sheet);
}

describe('critiqueAnimationSheet', () => {
  it('passes a generated walk cycle', () => {
    const sheet = generateWalkCycleSheet(spec, 4);
    const result = critiqueAnimationSheet(sheet, {
      frameCount: 4,
      expectedFrameWidth: 32,
      expectedFrameHeight: 32,
      kind: 'walk',
    });
    expect(result.passed).toBe(true);
    expect(result.tags).toContain('animation-consistency');
  });

  it('fails when every frame is identical', () => {
    const result = critiqueAnimationSheet(repeatedFrameSheet(), {
      frameCount: 4,
      kind: 'walk',
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.includes('identical'))).toBe(true);
  });

  it('fails on corrupt input', () => {
    const result = critiqueAnimationSheet(Buffer.from('not-a-png'), {
      frameCount: 4,
      kind: 'attack',
    });
    expect(result.passed).toBe(false);
  });

  it('accepts generated attack and hurt strips', () => {
    expect(
      critiqueAnimationSheet(generateAttackSheet(spec, 4), { frameCount: 4, kind: 'attack' }).passed,
    ).toBe(true);
    expect(
      critiqueAnimationSheet(generateHurtFlashSheet(spec, 4), { frameCount: 4, kind: 'hurt' }).passed,
    ).toBe(true);
  });
});

describe('critiqueTilesetSheet', () => {
  it('passes a generated biome tileset', () => {
    const result = critiqueTilesetSheet(generateTilesetSource(42, 128), 16);
    expect(result.passed).toBe(true);
    expect(result.tags).toContain('scene-consistency');
  });
});

describe('deterministicCritique animation dispatch', () => {
  it('routes animationKind to the animation critic', () => {
    const sheet = generateWalkCycleSheet(spec, 4);
    const result = deterministicCritique({
      image: sheet,
      assetType: 'enemy',
      frameCount: 4,
      animationKind: 'walk',
    });
    expect(result.tags).toContain('animation-consistency');
    expect(result.passed).toBe(true);
  });
});
