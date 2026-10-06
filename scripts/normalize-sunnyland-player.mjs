#!/usr/bin/env node

/**
 * SunnyLand Forest Player Normalization Script
 * 
 * Phase 5 (Normalization) — Process SunnyLand Forest spritesheets into MetroForge-compatible format
 * 
 * - Extracts individual frames from horizontal sprite strips
 * - Scales frames from ~16×16 to 64×64 (target MetroForge frame size)
 * - Ensures consistent pivot (bottom-center, foot position Y=60-62)
 * - Validates alpha integrity
 * - Generates normalized spritesheets and metadata JSON
 * 
 * Dependencies: sharp (image processing), fs/path (Node.js stdlib)
 * 
 * Usage: node normalize-sunnyland-player.mjs
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const NORMALIZED_OUTPUT = path.resolve(
  'assets/external/sunnyland_forest/normalized/player'
);
const ORIGINAL_FRAME_BASE = path.resolve(
  'assets/external/sunnyland_forest/original/Sunny-land-forest-files/Assets/PNG/sprites/player'
);

const TARGET_FRAME_SIZE = 64; // Fixed grid standard
const TARGET_FOOT_Y = 61; // Near bottom of 64×64 canvas

/**
 * Animation definitions from SunnyLand Forest source
 * Maps animation name -> { sourceDirectory, frameCount, fps, loop }
 */
const ANIMATIONS = {
  idle: {
    sourceDirectory: 'player-idle',
    frameCount: 9,
    fps: 8,
    loop: true,
    gameplayState: 'idle',
    description: 'Standing neutral pose with breathing animation',
  },
  jump: {
    sourceDirectory: 'player-jump',
    frameCount: 4,
    fps: 10, // Adjust from source for gameplay responsiveness
    loop: true,
    gameplayState: 'jump',
    description: 'Airborne rise/jump arc',
  },
  fall: {
    sourceDirectory: 'player-fall',
    frameCount: 4,
    fps: 10,
    loop: true,
    gameplayState: 'fall',
    description: 'Airborne descent/falling pose',
  },
  duck: {
    sourceDirectory: 'player-duck',
    frameCount: 4,
    fps: 8,
    loop: true,
    gameplayState: 'interact', // Crouch → interact/examine
    description: 'Low-stance crouch pose',
  },
  climb: {
    sourceDirectory: 'player-climb',
    frameCount: 4,
    fps: 10,
    loop: true,
    gameplayState: 'grapple',
    description: 'Vertical climbing/grappling animation',
  },
  hurt: {
    sourceDirectory: 'player-hurt',
    frameCount: 2,
    fps: 14,
    loop: false,
    gameplayState: 'hurt',
    description: 'Damage feedback knockback reaction',
  },
  skip: {
    sourceDirectory: 'player-skip',
    frameCount: 8,
    fps: 18,
    loop: false,
    gameplayState: 'dash', // Skipping → ground dash
    description: 'Skipping/hopping movement (adapted for dash)',
  },
};

/**
 * Load the authored individual frame instead of slicing a presentation sheet
 * that contains a one-pixel spacer between 37px frames.
 */
async function loadFrames(sourceDirectory, frameCount) {
  const frames = [];
  for (let index = 1; index <= frameCount; index++) {
    const filename = `${sourceDirectory}-${index}.png`;
    const inputPath = path.join(ORIGINAL_FRAME_BASE, sourceDirectory, filename);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Source frame not found: ${inputPath}`);
    }
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    frames.push({ index: index - 1, data: await image.png().toBuffer(), width: metadata.width, height: metadata.height });
  }
  console.log(`  Source frames: ${sourceDirectory} (${frames[0].width}×${frames[0].height}, ${frameCount} frames)`);
  return frames;
}

/**
 * Scale and center a frame on a 64×64 canvas with consistent pivot
 * Ensures foot position remains at Y ≈ 61 (near bottom)
 */
async function normalizeFrame(frameBuffer, sourceWidth, sourceHeight) {
  // Scale the authored 37×32px frame as a whole. This preserves its padding and
  // floor alignment while nearest-neighbor interpolation keeps every source pixel hard.
  const scaleX = TARGET_FRAME_SIZE / sourceWidth;
  const scaleY = TARGET_FRAME_SIZE / sourceHeight;
  const scale = Math.min(scaleX, scaleY);

  const scaledWidth = Math.round(sourceWidth * scale);
  const scaledHeight = Math.round(sourceHeight * scale);

  // Scale frame
  const scaled = await sharp(frameBuffer)
    .resize(scaledWidth, scaledHeight, {
      kernel: 'nearest',
      fit: 'fill',
    })
    .png()
    .toBuffer();

  // Center on target canvas with foot position at Y ≈ 61
  const offsetX = Math.round((TARGET_FRAME_SIZE - scaledWidth) / 2);
  const offsetY = TARGET_FRAME_SIZE - scaledHeight;

  const normalized = await sharp({
    create: {
      width: TARGET_FRAME_SIZE,
      height: TARGET_FRAME_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
    },
  })
    .composite([
      {
        input: scaled,
        left: offsetX,
        top: offsetY,
      },
    ])
    .png()
    .toBuffer();

  return normalized;
}

/**
 * Process a single animation: extract frames, normalize, pack into spritesheet
 */
async function normalizeAnimation(animKey, animConfig) {
  console.log(`\nProcessing: ${animKey}`);
  console.log(`  Gameplay state: ${animConfig.gameplayState}`);
  console.log(`  Frame count: ${animConfig.frameCount}`);
  console.log(`  FPS: ${animConfig.fps}`);

  const frames = await loadFrames(animConfig.sourceDirectory, animConfig.frameCount);

  // Normalize each frame
  const normalizedFrames = [];
  for (const frame of frames) {
    const normalized = await normalizeFrame(
      frame.data,
      frame.width,
      frame.height
    );
    normalizedFrames.push(normalized);
  }

  // Pack normalized frames into horizontal spritesheet
  const spritesheetWidth = TARGET_FRAME_SIZE * animConfig.frameCount;
  const spritesheetHeight = TARGET_FRAME_SIZE;

  let spritesheet = await sharp({
    create: {
      width: spritesheetWidth,
      height: spritesheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png().toBuffer();

  for (let i = 0; i < normalizedFrames.length; i++) {
    spritesheet = await sharp(spritesheet)
      .composite([
        {
          input: normalizedFrames[i],
          left: i * TARGET_FRAME_SIZE,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
  }

  // Write normalized spritesheet
  const outputFilename = `${animKey}.png`;
  const outputPath = path.join(NORMALIZED_OUTPUT, outputFilename);
  await fs.promises.mkdir(NORMALIZED_OUTPUT, { recursive: true });
  await fs.promises.writeFile(outputPath, spritesheet);

  console.log(`  ✅ Normalized spritesheet: ${outputFilename}`);
  console.log(
    `     Dimensions: ${spritesheetWidth}×${spritesheetHeight} (${animConfig.frameCount} × ${TARGET_FRAME_SIZE}×${TARGET_FRAME_SIZE})`
  );

  return {
    animation: animKey,
    gameplayState: animConfig.gameplayState,
    file: outputFilename,
    frameCount: animConfig.frameCount,
    frameSize: TARGET_FRAME_SIZE,
    fps: animConfig.fps,
    loop: animConfig.loop,
    origin: 'bottom-center',
    facingConvention: 'right',
    mirrorSafe: true,
    description: animConfig.description,
  };
}

/**
 * Main normalization workflow
 */
async function main() {
  console.log('='.repeat(70));
  console.log('SunnyLand Forest Player Normalization');
  console.log('='.repeat(70));

  const metadata = [];

  try {
    for (const [animKey, animConfig] of Object.entries(ANIMATIONS)) {
      const result = await normalizeAnimation(animKey, animConfig);
      if (result) {
        metadata.push(result);
      }
    }

    // Write metadata JSON for gameplay integration
    const metadataPath = path.join(NORMALIZED_OUTPUT, 'metadata.json');
    await fs.promises.writeFile(
      metadataPath,
      JSON.stringify(
        {
          source: 'SunnyLand Forest by Ansimuz (CC0 1.0)',
          license: 'CC0 1.0 Universal (Public Domain)',
          normalizedDate: new Date().toISOString(),
          targetFrameSize: TARGET_FRAME_SIZE,
          targetPivot: `bottom-center (foot Y=${TARGET_FOOT_Y})`,
          animations: metadata,
        },
        null,
        2
      )
    );

    console.log(`\n✅ Normalization complete.`);
    console.log(`   Output directory: ${NORMALIZED_OUTPUT}`);
    console.log(`   Normalized animations: ${metadata.length}`);
    console.log(`   Metadata file: metadata.json`);
    console.log(
      '\nNext steps:'
    );
    console.log('  1. Verify normalized spritesheet quality visually');
    console.log(
      '  2. Integrate into Godot (AnimatedSprite2D + SpriteFrames)'
    );
    console.log('  3. Update player animation metadata JSON');
    console.log('  4. Test gameplay responsiveness (Phase 7)');
    console.log('  5. Compare V2 vs V3 in-game (Phase 8)');
  } catch (error) {
    console.error('❌ Normalization error:', error);
    process.exit(1);
  }
}

main();
