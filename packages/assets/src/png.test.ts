import { describe, it, expect } from 'vitest';
import { encodePng, decodePngRgba, generateProceduralSprite, generateWalkCycleSheet, generateAttackSheet, generateVfxTexture, knockoutVfxBackground, generatePoseStill, POSE_TRANSFORMS } from '../src/png.js';
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

describe('generatePoseStill', () => {
  const spec = {
    id: 'player',
    width: 64,
    height: 64,
    fill: [90, 140, 220, 255] as [number, number, number, number],
    shape: 'humanoid' as const,
  };

  it('produces a valid, non-blank still for every locomotion pose', () => {
    for (const poseName of Object.keys(POSE_TRANSFORMS)) {
      const png = generatePoseStill(spec, poseName);
      const decoded = decodePngRgba(png);
      expect(decoded.width).toBe(64);
      expect(decoded.height).toBe(64);
      let visible = 0;
      for (let i = 3; i < decoded.rgba.length; i += 4) {
        if (decoded.rgba[i]! > 0) visible++;
      }
      expect(visible).toBeGreaterThan(0);
    }
  });

  it('idle is not a byte-identical copy of the base silhouette (fixes idle-is-walk-frame-1)', () => {
    const base = generateProceduralSprite(spec);
    const idle = generatePoseStill(spec, 'idle');
    expect(idle.equals(base)).toBe(false);
  });

  it('every locomotion pose is visually distinct from every other pose', () => {
    const names = Object.keys(POSE_TRANSFORMS);
    const stills = names.map((name) => generatePoseStill(spec, name));
    for (let i = 0; i < stills.length; i++) {
      for (let j = i + 1; j < stills.length; j++) {
        expect(stills[i]!.equals(stills[j]!)).toBe(false);
      }
    }
  });

  it('falls back to an unmodified identity transform for unknown pose names without crashing', () => {
    const png = generatePoseStill(spec, 'not_a_real_pose');
    const decoded = decodePngRgba(png);
    expect(decoded.width).toBe(64);
  });

  it('conditions off a real source frame when one is provided, not just the flat procedural silhouette', () => {
    const source = generateProceduralSprite({ ...spec, fill: [255, 10, 10, 255] });
    const dash = generatePoseStill(spec, 'dash', source);
    const decoded = decodePngRgba(dash);
    let sawRed = false;
    for (let i = 0; i < decoded.rgba.length; i += 4) {
      if (decoded.rgba[i]! > 200 && decoded.rgba[i + 3]! > 0) sawRed = true;
    }
    expect(sawRed).toBe(true);
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

  it('knocks out a mid-gray studio plate while keeping a saturated subject', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 60;
      rgba[i + 1] = 64;
      rgba[i + 2] = 78;
      rgba[i + 3] = 255;
    }
    const center = (8 * width + 8) * 4;
    rgba[center] = 90;
    rgba[center + 1] = 140;
    rgba[center + 2] = 220;
    rgba[center + 3] = 255;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[3]).toBe(0);
    expect(decoded.rgba[center + 3]).toBeGreaterThan(0);
  });

  it('still floods leftover studio gray when the four corners are already transparent', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 54;
      rgba[i + 1] = 58;
      rgba[i + 2] = 75;
      rgba[i + 3] = 255;
    }
    for (const [x, y] of [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ]) {
      const i = (y * width + x) * 4;
      rgba[i + 3] = 0;
    }
    const center = (8 * width + 8) * 4;
    rgba[center] = 90;
    rgba[center + 1] = 140;
    rgba[center + 2] = 220;
    rgba[center + 3] = 255;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[(1 * width + 1) * 4 + 3]).toBe(0);
    expect(decoded.rgba[center + 3]).toBeGreaterThan(0);
  });

  it('grows punched alpha into leftover studio gray that only touches transparency', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 0;
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 14; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = 60;
        rgba[i + 1] = 64;
        rgba[i + 2] = 78;
        rgba[i + 3] = 255;
      }
    }
    const center = (8 * width + 8) * 4;
    rgba[center] = 90;
    rgba[center + 1] = 140;
    rgba[center + 2] = 220;
    rgba[center + 3] = 255;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[(3 * width + 3) * 4 + 3]).toBe(0);
    expect(decoded.rgba[center + 3]).toBeGreaterThan(0);
  });

  it('punches detached registration ticks without eating the subject', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 0;
    for (let y = 4; y < 12; y++) {
      for (let x = 4; x < 12; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = 90;
        rgba[i + 1] = 140;
        rgba[i + 2] = 220;
        rgba[i + 3] = 255;
      }
    }
    const tick = ((height - 1) * width + (width - 1)) * 4;
    rgba[tick] = 255;
    rgba[tick + 1] = 40;
    rgba[tick + 2] = 200;
    rgba[tick + 3] = 255;
    rgba[tick - 4] = 240;
    rgba[tick - 3] = 240;
    rgba[tick - 2] = 240;
    rgba[tick - 1] = 255;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[tick + 3]).toBe(0);
    expect(decoded.rgba[(8 * width + 8) * 4 + 3]).toBeGreaterThan(0);
  });

  it('punches a red registration tick fused to the feet in the bottom band', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 0;
    for (let y = 4; y < 15; y++) {
      for (let x = 5; x < 11; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = 90;
        rgba[i + 1] = 140;
        rgba[i + 2] = 220;
        rgba[i + 3] = 255;
      }
    }
    const foot = ((height - 2) * width + 8) * 4;
    rgba[foot] = 255;
    rgba[foot + 1] = 20;
    rgba[foot + 2] = 20;
    rgba[foot + 3] = 255;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[foot + 3]).toBe(0);
    expect(decoded.rgba[(8 * width + 8) * 4 + 3]).toBeGreaterThan(0);
  });

  it('keeps enclosed leftover studio gray instead of punching holes in the silhouette', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 0;
    for (let y = 3; y < 13; y++) {
      for (let x = 3; x < 13; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = 90;
        rgba[i + 1] = 140;
        rgba[i + 2] = 220;
        rgba[i + 3] = 255;
      }
    }
    for (const [x, y] of [
      [7, 7],
      [8, 7],
      [7, 8],
      [8, 8],
    ]) {
      const i = (y * width + x) * 4;
      rgba[i] = 60;
      rgba[i + 1] = 64;
      rgba[i + 2] = 78;
      rgba[i + 3] = 255;
    }
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    // Enclosed studio that does not touch transparency stays — punching it cut
    // holes that showed the floor as 60,64,78 and rimmed white via the outline.
    expect(decoded.rgba[(7 * width + 7) * 4 + 3]).toBeGreaterThan(0);
    expect(decoded.rgba[(5 * width + 5) * 4 + 3]).toBeGreaterThan(0);
  });

  it('punches a magenta contact oval under the feet without eating the subject', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 0;
    for (let y = 4; y < 12; y++) {
      for (let x = 5; x < 11; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = 90;
        rgba[i + 1] = 140;
        rgba[i + 2] = 220;
        rgba[i + 3] = 255;
      }
    }
    const glow = ((height - 2) * width + 8) * 4;
    rgba[glow] = 180;
    rgba[glow + 1] = 100;
    rgba[glow + 2] = 200;
    rgba[glow + 3] = 255;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[glow + 3]).toBe(0);
    expect(decoded.rgba[(8 * width + 8) * 4 + 3]).toBeGreaterThan(0);
  });

  it('punches leftover studio gray in the bottom contact band', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 0;
    for (let y = 4; y < 15; y++) {
      for (let x = 5; x < 11; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = 90;
        rgba[i + 1] = 140;
        rgba[i + 2] = 220;
        rgba[i + 3] = 255;
      }
    }
    const pad = ((height - 2) * width + 8) * 4;
    rgba[pad] = 60;
    rgba[pad + 1] = 64;
    rgba[pad + 2] = 78;
    rgba[pad + 3] = 255;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[pad + 3]).toBe(0);
    expect(decoded.rgba[(8 * width + 8) * 4 + 3]).toBeGreaterThan(0);
  });

  it('fills a small punched hole inside the silhouette', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 0;
    for (let y = 3; y < 13; y++) {
      for (let x = 3; x < 13; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = 90;
        rgba[i + 1] = 140;
        rgba[i + 2] = 220;
        rgba[i + 3] = 255;
      }
    }
    const hole = (7 * width + 7) * 4;
    rgba[hole + 3] = 0;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[hole + 3]).toBeGreaterThan(0);
    expect(decoded.rgba[(5 * width + 5) * 4 + 3]).toBeGreaterThan(0);
  });

  it('does not punch enclosed studio gray when it is most of the silhouette', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 0;
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 14; x++) {
        const i = (y * width + x) * 4;
        const ring = x === 2 || y === 2 || x === 13 || y === 13;
        rgba[i] = ring ? 90 : 60;
        rgba[i + 1] = ring ? 140 : 64;
        rgba[i + 2] = ring ? 220 : 78;
        rgba[i + 3] = 255;
      }
    }
    const inner = (8 * width + 8) * 4;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[inner + 3]).toBeGreaterThan(0);
    expect(decoded.rgba[inner]).toBe(60);
  });

  it('punches palette red and cream in the contact band', () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 0;
    for (let y = 3; y < 14; y++) {
      for (let x = 4; x < 12; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = 90;
        rgba[i + 1] = 140;
        rgba[i + 2] = 220;
        rgba[i + 3] = 255;
      }
    }
    const red = ((height - 2) * width + 6) * 4;
    rgba[red] = 200;
    rgba[red + 1] = 80;
    rgba[red + 2] = 80;
    rgba[red + 3] = 255;
    const cream = ((height - 2) * width + 9) * 4;
    rgba[cream] = 240;
    rgba[cream + 1] = 240;
    rgba[cream + 2] = 250;
    rgba[cream + 3] = 255;
    const knocked = knockoutVfxBackground(encodePng(width, height, rgba));
    const decoded = decodePngRgba(knocked);
    expect(decoded.rgba[red + 3]).toBe(0);
    expect(decoded.rgba[cream + 3]).toBe(0);
    expect(decoded.rgba[(8 * width + 8) * 4 + 3]).toBeGreaterThan(0);
  });
});

describe('generateWalkCycleSheet identity', () => {
  it('emits unique stride frames instead of four identical stills', () => {
    const spec = {
      id: 'player',
      width: 32,
      height: 32,
      fill: [90, 140, 220, 255] as [number, number, number, number],
      shape: 'humanoid' as const,
    };
    const still = generateProceduralSprite(spec);
    const sheet = generateWalkCycleSheet(spec, 4, still);
    const decoded = decodePngRgba(sheet);
    expect(decoded.width).toBe(128);
    const hashes = new Set<string>();
    for (let f = 0; f < 4; f++) {
      let h = 0;
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          h = (h * 33 + decoded.rgba[(y * 128 + f * 32 + x) * 4]!) | 0;
          h = (h * 33 + decoded.rgba[(y * 128 + f * 32 + x) * 4 + 3]!) | 0;
        }
      }
      hashes.add(String(h));
    }
    expect(hashes.size).toBeGreaterThan(1);
  });
});
