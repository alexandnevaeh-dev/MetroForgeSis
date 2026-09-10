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

function cellMeansFromGrid(grid: number[], gridCount: number[]): number[] {
  return grid.map((sum, idx) => (gridCount[idx]! > 0 ? sum / gridCount[idx]! : 0));
}

function lumaStdFromMeans(cellMeans: number[]): number {
  const meanLuma = cellMeans.reduce((s, v) => s + v, 0) / cellMeans.length;
  return Math.sqrt(
    cellMeans.reduce((s, v) => s + (v - meanLuma) * (v - meanLuma), 0) / cellMeans.length,
  );
}

function brightnessHistogram(rgba: Uint8Array, width: number, height: number): { counts: number[]; total: number } {
  const counts = new Array<number>(32).fill(0);
  let total = 0;
  for (let y = 0; y < height; y += SAMPLE_STRIDE) {
    for (let x = 0; x < width; x += SAMPLE_STRIDE) {
      const i = (y * width + x) * 4;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      const lum = luma(r, g, b);
      const bucket = Math.min(31, Math.floor((lum / 256) * 32));
      counts[bucket] += 1;
      total += 1;
    }
  }
  return { counts, total };
}

function localEntropyFromHistogram(counts: number[], total: number): number {
  let entropy = 0;
  for (const count of counts) {
    if (count <= 0) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function edgeDensity(rgba: Uint8Array, width: number, height: number): number {
  let edges = 0;
  let samples = 0;
  for (let y = 0; y < height - SAMPLE_STRIDE; y += SAMPLE_STRIDE) {
    for (let x = 0; x < width - SAMPLE_STRIDE; x += SAMPLE_STRIDE) {
      const i = (y * width + x) * 4;
      const iRight = (y * width + x + SAMPLE_STRIDE) * 4;
      const iDown = ((y + SAMPLE_STRIDE) * width + x) * 4;
      const L = luma(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
      const LRight = luma(rgba[iRight]!, rgba[iRight + 1]!, rgba[iRight + 2]!);
      const LDown = luma(rgba[iDown]!, rgba[iDown + 1]!, rgba[iDown + 2]!);
      const delta = Math.abs(LRight - L) + Math.abs(LDown - L);
      if (delta > 8) edges += 1;
      samples += 1;
    }
  }
  return samples > 0 ? edges / samples : 0;
}

function uniformRegionRatio(rgba: Uint8Array, width: number, height: number): number {
  const cellsX = Math.max(1, Math.floor(width / 16));
  const cellsY = Math.max(1, Math.floor(height / 16));
  let uniform = 0;
  let total = 0;
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      let min = 255;
      let max = 0;
      for (let y = cy * 16; y < Math.min(height, (cy + 1) * 16); y += 4) {
        for (let x = cx * 16; x < Math.min(width, (cx + 1) * 16); x += 4) {
          const i = (y * width + x) * 4;
          const lum = luma(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
          if (lum < min) min = lum;
          if (lum > max) max = lum;
        }
      }
      total += 1;
      if (max - min <= 12) uniform += 1;
    }
  }
  return total > 0 ? uniform / total : 0;
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
        if (a >= 16 && L > 40) hudVisible += 1;
      }

      if (a >= 16 && L > 12) visible += 1;
    }
  }

  const occupancy = sampled > 0 ? visible / sampled : 0;
  const uniqueColors = colors.size;
  const cellMeans = cellMeansFromGrid(grid, gridCount);
  const lumaStdDev = lumaStdFromMeans(cellMeans);
  const hist = brightnessHistogram(rgba, width, height);
  const localEntropy = localEntropyFromHistogram(hist.counts, hist.total);
  const edginess = edgeDensity(rgba, width, height);
  const uniformRatio = uniformRegionRatio(rgba, width, height);
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
  const wallpaperEvidence =
    occupancy > 0.94 &&
    lumaStdDev < 8 &&
    edginess < 0.035 &&
    localEntropy < 2.3 &&
    uniformRatio > 0.75 &&
    uniqueColors < 18;
  if (wallpaperEvidence) {
    issues.push(
      `Gameplay composition looks wallpapered: dense low-structure coverage with weak edge detail (occupancy ${(occupancy * 100).toFixed(1)}%, lumaStdDev ${lumaStdDev.toFixed(1)}, edgeDensity ${edginess.toFixed(3)}, entropy ${localEntropy.toFixed(2)})`,
    );
  }
  if (hudOccupancy < 0.01 && occupancy > 0.05 && hudColors.size < 3) {
    issues.push('Top HUD band looks empty');
  }
  if (hudOccupancy > 0.86 && occupancy > 0.2) {
    issues.push('HUD band is so filled it likely obstructs gameplay');
  }

  const skyMean = (cellMeans[0]! + cellMeans[1]! + cellMeans[2]!) / 3;
  const groundMean = (cellMeans[6]! + cellMeans[7]! + cellMeans[8]!) / 3;
  if (occupancy > 0.05 && uniqueColors >= 4 && Math.abs(skyMean - groundMean) < 6 && lumaStdDev < 14) {
    issues.push('Insufficient foreground/background separation');
  }

  let score = 100;
  score -= issues.length * 18;
  if (uniqueColors >= 8) score += 5;
  if (lumaStdDev >= 12) score += 5;
  if (edginess > 0.05) score += 5;
  if (localEntropy > 2.5) score += 5;
  if (wallpaperEvidence) score = Math.min(score, 40);
  score = Math.max(0, Math.min(100, score));

  const passed = issues.length === 0;
  return {
    passed,
    score: passed ? Math.max(score, 70) : Math.min(score, 55),
    issues,
    tags,
    description: passed
      ? `Gameplay screenshot looks structured (${uniqueColors} colors, lumaStdDev ${lumaStdDev.toFixed(1)})`
      : issues.join('; '),
    blank: false,
    occupancy,
    uniqueColors,
    lumaStdDev,
  };
}

function screenshotSignature(png: Buffer): number[] | null {
  try {
    const { rgba, width, height } = decodePngRgba(png);
    const grid = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const gridCount = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < height; y += SAMPLE_STRIDE) {
      for (let x = 0; x < width; x += SAMPLE_STRIDE) {
        const i = (y * width + x) * 4;
        const cell = Math.min(2, Math.floor((y / height) * 3)) * 3 + Math.min(2, Math.floor((x / width) * 3));
        grid[cell] += luma(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
        gridCount[cell] += 1;
      }
    }
    return cellMeansFromGrid(grid, gridCount);
  } catch {
    return null;
  }
}

function signatureDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

/**
 * Fails when several gameplay/slice captures are essentially the same room template.
 */
export function critiqueScreenshotDiversity(pngs: Buffer[]): {
  passed: boolean;
  issues: string[];
  pairwiseMeanDistance: number;
  compared: number;
} {
  const sigs = pngs.map(screenshotSignature).filter((s): s is number[] => Boolean(s));
  if (sigs.length < 3) {
    return { passed: true, issues: [], pairwiseMeanDistance: 0, compared: sigs.length };
  }
  const distances: number[] = [];
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      distances.push(signatureDistance(sigs[i]!, sigs[j]!));
    }
  }
  const pairwiseMeanDistance = distances.reduce((s, v) => s + v, 0) / distances.length;
  const nearDupes = distances.filter((d) => d < 6).length;
  const issues: string[] = [];
  if (pairwiseMeanDistance < 6) {
    issues.push(
      `Room captures look like copies of one silhouette (mean luma-grid distance ${pairwiseMeanDistance.toFixed(1)})`,
    );
  }
  if (nearDupes / distances.length > 0.55) {
    issues.push('More than half of captured rooms share an near-identical lighting/silhouette grid');
  }
  return {
    passed: issues.length === 0,
    issues,
    pairwiseMeanDistance,
    compared: sigs.length,
  };
}
