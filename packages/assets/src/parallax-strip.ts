import { decodePngRgba, encodePng } from './png.js';

export type ParallaxLayerName = 'far' | 'mid' | 'near' | 'overlay' | 'foreground';

export const PARALLAX_STRIP_SIZE: Record<ParallaxLayerName, { width: number; height: number }> = {
  far: { width: 640, height: 360 },
  mid: { width: 640, height: 64 },
  near: { width: 640, height: 56 },
  overlay: { width: 640, height: 64 },
  foreground: { width: 640, height: 64 },
};

export const PARALLAX_LAYER_PROMPTS: Record<ParallaxLayerName, string> = {
  far: 'orthographic side-view FAR background PLATE filling the entire frame, distant ridgeline and sky, continuous horizon, tileable left-right, empty of characters, no UI, not stacked floating islands, not a cropped landscape strip',
  mid: 'horizontal mid-ground parallax STRIP of architecture silhouettes, transparent empty sky above, orthographic side-view, tileable left-right, no characters, no UI',
  near: 'horizontal near parallax STRIP of dark foreground silhouettes along the bottom, transparent above, orthographic side-view, tileable left-right, no characters, no UI',
  overlay: 'sparse mist overlay STRIP, mostly transparent, no characters, no UI',
  foreground: 'dark foreground occluder silhouettes along the very bottom edge, transparent above, no UI, no characters',
};

function hash01(seed: number, n: number): number {
  let h = (seed * 9301 + 49297 + n * 7919) >>> 0;
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return (h >>> 0) / 4294967296;
}

function setPx(
  rgba: Uint8Array,
  w: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = a;
}

function ridgeAt(x: number, width: number, seed: number, base: number, amp: number): number {
  const sx = Math.floor(x / 4) * 4;
  const t = sx / Math.max(1, width - 1);
  return (
    base +
    Math.sin(t * Math.PI * 2 + seed) * amp +
    Math.sin(t * Math.PI * 5 + seed * 0.3) * amp * 0.35 +
    (hash01(seed, sx) - 0.5) * amp * 0.05
  );
}

/**
 * Procedural side-view parallax plates. Far is an opaque sky+horizon that fills the
 * camera; mid/near keep empty air transparent so they sit as depth silhouettes.
 */
export function generateParallaxStrip(
  layer: ParallaxLayerName,
  seed: number,
  width = 640,
  height = 360,
): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  // Drowned-citadel night sky (#284878 family). Do not drift into cream/green landscape slabs.
  const skyTop: [number, number, number] = [22 + Math.floor(hash01(seed, 1) * 10), 38 + Math.floor(hash01(seed, 2) * 12), 70 + Math.floor(hash01(seed, 3) * 14)];
  const skyBot: [number, number, number] = [36 + Math.floor(hash01(seed, 4) * 10), 64 + Math.floor(hash01(seed, 5) * 14), 108 + Math.floor(hash01(seed, 6) * 16)];
  const rock: [number, number, number] = [28 + Math.floor(hash01(seed, 7) * 12), 36 + Math.floor(hash01(seed, 8) * 10), 48 + Math.floor(hash01(seed, 9) * 12)];
  const dark: [number, number, number] = [10 + Math.floor(hash01(seed, 10) * 8), 14 + Math.floor(hash01(seed, 11) * 8), 22 + Math.floor(hash01(seed, 12) * 10)];

  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      if (layer === 'far') {
        const r = Math.round(skyTop[0] + (skyBot[0] - skyTop[0]) * t);
        const g = Math.round(skyTop[1] + (skyBot[1] - skyTop[1]) * t);
        const b = Math.round(skyTop[2] + (skyBot[2] - skyTop[2]) * t);
        const farRidge = ridgeAt(x, width, seed, height * 0.86, height * 0.025);
        if (y > farRidge) {
          setPx(rgba, width, x, y, rock[0], rock[1], rock[2], 255);
        } else {
          setPx(rgba, width, x, y, r, g, b, 255);
        }
        continue;
      }

      if (layer === 'mid') {
        const ridge = ridgeAt(x, width, seed + 17, height * 0.28, height * 0.16);
        if (y > ridge) {
          const n = hash01(seed, x + y * 2);
          setPx(rgba, width, x, y, rock[0] + n * 8, rock[1] + n * 6, rock[2] + n * 8, 255);
        } else {
          setPx(rgba, width, x, y, 0, 0, 0, 0);
        }
        continue;
      }

      if (layer === 'near' || layer === 'foreground') {
        const ridge = ridgeAt(x, width, seed + 31, height * 0.22, height * 0.14);
        if (y > ridge) {
          const n = hash01(seed, x * 5 + y);
          setPx(
            rgba,
            width,
            x,
            y,
            dark[0] + n * 6,
            dark[1] + n * 6,
            dark[2] + n * 8,
            layer === 'foreground' ? 230 : 255,
          );
        } else {
          setPx(rgba, width, x, y, 0, 0, 0, 0);
        }
        continue;
      }

      const inBand = t > 0.18 && t < 0.55 && hash01(seed, x + y * 7) > 0.88;
      setPx(rgba, width, x, y, skyBot[0], skyBot[1], skyBot[2], inBand ? 48 : 0);
    }
  }
  return encodePng(width, height, rgba);
}

function stripMask(layer: ParallaxLayerName, t: number): number {
  if (layer === 'far') return 1;
  if (layer === 'mid') {
    if (t < 0.32) return 0;
    if (t < 0.42) return (t - 0.32) / 0.1;
    if (t > 0.84) return 0;
    if (t > 0.74) return (0.84 - t) / 0.1;
    return 1;
  }
  if (layer === 'near' || layer === 'foreground') {
    if (t < 0.62) return 0;
    if (t < 0.72) return (t - 0.62) / 0.1;
    return 1;
  }
  if (t < 0.16 || t > 0.62) return 0;
  return 1;
}

/** Punch AI landscape plates into horizon strips so stacked layers do not ghost. */
export function punchParallaxAlpha(png: Buffer, layer: ParallaxLayerName): Buffer {
  if (layer === 'far') return png;
  const { rgba, width, height } = decodePngRgba(png);
  for (let y = 0; y < height; y++) {
    const m = stripMask(layer, y / Math.max(1, height - 1));
    if (m >= 1) continue;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i + 3] = Math.round((rgba[i + 3] ?? 255) * m);
    }
  }
  return encodePng(width, height, rgba);
}