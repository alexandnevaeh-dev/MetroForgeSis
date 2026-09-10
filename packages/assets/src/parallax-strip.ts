import { decodePngRgba, encodePng } from './png.js';

export type ParallaxLayerName = 'far' | 'mid' | 'near' | 'overlay' | 'foreground';

/** Hex-string palette shape kept for API compatibility with callers that pass a bible
 *  palette object. generateParallaxStrip's own tone derivation uses the RGB-tuple
 *  `biomePalette` param; convert with parallaxPaletteToRgb() when only this shape is held. */
export interface ParallaxStripPalette {
  global?: string[];
  shadows?: string[];
  highlights?: string[];
  accents?: string[];
}

export function parallaxPaletteToRgb(p?: ParallaxStripPalette): [number, number, number][] | undefined {
  const hexes = [...(p?.global ?? []), ...(p?.shadows ?? []), ...(p?.highlights ?? [])];
  if (hexes.length === 0) return undefined;
  return hexes.map((hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return [30, 34, 42] as [number, number, number];
    const n = Number.parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as [number, number, number];
  });
}

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

/** Background overlay features generateParallaxStrip can actually render — a deliberate subset
 *  of TILESET_SUPPORTED_FEATURES (packages/assets/src/png.ts): 'panel_grates' is a structural
 *  wall-panel texture that doesn't apply to an atmospheric depth layer, so it's intentionally
 *  excluded here rather than silently accepted and ignored. */
export const BACKGROUND_SUPPORTED_FEATURES = ['corrosion', 'stains', 'damaged_modules', 'vegetation'] as const;
export type BackgroundFeature = (typeof BACKGROUND_SUPPORTED_FEATURES)[number];

export function partitionBackgroundFeatures(requested: readonly string[] | undefined): {
  supported: BackgroundFeature[];
  unsupported: string[];
} {
  const supported: BackgroundFeature[] = [];
  const unsupported: string[] = [];
  for (const f of requested ?? []) {
    if ((BACKGROUND_SUPPORTED_FEATURES as readonly string[]).includes(f)) supported.push(f as BackgroundFeature);
    else unsupported.push(f);
  }
  return { supported, unsupported };
}

function blendChannel(base: number, target: number, amount: number): number {
  return Math.round(base + (target - base) * amount);
}

/**
 * Adds sparse, deterministic material dressing on top of already-opaque pixels only — never
 * paints into transparent playable-air regions (mid/near/foreground layers are deliberately
 * "mostly transparent", see PARALLAX_LAYER_PROMPTS, and this must not change that), and never
 * touches the 'far' layer (the outdoor-landscape-vs-citadel QA check in
 * farPlateLooksLikeOutdoorLandscape looks for exactly this kind of green speckle and must keep
 * seeing the unmodified far plate for real AI-generated images — this overlay is procedural-only
 * dressing on mid/near/foreground, applied after the base paint pass, not before).
 */
function applyBackgroundMaterialFeatures(
  rgba: Uint8Array,
  width: number,
  height: number,
  seed: number,
  features: readonly BackgroundFeature[],
  accent: [number, number, number],
  accent2: [number, number, number],
): void {
  if (features.length === 0) return;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3]!;
      if (a < 40) continue; // only dress already-opaque architecture/occluder pixels
      let r = rgba[i]!;
      let g = rgba[i + 1]!;
      let b = rgba[i + 2]!;

      if (features.includes('corrosion')) {
        const speck = hash01(seed, x * 3 + y * 97 + 500);
        if (speck > 0.9) {
          const amt = 0.4 + (speck - 0.9) * 4;
          r = blendChannel(r, accent[0], amt);
          g = blendChannel(g, accent[1], amt);
          b = blendChannel(b, accent[2], amt);
        }
      }
      if (features.includes('stains')) {
        const col = Math.floor(x / 6);
        const streakOn = hash01(seed, col * 13 + 700) > 0.75;
        if (streakOn) {
          const amt = 0.25;
          r = blendChannel(r, accent2[0], amt);
          g = blendChannel(g, accent2[1], amt);
          b = blendChannel(b, accent2[2], amt);
        }
      }
      if (features.includes('damaged_modules')) {
        const block = Math.floor(x / 40) + Math.floor(y / 40) * 97;
        if (hash01(seed, block + 900) > 0.85) {
          r = blendChannel(r, accent[0], 0.5);
          g = blendChannel(g, accent[1], 0.5);
          b = blendChannel(b, accent[2], 0.5);
        }
      }
      if (features.includes('vegetation')) {
        const speck = hash01(seed, x * 5 + y * 31 + 1100);
        if (speck > 0.93) {
          const amt = 0.5;
          r = blendChannel(r, accent2[0], amt);
          g = blendChannel(g, accent2[1], amt);
          b = blendChannel(b, accent2[2], amt);
        }
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
    }
  }
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
  glow: [number, number, number],
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
  // The floor is a lit surface (warm glow bleeding across the ground), distinct in luma from the
  // dark pier/wall silhouette above it — a uniform dark blend here erased the sky's brightness
  // range exactly where the room reads "ground vs void" depth, collapsing lumaStdDev to ~5-7.
  if (floor) {
    const r = Math.round(glow[0] * 0.8 + masonry[0] * 0.25 + n * 10);
    const g = Math.round(glow[1] * 0.75 + masonry[1] * 0.22 + n * 8);
    const b = Math.round(glow[2] * 0.5 + masonry[2] * 0.25 + n * 8);
    setPx(rgba, width, x, y, Math.min(255, r), Math.min(255, g), Math.min(255, b), 255);
    return true;
  }
  // Pier/wall/dado mass (t≈0.46–0.8) gets a modest ramp toward the floor glow — enough that a
  // camera crop landing entirely within this band still sees real internal contrast, without
  // pushing so far that architecture and background converge to the same washed-out hue.
  const archT = Math.min(1, Math.max(0, (t - 0.46) / 0.34));
  const depth = Math.min(1, Math.max(0, (t - 0.48) / 0.52));
  const r = Math.round(dark[0] + masonry[0] * 0.32 + n * 8 + depth * 12 + archT * glow[0] * 0.55);
  const g = Math.round(dark[1] + masonry[1] * 0.28 + n * 6 + depth * 10 + archT * glow[1] * 0.46);
  const b = Math.round(dark[2] + masonry[2] * 0.45 + n * 10 + depth * 14 + archT * glow[2] * 0.24);
  setPx(rgba, width, x, y, r, g, b, 255);
  if (dado && hash01(seed, x * 5 + y) > 0.9) {
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
  if (Math.abs(x - cx) <= 1 && y > height * 0.16 && y < height * 0.48) {
    setPx(rgba, width, x, y, vault[0], vault[1], vault[2], 255);
  }
  const ly = Math.floor(height * 0.47);
  const d = (x - cx) * (x - cx) + (y - ly) * (y - ly);
  if (d <= 4 && hash01(seed, cell + 4) > 0.35) {
    setPx(rgba, width, x, y, lantern[0], lantern[1], lantern[2], 255);
  }
}

function scaleColor(c: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] * factor))),
    Math.max(0, Math.min(255, Math.round(c[1] * factor))),
    Math.max(0, Math.min(255, Math.round(c[2] * factor))),
  ];
}

/**
 * Procedural side-view parallax plates. Far is an opaque night-citadel interior (not a
 * pine/mountain/lake vista); mid/near keep empty air transparent so they sit as depth silhouettes.
 *
 * `biomePalette` (when given, shape `[dark, mid, bright, accent]` — matches
 * asset-pipeline.ts's BIOME_PALETTES entries) drives the actual hue family, so 3 different
 * biomes read as 3 different places instead of the same "drowned citadel blue" regardless of
 * which biome was requested — the seed alone only ever produced small in-family jitter.
 */
export function generateParallaxStrip(
  layer: ParallaxLayerName,
  seed: number,
  width = 640,
  height = 360,
  biomePalette?: [number, number, number][] | ParallaxStripPalette,
  /** Optional material dressing (see BACKGROUND_SUPPORTED_FEATURES) applied on top of already-
   *  opaque architecture pixels on mid/near/foreground layers — never on 'far' (see
   *  applyBackgroundMaterialFeatures' doc comment). Omitted -> byte-identical to every existing
   *  caller. */
  features?: readonly string[],
): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  const palette: [number, number, number][] | undefined = Array.isArray(biomePalette)
    ? biomePalette
    : parallaxPaletteToRgb(biomePalette);
  // Drowned-citadel night sky (#284878 family) is the default when no biome palette is supplied.
  // Wide top-to-bottom luma spread (near-void top -> warm lantern glow near the floor) so the
  // depth axis has real contrast instead of a narrow 25-unit navy band — a flat gradient here
  // reads as "wallpaper" to the deterministic screenshot QA critic (occupancy~1, lumaStdDev<10)
  // regardless of how much geometric detail is painted on top of it.
  const jitter = (n: number, span: number) => Math.floor(hash01(seed, n) * span);
  const paletteDark = palette?.[0];
  const paletteMid = palette?.[1];
  // Prefer the warmest palette swatch (highest R-B) for the lower-sky glow so a mechanical-forge
  // palette's cyan energy accent does not turn the whole plate blue. Falls back to [2]/[3].
  const warmest = palette
    ? [...palette].sort((a, b) => (b[0] - b[2]) - (a[0] - a[2]))[0]
    : undefined;
  const paletteBright = warmest ?? palette?.[2] ?? palette?.[3];
  // Keep blue <= green on the derived structural tones so soot/ember palettes never paint the
  // architecture as disconnected cold-blue "beacons" (Foundry warm-clamp parity).
  const warmClamp = (c: [number, number, number]): [number, number, number] =>
    palette ? [c[0], c[1], Math.min(c[2], c[1])] : c;
  const skyTop: [number, number, number] = warmClamp(
    paletteDark
      ? scaleColor(paletteDark, 0.22 + hash01(seed, 1) * 0.1)
      : [4 + jitter(1, 6), 26 + jitter(2, 8), 36 + jitter(3, 14)],
  );
  const skyBot: [number, number, number] = warmClamp(
    paletteBright
      ? scaleColor(paletteBright, 0.85 + hash01(seed, 4) * 0.25)
      : [34 + jitter(4, 16), 108 + jitter(5, 20), 185 + jitter(6, 20)],
  );
  const masonry: [number, number, number] = warmClamp(
    paletteMid
      ? scaleColor(paletteMid, 0.55 + hash01(seed, 7) * 0.15)
      : [32 + jitter(7, 10), 42 + jitter(8, 8), 62 + jitter(9, 10)],
  );
  // Near-black silhouette base for the hall mass/piers/occluders — deliberately below the QA
  // critic's visibility luma threshold so architecture reads as true silhouette against the glow
  // instead of a mid-tone blend barely distinguishable from the sky at the same height.
  const dark: [number, number, number] = warmClamp(
    paletteDark
      ? scaleColor(paletteDark, 0.08 + hash01(seed, 10) * 0.05)
      : [3 + jitter(10, 4), 5 + jitter(11, 4), 9 + jitter(12, 6)],
  );
  // Warm structural accents for the far-plate vault ribs and lanterns.
  const vaultTone: [number, number, number] = palette
    ? warmClamp(scaleColor(paletteMid ?? masonry, 0.9))
    : [34, 52, 108];
  const lanternTone: [number, number, number] = paletteBright
    ? [
        Math.min(255, Math.round(paletteBright[0] * 0.5 + 128)),
        Math.min(255, Math.round(paletteBright[1] * 0.5 + 96)),
        Math.min(255, Math.round(Math.min(paletteBright[2], paletteBright[1]) * 0.5 + 60)),
      ]
    : [168, 148, 78];

  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1);
    // Eased so most of the frame stays near the dark void and brightness concentrates lower —
    // paired with the pier/wall archT ramp above so a crop landing entirely in the architecture
    // band (floor off-screen) still has real internal contrast instead of depending solely on
    // where the floor happens to be relative to the camera.
    const tEased = t * t * t * t * t;
    for (let x = 0; x < width; x++) {
      if (layer === 'far') {
        const r = Math.round(skyTop[0] + (skyBot[0] - skyTop[0]) * tEased);
        const g = Math.round(skyTop[1] + (skyBot[1] - skyTop[1]) * tEased);
        const b = Math.round(skyTop[2] + (skyBot[2] - skyTop[2]) * tEased);
        setPx(rgba, width, x, y, r, g, b, 255);
        paintFarHallMass(rgba, width, height, x, y, seed, masonry, dark, skyBot);
        paintFarVaultAndLanterns(rgba, width, height, x, y, seed, vaultTone, lanternTone);
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
  if (layer !== 'far') {
    const { supported } = partitionBackgroundFeatures(features);
    if (supported.length > 0) {
      const accent = palette?.[4] ?? masonry;
      const accent2 = palette?.[5] ?? dark;
      applyBackgroundMaterialFeatures(rgba, width, height, seed, supported, accent, accent2);
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