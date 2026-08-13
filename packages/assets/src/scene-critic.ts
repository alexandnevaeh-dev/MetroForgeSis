import type { VisionAnalysisResponse } from './types/vision.js';
import { decodePngRgba } from './png.js';

export interface GameplayScreenshotCritique extends VisionAnalysisResponse {
  /** True when the frame is empty/black — typical of GPU-less Godot --headless captures. */
  blank: boolean;
  occupancy: number;
  uniqueColors: number;
  lumaStdDev: number;
}

const MIN_WIDTH = 64;
const MIN_HEIGHT = 64;
const SAMPLE_STRIDE = 4;

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function quantize(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

function fail(
  issues: string[],
  extras: Partial<GameplayScreenshotCritique> = {},
): GameplayScreenshotCritique {
  return {
    passed: false,
    score: extras.score ?? 15,
    issues,
    tags: ['gameplay-screenshot', 'scene-consistency'],
    description: extras.description ?? issues[0] ?? 'Gameplay screenshot failed QA',
    blank: extras.blank ?? false,
    occupancy: extras.occupancy ?? 0,
    uniqueColors: extras.uniqueColors ?? 0,
    lumaStdDev: extras.lumaStdDev ?? 0,
  };
}

/**
 * Deterministic full-scene QA for a gameplay screenshot (HUD + world), independent of a VLM.
 * Blank frames are reported as `blank: true` so callers can SKIP rather than fail CI.
 */
export function critiqueGameplayScreenshot(png: Buffer): GameplayScreenshotCritique {
  const tags = ['gameplay-screenshot', 'scene-consistency'];
  let decoded: { rgba: Uint8Array; width: number; height: number };
  try {
    decoded = decodePngRgba(png);
  } catch {
    return fail(['Gameplay screenshot is not a valid PNG']);
  }

  const { rgba, width, height } = decoded;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return fail([`Gameplay screenshot ${width}x${height} is smaller than ${MIN_WIDTH}x${MIN_HEIGHT}`], {
      description: 'Screenshot is too small to represent a game view',
    });
  }

  const colors = new Set<number>();
  let visible = 0;
  let sampled = 0;
  const grid = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const gridCount = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let hudVisible = 0;
  let hudSamples = 0;
  const hudColors = new Set<number>();

  const hudMaxY = Math.max(1, Math.floor(height * 0.12));

  for (let y = 0; y < height; y += SAMPLE_STRIDE) {
    for (let x = 0; x < width; x += SAMPLE_STRIDE) {
      const i = (y * width + x) * 4;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      const a = rgba[i + 3] ?? 255;
      sampled += 1;
      const L = luma(r, g, b);
      const q = quantize(r, g, b);
      colors.add(q);

      const cell = Math.min(2, Math.floor((y / height) * 3)) * 3 + Math.min(2, Math.floor((x / width) * 3));
      grid[cell] += L;
      gridCount[cell] += 1;

      if (y < hudMaxY) {
        hudSamples += 1;
        hudColors.add(q);
        if (a >= 16 && L > 14) hudVisible += 1;
      }

      if (a >= 16 && L > 12) visible += 1;
    }
  }

  const occupancy = sampled > 0 ? visible / sampled : 0;
  const uniqueColors = colors.size;
  const cellMeans = grid.map((sum, idx) => (gridCount[idx]! > 0 ? sum / gridCount[idx]! : 0));
  const meanLuma = cellMeans.reduce((s, v) => s + v, 0) / cellMeans.length;
  const lumaStdDev = Math.sqrt(
    cellMeans.reduce((s, v) => s + (v - meanLuma) * (v - meanLuma), 0) / cellMeans.length,
  );
  const hudOccupancy = hudSamples > 0 ? hudVisible / hudSamples : 0;

  if (occupancy < 0.004) {
    return fail(['Gameplay screenshot is blank or near-black'], {
      blank: true,
      occupancy,
      uniqueColors,
      lumaStdDev,
      score: 10,
      description: 'Empty viewport capture (typical of headless rendering without a GPU)',
    });
  }

  const issues: string[] = [];
  if (uniqueColors < 4 && occupancy > 0.9) {
    issues.push('Gameplay screenshot is a near-solid color');
  }
  if (occupancy < 0.02) {
    issues.push('Gameplay screenshot has almost no visible pixels');
  }
  if (lumaStdDev < 4) {
    issues.push('Gameplay screenshot lacks spatial structure (looks flat)');
  }
  if (hudOccupancy < 0.01 && occupancy > 0.05 && hudColors.size < 3) {
    issues.push('Top HUD band looks empty');
  }

  let score = 100;
  score -= issues.length * 18;
  if (uniqueColors >= 8) score += 5;
  if (lumaStdDev >= 12) score += 5;
  score = Math.max(0, Math.min(100, score));

  const passed = issues.length === 0;
  return {
    passed,
    score: passed ? Math.max(score, 70) : Math.min(score, 55),
    issues,
    tags,
    description: passed
      ? `Gameplay screenshot looks structured (${uniqueColors} colors, ${(occupancy * 100).toFixed(1)}% occupancy)`
      : issues.join('; '),
    blank: false,
    occupancy,
    uniqueColors,
    lumaStdDev,
  };
}
