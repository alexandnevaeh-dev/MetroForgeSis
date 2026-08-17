import { decodePngRgba, encodePng } from './png.js';

export type ParallaxLayerName = 'far' | 'mid' | 'near' | 'overlay' | 'foreground';

export const PARALLAX_STRIP_SIZE: Record<ParallaxLayerName, { width: number; height: number }> = {
  far: { width: 640, height: 360 },
  mid: { width: 640, height: 360 },
  near: { width: 640, height: 360 },
  overlay: { width: 640, height: 360 },
  foreground: { width: 640, height: 360 },
};

export const PARALLAX_LAYER_PROMPTS: Record<ParallaxLayerName, string> = {
  far: 'orthographic side-view INTERIOR FAR PLATE filling the entire frame, viewed from INSIDE a drowned tideglass citadel hall: receding glass-masonry vaults, iron ribs, moonlit clerestory ON THE BUILDING, flooded stone colonnades, architecture only, empty of people animals characters silhouettes figures, NOT an outdoor landscape, no pine trees, no conifers, no forest, no mountains, no lake, no shoreline, no nature vista, no UI, tileable left-right',
  mid: 'full-frame mid-ground parallax with SPARSE citadel arches and ruined columns, MOSTLY transparent air between masses, orthographic side-view, tileable left-right, no characters, no people, no trees, no UI, not a solid horizon bar',
  near: 'full-frame near parallax with hanging chains, vines, and side-pillar occluders, MOSTLY transparent playable air, orthographic side-view, tileable left-right, no characters, no trees, no UI, not a solid floor slab',
  overlay: 'sparse tide mist overlay, mostly transparent, no characters, no UI',
  foreground: 'dark citadel side occluders and hanging silhouettes, transparent playable air, no UI, no characters',
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

function columnCenters(width: number, seed: number, count: number, inset: number): number[] {
  const span = Math.max(1, width - inset * 2);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = (hash01(seed, 80 + i) - 0.5) * (span / count) * 0.28;
    out.push(Math.round(inset + ((i + 0.5) / count) * span + jitter));
  }
  return out;
}

/** Sparse ruined colonnade — playable air stays transparent. Never a filled horizon bar. */
function paintMidArchitecture(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  seed: number,
  masonry: [number, number, number],
): void {
  const count = 2;
  const cols = columnCenters(width, seed + 17, count, Math.round(width * 0.14));
  let hit = false;
  for (let ci = 0; ci < cols.length; ci++) {
    const cx = cols[ci]!;
    const colW = Math.max(5, Math.round(width * (0.02 + hash01(seed, 21 + ci) * 0.014)));
    const capital = Math.round(height * (0.36 + hash01(seed, 40 + ci) * 0.14));
    const floor = Math.round(height * (0.72 + hash01(seed, 60 + ci) * 0.08));
    if (Math.abs(x - cx) <= colW && y >= capital && y <= floor) hit = true;
    if (Math.abs(x - cx) <= colW + 2 && y >= capital - 4 && y <= capital + 2) hit = true;
    if (ci > 0 && hash01(seed, 90 + ci) > 0.35) {
      const a = cols[ci - 1]!;
      const midX = (a + cx) / 2;
      const archR = Math.abs(cx - a) / 2;
      const archY = capital + 6;
      const dist = Math.hypot(x - midX, y - archY);
      if (y >= archY && y < archY + 8 && dist < archR && dist > archR - 4) hit = true;
    }
  }
  if (!hit) {
    setPx(rgba, width, x, y, 0, 0, 0, 0);
    return;
  }
  const n = hash01(seed, x + y * 2);
  setPx(
    rgba,
    width,
    x,
    y,
    Math.round(masonry[0] + n * 10),
    Math.round(masonry[1] + n * 8),
    Math.round(masonry[2] + n * 10),
    210,
  );
}

/** Hanging chains / side piers / sparse ground debris — not a solid occupancy slab. */
function paintNearOccluders(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  seed: number,
  dark: [number, number, number],
  alpha: number,
): void {
  const leftPier = x < width * 0.055 && y > height * 0.12;
  const rightPier = x > width * 0.945 && y > height * 0.12;
  const chainXs = columnCenters(width, seed + 31, 5, Math.round(width * 0.12));
  const onChain = chainXs.some((cx) => Math.abs(x - cx) <= 1 && y < height * 0.42);
  const vine = chainXs.some(
    (cx) => Math.abs(x - cx) <= 3 && y < height * 0.28 && hash01(seed, x * 9 + Math.floor(y / 4)) > 0.55,
  );
  const debris =
    y > height * 0.9 &&
    hash01(seed, Math.floor(x / 6) * 13) > 0.72 &&
    Math.abs(x - width / 2) > width * 0.18;
  if (!(leftPier || rightPier || onChain || vine || debris)) {
    setPx(rgba, width, x, y, 0, 0, 0, 0);
    return;
  }
  const n = hash01(seed, x * 5 + y);
  setPx(
    rgba,
    width,
    x,
    y,
    Math.round(dark[0] + n * 8),
    Math.round(dark[1] + n * 8),
    Math.round(dark[2] + n * 10),
    alpha,
  );
}

/**
 * Procedural side-view parallax plates. Far is an opaque night-citadel interior (not a
 * pine/mountain/lake vista); mid/near keep empty air transparent so they sit as depth silhouettes.
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
  const masonry: [number, number, number] = [32 + Math.floor(hash01(seed, 7) * 10), 42 + Math.floor(hash01(seed, 8) * 8), 62 + Math.floor(hash01(seed, 9) * 10)];
  const dark: [number, number, number] = [10 + Math.floor(hash01(seed, 10) * 8), 14 + Math.floor(hash01(seed, 11) * 8), 22 + Math.floor(hash01(seed, 12) * 10)];

  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      if (layer === 'far') {
        const r = Math.round(skyTop[0] + (skyBot[0] - skyTop[0]) * t);
        const g = Math.round(skyTop[1] + (skyBot[1] - skyTop[1]) * t);
        const b = Math.round(skyTop[2] + (skyBot[2] - skyTop[2]) * t);
        setPx(rgba, width, x, y, r, g, b, 255);
        const moonX = Math.floor(width * 0.78);
        const moonY = Math.floor(height * 0.16);
        const md = (x - moonX) * (x - moonX) + (y - moonY) * (y - moonY);
        if (md < 36) setPx(rgba, width, x, y, 210, 220, 236, 255);
        // Distant irregular mass, not a repeating clerestory arcade (RearWall owns mid architecture).
        const ridge = ridgeAt(x, width, seed + 71, height * 0.88, height * 0.05);
        if (y > ridge) {
          const n = hash01(seed, x + y * 3);
          const depth = (y - ridge) / Math.max(1, height - ridge);
          setPx(
            rgba,
            width,
            x,
            y,
            Math.round(dark[0] + masonry[0] * 0.25 + n * 8 + depth * 6),
            Math.round(dark[1] + masonry[1] * 0.2 + n * 6 + depth * 4),
            Math.round(dark[2] + masonry[2] * 0.2 + n * 8 + depth * 8),
            255,
          );
        }
        continue;
      }

      if (layer === 'mid') {
        paintMidArchitecture(rgba, width, height, x, y, seed, masonry);
        continue;
      }

      if (layer === 'near' || layer === 'foreground') {
        paintNearOccluders(rgba, width, height, x, y, seed, dark, layer === 'foreground' ? 230 : 220);
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
  // Do not punch mid/near into a horizontal occupancy bar — keep authored transparency.
  if (layer === 'mid' || layer === 'near' || layer === 'foreground') return 1;
  if (t < 0.16 || t > 0.62) return 0;
  return 1;
}

/**
 * NVIDIA / FLUX often ignores "no pines" and emits an outdoor vista. True when the far plate
 * looks like foliage, skin-tone figures, or a green landscape rather than night masonry.
 */
export function farPlateLooksLikeOutdoorLandscape(png: Buffer): boolean {
  const { rgba, width, height } = decodePngRgba(png);
  let sampled = 0;
  let pine = 0;
  let skin = 0;
  let moonWater = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      const a = rgba[i + 3]!;
      if (a < 16) continue;
      sampled += 1;
      if (g > r + 18 && g > b + 8 && g > 48 && g < 190 && r < 150) pine += 1;
      const midX = x > width * 0.28 && x < width * 0.72;
      const midY = y > height * 0.18 && y < height * 0.72;
      if (midX && midY && r > 140 && g > 80 && g < 175 && b > 50 && b < 145 && r > g + 12 && r > b + 18) {
        skin += 1;
      }
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      // FLUX often paints a moon/window looking onto lake water instead of a citadel hall.
      const inWindow = midX && y > height * 0.12 && y < height * 0.88;
      if (inWindow && luma > 168 && b > 130 && g > 110 && r > 90) moonWater += 1;
    }
  }
  if (sampled === 0) return false;
  return pine / sampled > 0.032 || skin / sampled > 0.01 || moonWater / sampled > 0.045;
}

/** Punch AI landscape plates into horizon strips so stacked layers do not ghost. */
export function punchParallaxAlpha(png: Buffer, layer: ParallaxLayerName): Buffer {
  if (layer === 'far' || layer === 'mid' || layer === 'near' || layer === 'foreground') return png;
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