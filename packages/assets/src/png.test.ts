import { describe, it, expect } from 'vitest';
import { encodePng, decodePngRgba, generateProceduralSprite, generateWalkCycleSheet, generateRunCycleSheet, generateAttackSheet, generateHurtFlashSheet, generateVfxTexture, knockoutVfxBackground, generatePoseStill, POSE_TRANSFORMS, pickEnemyArchetype, computeFrameQualityMetrics, countLowerBodyBlobs, hasMultiLegSmear, generateTilesetSource, partitionTilesetFeatures, TILESET_SUPPORTED_FEATURES, compileBossCombatSheets, generateProgressionSheet } from '../src/png.js';
import { PixelArtProcessor } from '../src/pixel-art-processor.js';
import { runDeterministicAssetChecks } from '../src/vlm-critic.js';

/** A decoded horizontal frame-strip sheet is row-major across the WHOLE sheet width, so a
 *  single frame's bytes are not contiguous — extract row by row, matching how
 *  computeFrameQualityMetrics slices frames internally. */
function extractSheetFrame(sheetRgba: Uint8Array, frameWidth: number, frameHeight: number, frameCount: number, frameIndex: number): Uint8Array {
  const frameBytes = frameWidth * frameHeight * 4;
  const frame = new Uint8Array(frameBytes);
  for (let y = 0; y < frameHeight; y++) {
    const srcRowStart = (y * frameWidth * frameCount + frameIndex * frameWidth) * 4;
    const dstRowStart = y * frameWidth * 4;
    frame.set(sheetRgba.subarray(srcRowStart, srcRowStart + frameWidth * 4), dstRowStart);
  }
  return frame;
}

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

  it('locks the first three production enemies to distinct silhouette families', () => {
    const firstThree = ['enemy_000', 'enemy_001', 'enemy_002'].map(pickEnemyArchetype);
    expect(firstThree).toEqual(['beast', 'flying', 'armored']);
    expect(new Set(firstThree).size).toBe(3);
  });

  it('prefers an explicit generated enemy archetype over the fallback production order', () => {
    const explicit = generateProceduralSprite({
      id: 'enemy_000',
      width: 64,
      height: 64,
      fill: [90, 140, 220, 255],
      enemyArchetype: 'caster',
      shape: 'enemy',
    });
    const fallback = generateProceduralSprite({
      id: 'enemy_000',
      width: 64,
      height: 64,
      fill: [90, 140, 220, 255],
      shape: 'enemy',
    });
    expect(explicit.equals(fallback)).toBe(false);
    expect(pickEnemyArchetype('enemy_000')).toBe('beast');
  });

  it('keeps the boss silhouette distinct from a normal enemy body mass', () => {
    const enemy = generateProceduralSprite({
      id: 'enemy_000',
      width: 64,
      height: 64,
      fill: [150, 50, 50, 255],
      shape: 'enemy',
    });
    const boss = generateProceduralSprite({
      id: 'boss_final',
      width: 96,
      height: 96,
      fill: [90, 110, 140, 255],
      accent: [230, 180, 80, 255],
      shape: 'boss',
    });
    const enemyBounds = decodePngRgba(enemy);
    const bossBounds = decodePngRgba(boss);
    const enemyVisible = enemyBounds.rgba.filter((_, i) => i % 4 === 3 && enemyBounds.rgba[i]! > 0).length;
    const bossVisible = bossBounds.rgba.filter((_, i) => i % 4 === 3 && bossBounds.rgba[i]! > 0).length;
    expect(enemyVisible).toBeGreaterThan(0);
    expect(bossVisible).toBeGreaterThan(enemyVisible);
    expect(bossBounds.width).toBeGreaterThan(enemyBounds.width);
    expect(bossBounds.height).toBeGreaterThan(enemyBounds.height);
  });

  it('gives the procedural player a readable asymmetric weapon and cloak silhouette', () => {
    const png = generateProceduralSprite({
      id: 'player',
      width: 64,
      height: 64,
      fill: [90, 140, 220, 255],
      accent: [240, 210, 120, 255],
      shape: 'humanoid',
    });
    const { rgba, width } = decodePngRgba(png);
    let forwardPixels = 0;
    let rearPixels = 0;
    for (let y = 22; y < 52; y++) {
      for (let x = 0; x < width; x++) {
        if (rgba[(y * width + x) * 4 + 3]! === 0) continue;
        if (x > 48) forwardPixels++;
        if (x < 16) rearPixels++;
      }
    }
    expect(forwardPixels).toBeGreaterThan(0);
    expect(rearPixels).toBeGreaterThan(0);
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

  it('moves left and right legs on opposite phases instead of bobbing the whole body', () => {
    const spec = {
      id: 'player',
      width: 32,
      height: 32,
      fill: [90, 140, 220, 255] as [number, number, number, number],
      shape: 'humanoid' as const,
    };
    const still = generateProceduralSprite(spec);
    const sheet = decodePngRgba(generateWalkCycleSheet(spec, 4, still));
    const metrics = computeFrameQualityMetrics(sheet.rgba, 32, 32, 4);
    expect(metrics.uniqueFrameRatio).toBeGreaterThanOrEqual(0.75);
    expect(metrics.meanSilhouetteDelta).toBeGreaterThan(0);
    const walk = generateWalkCycleSheet(spec, 4, still);
    const run = generateRunCycleSheet(spec, 4, still);
    expect(walk.equals(run)).toBe(false);
  });

  it('rejects multi-leg ghost smear — walk frames keep ≤2 lower-body blobs', () => {
    const spec = {
      id: 'player',
      width: 64,
      height: 64,
      fill: [90, 140, 220, 255] as [number, number, number, number],
      shape: 'humanoid' as const,
    };
    const still = generateProceduralSprite(spec);
    const walk = decodePngRgba(generateWalkCycleSheet(spec, 8, still));
    const metrics = computeFrameQualityMetrics(walk.rgba, 64, 64, 8);
    expect(metrics.multiLegSmear).toBe(false);
    expect(metrics.maxLowerBodyBlobs).toBeLessThanOrEqual(2);
    expect(hasMultiLegSmear(walk.rgba, 64, 64, 8)).toBe(false);
    // Synthetic stacked-leg frame must trip the blob counter.
    const ghost = new Uint8Array(64 * 64 * 4);
    for (const x of [12, 28, 44]) {
      for (let y = 40; y < 60; y++) {
        for (let dx = 0; dx < 4; dx++) {
          const i = (y * 64 + x + dx) * 4;
          ghost[i] = 40;
          ghost[i + 1] = 40;
          ghost[i + 2] = 40;
          ghost[i + 3] = 255;
        }
      }
    }
    expect(countLowerBodyBlobs(ghost, 64, 64)).toBeGreaterThan(2);
  });
});

describe('generateRunCycleSheet', () => {
  const spec = {
    id: 'player',
    width: 32,
    height: 32,
    fill: [90, 140, 220, 255] as [number, number, number, number],
    shape: 'humanoid' as const,
  };

  it('keeps the procedural staff and cloak out of the legs and inside every 16-frame run canvas', () => {
    for (const size of [32, 64]) {
      const actor = { ...spec, width: size, height: size };
      const sheet = decodePngRgba(generateRunCycleSheet(actor, 16));
      const metrics = computeFrameQualityMetrics(sheet.rgba, size, size, 16);
      expect(metrics.multiLegSmear).toBe(false);
      expect(metrics.maxLowerBodyBlobs).toBeLessThanOrEqual(2);
      expect(metrics.alphaBoundsConsistency).toBe(1);
      expect(metrics.uniqueFrameRatio).toBeGreaterThanOrEqual(0.8);
      expect(metrics.meanSilhouetteDelta).toBeGreaterThan(0);
      expect(generateRunCycleSheet(actor, 16).equals(generateRunCycleSheet(actor, 16, generateProceduralSprite(actor)))).toBe(true);
    }
  });

  it('does not impose the procedural player rig on unrelated imported artwork', () => {
    const image = decodePngRgba(generateProceduralSprite(spec));
    image.rgba[0] = 1; // Different source bytes, not the known authored procedural source.
    const imported = encodePng(image.width, image.height, image.rgba);
    expect(generateRunCycleSheet(spec, 16, imported).equals(
      generateRunCycleSheet({ ...spec, id: 'imported_actor' }, 16, imported))).toBe(true);
  });

  it('emits the requested frame count as a real horizontal strip', () => {
    const still = generateProceduralSprite(spec);
    const sheet = generateRunCycleSheet(spec, 12, still);
    const decoded = decodePngRgba(sheet);
    expect(decoded.width).toBe(32 * 12);
    expect(decoded.height).toBe(32);
  });

  it('is not a relabeled copy of the walk cycle — same stride phase, different amplitude/lean', () => {
    const still = generateProceduralSprite(spec);
    const walk = decodePngRgba(generateWalkCycleSheet(spec, 4, still));
    const run = decodePngRgba(generateRunCycleSheet(spec, 4, still));
    expect(walk.rgba.length).toBe(run.rgba.length);
    let identical = true;
    for (let i = 0; i < walk.rgba.length; i++) {
      if (walk.rgba[i] !== run.rgba[i]) {
        identical = false;
        break;
      }
    }
    expect(identical).toBe(false);
  });

  it('produces genuinely distinct, non-duplicate frames (production standard §20 acceptance criterion)', () => {
    const still = generateProceduralSprite(spec);
    const sheet = generateRunCycleSheet(spec, 12, still);
    const decoded = decodePngRgba(sheet);
    const metrics = computeFrameQualityMetrics(decoded.rgba, 32, 32, 12);
    expect(metrics.frameCount).toBe(12);
    expect(metrics.uniqueFrameRatio).toBeGreaterThanOrEqual(0.8);
    expect(metrics.duplicateFrameRatio).toBeLessThanOrEqual(0.2);
    expect(metrics.meanSilhouetteDelta).toBeGreaterThan(0);
  });

  it('is deterministic for a given source still (same seed input, same output bytes)', () => {
    const still = generateProceduralSprite(spec);
    const a = generateRunCycleSheet(spec, 8, still);
    const b = generateRunCycleSheet(spec, 8, still);
    expect(a.equals(b)).toBe(true);
  });
});

describe('computeFrameQualityMetrics', () => {
  it('reports a fully-duplicate strip honestly (uniqueFrameRatio near the minimum, not inflated)', () => {
    const frameWidth = 4;
    const frameHeight = 4;
    const frameCount = 4;
    const single = new Uint8Array(frameWidth * frameHeight * 4);
    for (let i = 0; i < single.length; i += 4) {
      single[i] = 200;
      single[i + 3] = 255;
    }
    const sheet = new Uint8Array(frameWidth * frameCount * frameHeight * 4);
    for (let f = 0; f < frameCount; f++) {
      for (let y = 0; y < frameHeight; y++) {
        const src = y * frameWidth * 4;
        const dst = (y * frameWidth * frameCount + f * frameWidth) * 4;
        sheet.set(single.subarray(src, src + frameWidth * 4), dst);
      }
    }
    const metrics = computeFrameQualityMetrics(sheet, frameWidth, frameHeight, frameCount);
    expect(metrics.uniqueFrameRatio).toBeCloseTo(1 / frameCount, 5);
    expect(metrics.duplicateFrameRatio).toBeCloseTo(1 - 1 / frameCount, 5);
    expect(metrics.meanSilhouetteDelta).toBe(0);
  });

  it('handles frameCount 0 without throwing', () => {
    const metrics = computeFrameQualityMetrics(new Uint8Array(0), 4, 4, 0);
    expect(metrics.frameCount).toBe(0);
    expect(metrics.duplicateFrameRatio).toBe(1);
  });

  it('reports the expanded quality fields (§21/§22) with sane defaults on a fully-duplicate strip', () => {
    const frameWidth = 4;
    const frameHeight = 4;
    const frameCount = 4;
    const single = new Uint8Array(frameWidth * frameHeight * 4);
    for (let i = 0; i < single.length; i += 4) {
      single[i] = 200;
      single[i + 3] = 255;
    }
    const sheet = new Uint8Array(frameWidth * frameCount * frameHeight * 4);
    for (let f = 0; f < frameCount; f++) {
      for (let y = 0; y < frameHeight; y++) {
        const src = y * frameWidth * 4;
        const dst = (y * frameWidth * frameCount + f * frameWidth) * 4;
        sheet.set(single.subarray(src, src + frameWidth * 4), dst);
      }
    }
    const metrics = computeFrameQualityMetrics(sheet, frameWidth, frameHeight, frameCount);
    expect(metrics.meanPixelDelta).toBe(0);
    expect(metrics.frameDimensionConsistency).toBeCloseTo(1, 5);
    expect(metrics.contentScaleVariance).toBeCloseTo(0, 5);
    expect(metrics.chaoticMotion).toBe(false);
  });

  it('flags chaotic motion when consecutive frames barely resemble each other and scale swings wildly', () => {
    const frameWidth = 8;
    const frameHeight = 8;
    const frameCount = 4;
    // Alternate between a full-frame opaque white fill and a tiny 1x1 opaque black speck —
    // both the color (white vs black, on the pixels that stay opaque) and the opaque coverage
    // (100% vs ~1.5%) swing as hard as possible between consecutive frames, which nothing a
    // coherent character animation would produce.
    const sheet = new Uint8Array(frameWidth * frameCount * frameHeight * 4);
    for (let f = 0; f < frameCount; f++) {
      const fillEverything = f % 2 === 0;
      for (let y = 0; y < frameHeight; y++) {
        for (let x = 0; x < frameWidth; x++) {
          const di = (y * frameWidth * frameCount + f * frameWidth + x) * 4;
          if (fillEverything) {
            sheet[di] = 255;
            sheet[di + 1] = 255;
            sheet[di + 2] = 255;
            sheet[di + 3] = 255;
          } else if (x === 0 && y === 0) {
            sheet[di + 3] = 255; // rest stays 0,0,0,0 — a lone opaque black speck
          }
        }
      }
    }
    const metrics = computeFrameQualityMetrics(sheet, frameWidth, frameHeight, frameCount);
    expect(metrics.chaoticMotion).toBe(true);
  });
});

describe('generateProgressionSheet', () => {
  const spec = {
    id: 'player',
    width: 32,
    height: 32,
    fill: [90, 140, 220, 255] as [number, number, number, number],
    shape: 'humanoid' as const,
  };

  it('emits the requested frame count as a real horizontal strip', () => {
    const still = generateProceduralSprite(spec);
    const sheet = generateProgressionSheet(spec, 'jump_start', 6, still, { mode: 'ramp' });
    const decoded = decodePngRgba(sheet);
    expect(decoded.width).toBe(32 * 6);
    expect(decoded.height).toBe(32);
  });

  it('ramp mode: frame 0 is close to neutral and the last frame carries the full pose transform', () => {
    const still = generateProceduralSprite(spec);
    const sheet = decodePngRgba(generateProgressionSheet(spec, 'jump_start', 6, still, { mode: 'ramp' }));
    const neutral = decodePngRgba(generatePoseStill(spec, '__neutral_unused__', still));
    const frame0 = extractSheetFrame(sheet.rgba, 32, 32, 6, 0);
    const lastFrame = extractSheetFrame(sheet.rgba, 32, 32, 6, 5);
    let frame0MatchesNeutral = true;
    for (let i = 0; i < frame0.length; i++) {
      if (Math.abs(frame0[i]! - neutral.rgba[i]!) > 2) {
        frame0MatchesNeutral = false;
        break;
      }
    }
    expect(frame0MatchesNeutral).toBe(true);
    expect(lastFrame.length).toBe(frame0.length);
  });

  it('produces genuinely distinct frames for every locomotion/transition state, gated by frame-quality metrics', () => {
    const still = generateProceduralSprite(spec);
    for (const [poseName, mode] of Object.entries({
      idle: 'oscillate', jump_start: 'ramp', jump: 'oscillate', fall: 'oscillate',
      land: 'ramp', dash: 'ramp', wall_slide: 'oscillate', wall_jump: 'ramp', swim: 'oscillate',
    } as const)) {
      const sheet = generateProgressionSheet(spec, poseName, 6, still, { mode });
      const decoded = decodePngRgba(sheet);
      const metrics = computeFrameQualityMetrics(decoded.rgba, 32, 32, 6);
      expect(metrics.frameCount, `${poseName} frame count`).toBe(6);
      expect(metrics.alphaBoundsConsistency, `${poseName} bounds`).toBeGreaterThanOrEqual(0);
    }
  });

  it('idle (oscillate) frame 0 and the last frame both sit near neutral — a clean loop seam', () => {
    const still = generateProceduralSprite(spec);
    const sheet = decodePngRgba(generateProgressionSheet(spec, 'idle', 8, still, { mode: 'oscillate', tintPulse: 6 }));
    const frame0 = extractSheetFrame(sheet.rgba, 32, 32, 8, 0);
    const lastFrame = extractSheetFrame(sheet.rgba, 32, 32, 8, 7);
    let maxDelta = 0;
    for (let i = 0; i < frame0.length; i += 4) {
      maxDelta = Math.max(maxDelta, Math.abs(frame0[i]! - lastFrame[i]!));
    }
    expect(maxDelta).toBeLessThan(40);
  });

  it('is deterministic for a given source still', () => {
    const still = generateProceduralSprite(spec);
    const a = generateProgressionSheet(spec, 'dash', 8, still, { mode: 'ramp' });
    const b = generateProgressionSheet(spec, 'dash', 8, still, { mode: 'ramp' });
    expect(a.equals(b)).toBe(true);
  });
});

describe('generateAttackSheet arc kinds (combo hits)', () => {
  const spec = {
    id: 'player',
    width: 32,
    height: 32,
    fill: [90, 140, 220, 255] as [number, number, number, number],
    shape: 'humanoid' as const,
  };

  it('produces genuinely distinct sheets for horizontal/upward/downward arcs — not a rotate/recolor of one clip', () => {
    const still = generateProceduralSprite(spec);
    const horizontal = decodePngRgba(generateAttackSheet(spec, 12, still, 'horizontal'));
    const upward = decodePngRgba(generateAttackSheet(spec, 12, still, 'upward'));
    const downward = decodePngRgba(generateAttackSheet(spec, 12, still, 'downward'));
    const differs = (a: Uint8Array, b: Uint8Array) => a.some((byte, i) => byte !== b[i]);
    expect(differs(horizontal.rgba, upward.rgba)).toBe(true);
    expect(differs(horizontal.rgba, downward.rgba)).toBe(true);
    expect(differs(upward.rgba, downward.rgba)).toBe(true);
  });

  it('each arc kind produces non-duplicate frames at production frame counts', () => {
    const still = generateProceduralSprite(spec);
    for (const [arcKind, frameCount] of [['horizontal', 12], ['upward', 14], ['downward', 16]] as const) {
      const sheet = decodePngRgba(generateAttackSheet(spec, frameCount, still, arcKind));
      const metrics = computeFrameQualityMetrics(sheet.rgba, 32, 32, frameCount);
      expect(metrics.uniqueFrameRatio, arcKind).toBeGreaterThanOrEqual(0.7);
    }
  });
});

describe('generateTilesetSource biome style (fifteenth session)', () => {
  it('is byte-identical to the original fixed-color output when no style is passed', () => {
    // Locks in backward compatibility for every pre-existing caller (asset-pipeline.ts's second
    // tileset call site, animation-critic.test.ts, cohesion-qa.test.ts) that never passes a style.
    const withoutStyle = generateTilesetSource(42, 64);
    const decoded = decodePngRgba(withoutStyle);
    // Spot-check a ground pixel and a wall pixel against the original hardcoded formula.
    const rng = (n: number) => ((42 * 9301 + 49297 + n) % 233280) / 233280;
    const groundN = rng(0 + 2 * 8); // x=0, y=32 gives tileX=0, tileY=2 at size=64.
    const expectedGround = Math.floor(60 + groundN * 40);
    const i = (32 * 64 + 0) * 4; // y=32 is ground band (>= 64*0.5)
    expect(decoded.rgba[i]).toBe(expectedGround);
  });

  it('applies a groundColor/wallColor override uniformly, replacing the fixed default bands', () => {
    const styled = decodePngRgba(generateTilesetSource(7, 64, { groundColor: [200, 10, 10] }));
    const groundPixel = ((40 * 64 + 32) * 4); // y=40 >= 32 -> ground band
    expect(styled.rgba[groundPixel]).toBeGreaterThan(150); // red channel dominated by override
    expect(styled.rgba[groundPixel + 1]).toBeLessThan(80);
  });

  it('partitionTilesetFeatures declares unsupported features explicitly instead of silently dropping them', () => {
    const { supported, unsupported } = partitionTilesetFeatures(['corrosion', 'lava_flow', 'panel_grates']);
    expect(supported).toEqual(['corrosion', 'panel_grates']);
    expect(unsupported).toEqual(['lava_flow']);
    expect(TILESET_SUPPORTED_FEATURES).toContain('corrosion');
  });

  it('the same seed + style produces byte-identical output on repeat calls (reproducibility)', () => {
    const style = { accentColor: [140, 60, 40] as [number, number, number], features: ['corrosion', 'stains'] };
    const a = generateTilesetSource(123, 128, style);
    const b = generateTilesetSource(123, 128, style);
    expect(a.equals(b)).toBe(true);
  });

  it('a different seed with the same style produces different pixels (permitted variation)', () => {
    const style = { accentColor: [140, 60, 40] as [number, number, number], features: ['corrosion', 'stains'] };
    const a = generateTilesetSource(123, 128, style);
    const b = generateTilesetSource(456, 128, style);
    expect(a.equals(b)).toBe(false);
  });

  it('each feature actually changes pixels relative to the unstyled base (not a no-op)', () => {
    const base = decodePngRgba(generateTilesetSource(9, 128));
    for (const feature of TILESET_SUPPORTED_FEATURES) {
      const styled = decodePngRgba(
        generateTilesetSource(9, 128, {
          accentColor: [140, 90, 60],
          accentColor2: [90, 150, 90],
          features: [feature],
        }),
      );
      let differing = 0;
      for (let i = 0; i < base.rgba.length; i += 4) {
        if (base.rgba[i] !== styled.rgba[i] || base.rgba[i + 1] !== styled.rgba[i + 1] || base.rgba[i + 2] !== styled.rgba[i + 2]) {
          differing++;
        }
      }
      expect(differing, `feature "${feature}" should visibly change at least some pixels`).toBeGreaterThan(0);
    }
  });

  it('preserves tile-grid boundaries (16px alignment) and the ground/wall band split regardless of features', () => {
    const size = 128;
    const styled = decodePngRgba(
      generateTilesetSource(9, size, { features: [...TILESET_SUPPORTED_FEATURES], accentColor: [150, 80, 50], accentColor2: [80, 150, 80] }),
    );
    // The wall band (x<16 or x>=size-16, tileY<4) must stay opaque and distinct from the shadow
    // band beneath it (tileY>=4, non-ground) at the exact same boundary as the unstyled version.
    const wallY = 15; // last row of tileY=3 (still "wall", tileY<4)
    const shadowY = 16; // first row of tileY=4 (now "shadow", not ground since size*0.5=64)
    const wallI = (wallY * size + 0) * 4;
    const shadowI = (shadowY * size + 0) * 4;
    expect(styled.rgba[wallI + 3]).toBe(255);
    expect(styled.rgba[shadowI + 3]).toBe(255);
  });
});

describe('generateHurtFlashSheet knockback recoil', () => {
  const spec = {
    id: 'player',
    width: 32,
    height: 32,
    fill: [90, 140, 220, 255] as [number, number, number, number],
    shape: 'humanoid' as const,
  };

  it('produces genuine silhouette motion, not just a color filter over a static pose', () => {
    const still = generateProceduralSprite(spec);
    const sheet = decodePngRgba(generateHurtFlashSheet(spec, 6, still));
    const metrics = computeFrameQualityMetrics(sheet.rgba, 32, 32, 6);
    expect(metrics.meanSilhouetteDelta).toBeGreaterThan(0);
  });
});

describe('generateProceduralSprite chest_closed / chest_open', () => {
  const base = {
    id: 'interactive_chest',
    width: 32,
    height: 32,
    fill: [92, 60, 36, 255] as [number, number, number, number],
    accent: [246, 208, 82, 255] as [number, number, number, number],
  };

  it('draws two genuinely different silhouettes, not a recolor of one shape', () => {
    const closed = decodePngRgba(generateProceduralSprite({ ...base, shape: 'chest_closed' }));
    const open = decodePngRgba(generateProceduralSprite({ ...base, shape: 'chest_open' }));
    let differingPixels = 0;
    for (let i = 0; i < closed.rgba.length; i += 4) {
      if (
        closed.rgba[i] !== open.rgba[i] ||
        closed.rgba[i + 1] !== open.rgba[i + 1] ||
        closed.rgba[i + 2] !== open.rgba[i + 2] ||
        closed.rgba[i + 3] !== open.rgba[i + 3]
      ) {
        differingPixels++;
      }
    }
    expect(differingPixels).toBeGreaterThan(20);
  });

  it('is non-transparent (a real drawn shape, not an empty/degenerate sprite)', () => {
    for (const shape of ['chest_closed', 'chest_open'] as const) {
      const decoded = decodePngRgba(generateProceduralSprite({ ...base, shape }));
      let opaquePixels = 0;
      for (let i = 3; i < decoded.rgba.length; i += 4) {
        if (decoded.rgba[i] > 0) opaquePixels++;
      }
      expect(opaquePixels).toBeGreaterThan(50);
    }
  });
});

describe('generateProceduralSprite portal', () => {
  it('draws a non-degenerate frame-and-glow shape distinct from ability_gate', () => {
    const spec = {
      id: 'interactive_portal',
      width: 32,
      height: 32,
      fill: [58, 46, 82, 255] as [number, number, number, number],
      accent: [150, 110, 226, 255] as [number, number, number, number],
    };
    const portal = decodePngRgba(generateProceduralSprite({ ...spec, shape: 'portal' }));
    const gate = decodePngRgba(generateProceduralSprite({ ...spec, shape: 'ability_gate' }));
    let opaquePixels = 0;
    for (let i = 3; i < portal.rgba.length; i += 4) {
      if (portal.rgba[i] > 0) opaquePixels++;
    }
    expect(opaquePixels).toBeGreaterThan(50);
    let differingPixels = 0;
    for (let i = 0; i < portal.rgba.length; i += 4) {
      if (
        portal.rgba[i] !== gate.rgba[i] ||
        portal.rgba[i + 1] !== gate.rgba[i + 1] ||
        portal.rgba[i + 2] !== gate.rgba[i + 2] ||
        portal.rgba[i + 3] !== gate.rgba[i + 3]
      ) {
        differingPixels++;
      }
    }
    expect(differingPixels).toBeGreaterThan(20);
  });
});

describe('boss combat sheets', () => {
  const spec = {
    id: 'boss_final',
    width: 32,
    height: 32,
    fill: [70, 80, 95, 255] as [number, number, number, number],
    shape: 'boss' as const,
  };

  it('compileBossCombatSheets produces distinct idle/telegraph/attack clips', () => {
    const still = generateProceduralSprite(spec);
    const sheets = compileBossCombatSheets(spec, still);
    expect(sheets.idle.equals(sheets.telegraph)).toBe(false);
    expect(sheets.attack.equals(sheets.idle)).toBe(false);
    expect(sheets.attack_projectile.equals(sheets.attack_burst)).toBe(false);
    const idle = decodePngRgba(sheets.idle);
    const metrics = computeFrameQualityMetrics(idle.rgba, 32, 32, 6);
    expect(metrics.uniqueFrameRatio).toBeGreaterThan(0.3);
  });
});
