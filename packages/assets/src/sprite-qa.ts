import { decodePngRgba, encodePng } from './png.js';

export interface SpriteQaIssue {
  code: string;
  message: string;
}

export interface SpriteQaResult {
  passed: boolean;
  fakeAnimation: boolean;
  issues: SpriteQaIssue[];
  checks: Record<string, boolean>;
}

function occupancyCentroid(rgba: Uint8Array, width: number, height: number): { x: number; y: number; count: number } {
  let sx = 0;
  let sy = 0;
  let count = 0;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3]!;
      if (a > 24) {
        sx += x;
        sy += y;
        count++;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { x: count ? sx / count : width / 2, y: count ? sy / count : height / 2, count };
}

function framePixels(rgba: Uint8Array, sheetW: number, height: number, frame: number, frameW: number): Uint8Array {
  const out = new Uint8Array(frameW * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < frameW; x++) {
      const si = (y * sheetW + frame * frameW + x) * 4;
      const di = (y * frameW + x) * 4;
      out[di] = rgba[si]!;
      out[di + 1] = rgba[si + 1]!;
      out[di + 2] = rgba[si + 2]!;
      out[di + 3] = rgba[si + 3]!;
    }
  }
  return out;
}

function hashFrame(rgba: Uint8Array): string {
  let h = 2166136261;
  for (let i = 0; i < rgba.length; i += 16) {
    h ^= rgba[i]!;
    h = Math.imul(h, 16777619);
  }
  return h.toString(16);
}

/**
 * Technical sprite/animation QA. Does not claim aesthetic quality.
 * Detects bob/slide fake cycles (identical occupancy shifted by 1–2px).
 */
export function critiqueAnimationIdentity(
  sheetPng: Buffer,
  opts: { frameWidth: number; expectedFrames?: number; kind?: string },
): SpriteQaResult {
  const issues: SpriteQaIssue[] = [];
  const checks: Record<string, boolean> = {};
  let decoded: { rgba: Uint8Array; width: number; height: number };
  try {
    decoded = decodePngRgba(sheetPng);
  } catch {
    return {
      passed: false,
      fakeAnimation: true,
      issues: [{ code: 'decode', message: 'undecodable animation sheet' }],
      checks: { decoded: false },
    };
  }
  const { rgba, width, height } = decoded;
  const frameW = opts.frameWidth;
  const frames = Math.max(1, Math.floor(width / frameW));
  checks.decoded = true;
  checks.canvasWidthDivisible = width % frameW === 0;
  if (!checks.canvasWidthDivisible) {
    issues.push({ code: 'canvas', message: `sheet width ${width} is not a multiple of frame ${frameW}` });
  }
  if (opts.expectedFrames && frames !== opts.expectedFrames) {
    issues.push({ code: 'frames', message: `expected ${opts.expectedFrames} frames, got ${frames}` });
    checks.frameCount = false;
  } else {
    checks.frameCount = true;
  }

  const centroids: { x: number; y: number; count: number }[] = [];
  const hashes = new Set<string>();
  let transparentOk = true;
  let clipped = false;
  for (let f = 0; f < frames; f++) {
    const frame = framePixels(rgba, width, height, f, frameW);
    hashes.add(hashFrame(frame));
    const c = occupancyCentroid(frame, frameW, height);
    centroids.push(c);
    if (c.count < 8) issues.push({ code: 'empty', message: `frame ${f} has almost no visible pixels` });
    let edge = 0;
    for (let x = 0; x < frameW; x++) {
      if (frame[(0 * frameW + x) * 4 + 3]! > 200) edge++;
      if (frame[((height - 1) * frameW + x) * 4 + 3]! > 200) edge++;
    }
    if (edge > frameW * 0.6) clipped = true;
    let opaque = 0;
    for (let i = 3; i < frame.length; i += 4) {
      if (frame[i]! > 250) opaque++;
    }
    if (opaque === frameW * height) transparentOk = false;
  }
  checks.transparentBackground = transparentOk;
  checks.noClipping = !clipped;
  if (!transparentOk) issues.push({ code: 'alpha', message: 'sheet has no transparent pixels' });
  if (clipped) issues.push({ code: 'clip', message: 'silhouette appears clipped at the canvas edge' });

  const unique = hashes.size;
  checks.uniqueFrames = unique >= Math.min(2, frames);
  if (frames > 1 && unique < 2) {
    issues.push({ code: 'static', message: 'animation frames are identical' });
  }

  let maxJitter = 0;
  for (let i = 1; i < centroids.length; i++) {
    maxJitter = Math.max(
      maxJitter,
      Math.hypot(centroids[i]!.x - centroids[0]!.x, centroids[i]!.y - centroids[0]!.y),
    );
  }
  checks.stableAnchor = maxJitter <= frameW * 0.22;
  if (!checks.stableAnchor) {
    issues.push({ code: 'jitter', message: `centroid jitter ${maxJitter.toFixed(1)}px exceeds 22% of frame` });
  }

  // Fake walk bob: occupancy count nearly identical and y-centroid hops 1–2px only.
  const counts = centroids.map((c) => c.count);
  const mean = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
  const variance =
    counts.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, counts.length);
  const ySpread = Math.max(...centroids.map((c) => c.y)) - Math.min(...centroids.map((c) => c.y));
  const fakeBob = frames >= 3 && unique <= 2 && ySpread > 0 && ySpread <= 3 && variance < mean * 0.01;
  checks.notFakeBobCycle = !fakeBob;
  if (fakeBob) {
    issues.push({
      code: 'fake-animation',
      message: 'frames look like a 1–2px vertical bob of one still (not posed animation)',
    });
  }

  const fakeAnimation = fakeBob || (frames > 1 && unique < 2);
  const passed = issues.filter((i) => i.code !== 'fake-animation').length === 0 && !fakeAnimation;
  return { passed, fakeAnimation, issues, checks };
}

export function assembleContactSheet(
  frames: { label: string; png: Buffer }[],
  pad = 4,
): Buffer {
  const decoded = frames.map((f) => ({ ...f, img: decodePngRgba(f.png) }));
  const cellW = Math.max(...decoded.map((d) => d.img.width)) + pad * 2;
  const cellH = Math.max(...decoded.map((d) => d.img.height)) + pad * 2;
  const cols = Math.min(decoded.length, 8);
  const rows = Math.max(1, Math.ceil(decoded.length / cols));
  const width = cols * cellW;
  const height = rows * cellH;
  const rgba = new Uint8Array(width * height * 4);
  decoded.forEach((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * cellW + pad;
    const oy = row * cellH + pad;
    for (let y = 0; y < d.img.height; y++) {
      for (let x = 0; x < d.img.width; x++) {
        const si = (y * d.img.width + x) * 4;
        const di = ((oy + y) * width + (ox + x)) * 4;
        rgba[di] = d.img.rgba[si]!;
        rgba[di + 1] = d.img.rgba[si + 1]!;
        rgba[di + 2] = d.img.rgba[si + 2]!;
        rgba[di + 3] = d.img.rgba[si + 3]!;
      }
    }
  });
  return encodePng(width, height, rgba);
}
