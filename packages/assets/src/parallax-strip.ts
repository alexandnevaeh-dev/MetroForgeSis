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
  near: 'full-frame near parallax with hanging chains, vines, and low rubble at the sides, MOSTLY transparent playable air, orthographic side-view, tileable left-right, no characters, no trees, no UI, no full-height side piers, not a solid floor slab',
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
    const colW = Math.max(11, Math.round(width * (0.036 + hash01(seed, 21 + ci) * 0.02)));
    const capital = Math.round(height * (0.48 + hash01(seed, 40 + ci) * 0.1));
    const floor = Math.round(height * (0.74 + hash01(seed, 60 + ci) * 0.06));
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
  const leftPier = x < width * 0.04 && y > height * 0.72;
  const rightPier = x > width * 0.96 && y > height * 0.72;
  const chainXs = columnCenters(width, seed + 31, 4, Math.round(width * 0.16));
  const onChain =
    chainXs.some((cx) => Math.abs(x - cx) <= 1 && y < height * 0.22 && y % 5 < 2);
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

/** Receding drowned-hall: floor, dado, and vertical bays — not a filled hill silhouette. */
function paintFarHallMass(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  seed: number,
  masonry: [number, number, number],
  dark: [number, number, number],
): boolean {
  const t = y / Math.max(1, height - 1);
  const bay = Math.max(28, Math.round(width / 6));
  const local = ((x % bay) + bay) % bay;
  const pierW = Math.max(5, Math.round(bay * 0.18));
  const onPier = local < pierW || local > bay - 1 - pierW;
  const floor = t > 0.8;
  const dado = t > 0.7 && t <= 0.8;
  const pier = onPier && t > 0.48;
  const capital = onPier && t > 0.46 && t < 0.5;
  const soffit =
    t > 0.5 &&
    t < 0.58 &&
    !onPier &&
    Math.abs(local - bay * 0.5) < 3;
  if (!(floor || dado || pier || capital || soffit)) return false;
  const n = hash01(seed, x + y * 3);
  const depth = Math.min(1, Math.max(0, (t - 0.48) / 0.52));
  const r = Math.round(dark[0] + masonry[0] * 0.32 + n * 8 + depth * 12);
  const g = Math.round(dark[1] + masonry[1] * 0.28 + n * 6 + depth * 10);
  const b = Math.round(dark[2] + masonry[2] * 0.45 + n * 10 + depth * 14);
  setPx(rgba, width, x, y, r, g, b, 255);
  if ((floor || dado) && hash01(seed, x * 5 + y) > 0.9) {
    setPx(rgba, width, x, y, Math.min(255, r + 22), Math.min(255, g + 16), Math.max(0, b - 6), 255);
  }
  return true;
}

function paintFarVaultAndLanterns(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  seed: number,
  vault: [number, number, number] = [34, 52, 108],
  lantern: [number, number, number] = [168, 148, 78],
): void {
  const bay = Math.max(28, Math.round(width / 6));
  const cell = Math.floor(x / bay);
  const cx = Math.round(cell * bay + bay * 0.5);
  const rib = Math.abs(x - cx) <= 1 && y > height * 0.16 && y < height * 0.48;
  const trussY = Math.floor(height * 0.40);
  const onTruss = y >= trussY && y <= trussY + 2 && Math.abs(x - cx) < bay * 0.42;
  const bracket =
    Math.abs(x - cx) <= 3 && y >= trussY && y < trussY + 8 && hash01(seed, cell + 2) > 0.25;
  if (rib || onTruss || bracket) {
    setPx(rgba, width, x, y, vault[0], vault[1], vault[2], 255);
  }
  const ly = Math.floor(height * 0.47);
  const d = (x - cx) * (x - cx) + (y - ly) * (y - ly);
  if (d <= 4 && hash01(seed, cell + 4) > 0.35) {
    setPx(rgba, width, x, y, lantern[0], lantern[1], lantern[2], 255);
  }
}

/**
 * Procedural side-view parallax plates. Far is an opaque night-citadel interior (not a
 * pine/mountain/lake vista); mid/near keep empty air transparent so they sit as depth silhouettes.
 */
export interface ParallaxStripPalette {
  global?: string[];
  shadows?: string[];
  highlights?: string[];
  accents?: string[];
}

function pstripHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [30, 34, 42];
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Warm foundry backdrop tones from the biome palette. The far plate fills the camera's
 *  contain-zoom side-margins, so a hardcoded navy night sky reads as dead-navy margin bars in a
 *  mechanical-forge slice. Deriving the gradient from the palette turns those margins into warm
 *  soot/ember atmosphere without touching the camera (climb geometry is never cropped). Returns
 *  null when no palette is supplied so the default drowned-citadel behavior is unchanged. */
function foundryStripTones(
  palette: ParallaxStripPalette | undefined,
  seed: number,
): {
  skyTop: [number, number, number];
  skyBot: [number, number, number];
  masonry: [number, number, number];
  dark: [number, number, number];
  vault: [number, number, number];
  lantern: [number, number, number];
} | null {
  const globals = (palette?.global ?? []).map(pstripHex);
  const shadows = (palette?.shadows ?? []).map(pstripHex);
  if (globals.length === 0) return null;
  const lum = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const pool = [...globals, ...shadows];
  const voidTone = [...pool].sort((a, b) => lum(a) - lum(b))[0]!;
  const warm = [...globals].sort((a, b) => b[0] - b[2] - (a[0] - a[2]))[0]!;
  const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
  const jit = (n: number) => Math.floor(hash01(seed, n) * 8);
  // Warm the shadow tones and clamp their blue channel. The foundry palette's darkest swatches
  // (#07070b void, #101018 navy) are blue-black, so a naive dark tone paints the near-parallax
  // hanging chains/piers a cold blue that reads as disconnected blue beacons against the warm
  // soot background. Keeping blue <= green makes them soot shadows that belong to the palette.
  const warmClamp = (c: [number, number, number]): [number, number, number] => [c[0], c[1], Math.min(c[2], c[1])];
  const masonryTone = warmClamp(mix(voidTone, warm, 0.2).map((v, i) => v + jit(i + 7)) as [number, number, number]);
  return {
    skyTop: warmClamp(mix(voidTone, warm, 0.1).map((v, i) => v + jit(i + 1)) as [number, number, number]),
    skyBot: mix(voidTone, warm, 0.3).map((v, i) => v + jit(i + 4)) as [number, number, number],
    masonry: masonryTone,
    dark: warmClamp(mix(voidTone, warm, 0.06).map((v, i) => v + jit(i + 10)) as [number, number, number]),
    // Far-plate vault ribs and lanterns: warm structural tone + warm amber glow, so they read as
    // foundry architecture instead of the hardcoded cold-blue "beacons" against the warm backdrop.
    vault: warmClamp(mix(masonryTone, warm, 0.4) as [number, number, number]),
    lantern: mix(warm, [255, 214, 150], 0.45) as [number, number, number],
  };
}

export function generateParallaxStrip(
  layer: ParallaxLayerName,
  seed: number,
  width = 640,
  height = 360,
  palette?: ParallaxStripPalette,
): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  const foundry = foundryStripTones(palette, seed);
  // Drowned-citadel night sky (#284878 family). Do not drift into cream/green landscape slabs.
  const skyTop: [number, number, number] = foundry?.skyTop ?? [22 + Math.floor(hash01(seed, 1) * 10), 38 + Math.floor(hash01(seed, 2) * 12), 70 + Math.floor(hash01(seed, 3) * 14)];
  const skyBot: [number, number, number] = foundry?.skyBot ?? [36 + Math.floor(hash01(seed, 4) * 10), 64 + Math.floor(hash01(seed, 5) * 14), 108 + Math.floor(hash01(seed, 6) * 16)];
  const masonry: [number, number, number] = foundry?.masonry ?? [32 + Math.floor(hash01(seed, 7) * 10), 42 + Math.floor(hash01(seed, 8) * 8), 62 + Math.floor(hash01(seed, 9) * 10)];
  const dark: [number, number, number] = foundry?.dark ?? [10 + Math.floor(hash01(seed, 10) * 8), 14 + Math.floor(hash01(seed, 11) * 8), 22 + Math.floor(hash01(seed, 12) * 10)];
  const vault: [number, number, number] = foundry?.vault ?? [34, 52, 108];
  const lantern: [number, number, number] = foundry?.lantern ?? [168, 148, 78];

  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      if (layer === 'far') {
        const r = Math.round(skyTop[0] + (skyBot[0] - skyTop[0]) * t);
        const g = Math.round(skyTop[1] + (skyBot[1] - skyTop[1]) * t);
        const b = Math.round(skyTop[2] + (skyBot[2] - skyTop[2]) * t);
        setPx(rgba, width, x, y, r, g, b, 255);
        paintFarHallMass(rgba, width, height, x, y, seed, masonry, dark);
        paintFarVaultAndLanterns(rgba, width, height, x, y, seed, vault, lantern);
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
  return pine / sampled > 0.032 || skin / sampled > 0.01 || moonWater / sampled > 0.03;
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