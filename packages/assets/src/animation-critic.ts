import type { VisionAnalysisResponse } from './types/vision.js';
import { decodePngRgba } from './png.js';

export type AnimationKind = 'walk' | 'hurt' | 'attack' | 'death' | 'tileset';

export interface AnimationCritiqueOptions {
  frameCount: number;
  expectedFrameWidth?: number;
  expectedFrameHeight?: number;
  kind: AnimationKind;
}

interface FrameStats {
  opaque: number;
  meanR: number;
  meanG: number;
  meanB: number;
  hash: number;
}

function sampleFrame(
  rgba: Uint8Array,
  sheetWidth: number,
  height: number,
  frameIndex: number,
  frameWidth: number,
): FrameStats {
  let opaque = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let hash = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < frameWidth; x++) {
      const i = (y * sheetWidth + frameIndex * frameWidth + x) * 4;
      const alpha = rgba[i + 3]!;
      if (alpha < 16) continue;
      opaque += 1;
      r += rgba[i]!;
      g += rgba[i + 1]!;
      b += rgba[i + 2]!;
      if ((x + y) % 4 === 0) {
        hash = (hash * 33 + rgba[i]! + rgba[i + 1]! + rgba[i + 2]! + alpha) | 0;
      }
    }
  }
  return {
    opaque,
    meanR: opaque ? r / opaque : 0,
    meanG: opaque ? g / opaque : 0,
    meanB: opaque ? b / opaque : 0,
    hash,
  };
}

function colorDistance(a: FrameStats, b: FrameStats): number {
  const dr = a.meanR - b.meanR;
  const dg = a.meanG - b.meanG;
  const db = a.meanB - b.meanB;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Cross-frame animation QA: occupancy, palette drift, and that the strip actually animates. */
export function critiqueAnimationSheet(
  png: Buffer,
  options: AnimationCritiqueOptions,
): VisionAnalysisResponse {
  const issues: string[] = [];
  const tags = [options.kind, 'animation-consistency'];
  const frameCount = Math.max(1, options.frameCount);

  let decoded: { rgba: Uint8Array; width: number; height: number };
  try {
    decoded = decodePngRgba(png);
  } catch {
    return {
      passed: false,
      score: 10,
      issues: ['Animation sheet is not a valid PNG'],
      tags,
      description: 'Failed to decode animation sheet',
    };
  }

  if (decoded.width % frameCount !== 0) {
    issues.push(`Sheet width ${decoded.width} is not divisible by frameCount ${frameCount}`);
  }

  const frameWidth = Math.floor(decoded.width / frameCount);
  if (options.expectedFrameWidth && frameWidth !== options.expectedFrameWidth) {
    issues.push(`Frame width ${frameWidth} != expected ${options.expectedFrameWidth}`);
  }
  if (options.expectedFrameHeight && decoded.height !== options.expectedFrameHeight) {
    issues.push(`Sheet height ${decoded.height} != expected ${options.expectedFrameHeight}`);
  }

  const frames: FrameStats[] = [];
  for (let f = 0; f < frameCount; f++) {
    frames.push(sampleFrame(decoded.rgba, decoded.width, decoded.height, f, frameWidth));
  }

  const minOpaque = Math.max(4, Math.floor(frameWidth * decoded.height * 0.02));
  for (let f = 0; f < frames.length; f++) {
    if (frames[f]!.opaque < minOpaque) {
      issues.push(`Frame ${f} is empty or nearly empty`);
    }
  }

  const meanOpaque = frames.reduce((sum, frame) => sum + frame.opaque, 0) / frames.length;
  for (let f = 0; f < frames.length; f++) {
    if (meanOpaque > 0 && Math.abs(frames[f]!.opaque - meanOpaque) / meanOpaque > 0.55) {
      issues.push(`Frame ${f} occupancy drifts too far from the rest of the strip`);
    }
  }

  const uniqueHashes = new Set(frames.map((frame) => frame.hash));
  if (options.kind !== 'tileset' && uniqueHashes.size < 2) {
    issues.push('Frames are identical — strip has no animation');
  }

  const paletteDrift = frames.slice(1).reduce((max, frame) => {
    return Math.max(max, colorDistance(frames[0]!, frame));
  }, 0);
  if (paletteDrift > 80 && options.kind === 'walk') {
    issues.push(`Palette drifts across frames (distance ${paletteDrift.toFixed(1)})`);
  }

  if (options.kind === 'attack' && frames.length > 1) {
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    const firstLum = (first.meanR + first.meanG + first.meanB) / 3;
    const lastLum = (last.meanR + last.meanG + last.meanB) / 3;
    if (lastLum + 2 < firstLum) {
      issues.push('Attack impact frame is darker than the wind-up — expected a brightness pulse');
    }
  }

  const passed = issues.length === 0;
  return {
    passed,
    score: passed ? 88 : Math.max(20, 70 - issues.length * 15),
    issues,
    tags,
    description: passed
      ? `${options.kind} sheet has consistent frames`
      : `${options.kind} sheet failed animation consistency`,
  };
}

/** Palette/occupancy consistency across a tileset atlas (environment "scene" QA without a screenshot). */
export function critiqueTilesetSheet(
  png: Buffer,
  tileSize: number,
): VisionAnalysisResponse {
  const issues: string[] = [];
  const tags = ['tileset', 'scene-consistency'];

  let decoded: { rgba: Uint8Array; width: number; height: number };
  try {
    decoded = decodePngRgba(png);
  } catch {
    return {
      passed: false,
      score: 10,
      issues: ['Tileset is not a valid PNG'],
      tags,
      description: 'Failed to decode tileset',
    };
  }

  if (decoded.width % tileSize !== 0 || decoded.height % tileSize !== 0) {
    issues.push(`Tileset ${decoded.width}x${decoded.height} is not aligned to tile size ${tileSize}`);
  }

  const cols = Math.max(1, Math.floor(decoded.width / tileSize));
  const rows = Math.max(1, Math.floor(decoded.height / tileSize));
  const tiles: FrameStats[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let opaque = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const i = ((row * tileSize + y) * decoded.width + col * tileSize + x) * 4;
          const alpha = decoded.rgba[i + 3] ?? 0;
          if (alpha < 16) continue;
          opaque += 1;
          r += decoded.rgba[i]!;
          g += decoded.rgba[i + 1]!;
          b += decoded.rgba[i + 2]!;
        }
      }
      tiles.push({
        opaque,
        meanR: opaque ? r / opaque : 0,
        meanG: opaque ? g / opaque : 0,
        meanB: opaque ? b / opaque : 0,
        hash: opaque,
      });
    }
  }

  const occupied = tiles.filter((tile) => tile.opaque > tileSize).length;
  if (occupied / tiles.length < 0.25) {
    issues.push('Tileset is mostly empty');
  }

  const occupiedTiles = tiles.filter((tile) => tile.opaque > tileSize);
  if (occupiedTiles.length >= 2) {
    const mean = {
      meanR: occupiedTiles.reduce((s, t) => s + t.meanR, 0) / occupiedTiles.length,
      meanG: occupiedTiles.reduce((s, t) => s + t.meanG, 0) / occupiedTiles.length,
      meanB: occupiedTiles.reduce((s, t) => s + t.meanB, 0) / occupiedTiles.length,
      opaque: 1,
      hash: 0,
    };
    const drifted = occupiedTiles.filter((tile) => colorDistance(mean, tile) > 90).length;
    if (drifted / occupiedTiles.length > 0.5) {
      issues.push('Tileset palette is inconsistent across tiles');
    }
  }

  const passed = issues.length === 0;
  return {
    passed,
    score: passed ? 82 : Math.max(25, 65 - issues.length * 15),
    issues,
    tags,
    description: passed ? 'Tileset tiles share a coherent palette' : 'Tileset failed scene consistency',
  };
}
