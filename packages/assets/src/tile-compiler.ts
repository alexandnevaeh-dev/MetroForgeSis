import { decodePngRgba, encodePng } from './png.js';
import { PixelArtProcessor } from './pixel-art-processor.js';

/** Canonical autotile atlas layout (8 columns × 6 rows). */
export const TILE_ATLAS = {
  cols: 8,
  rows: 6,
  roles: {
    ground: { col: 0, row: 0 },
    wall: { col: 1, row: 0 },
    ceiling: { col: 2, row: 0 },
    platform: { col: 3, row: 0 },
    left_edge: { col: 4, row: 0 },
    right_edge: { col: 5, row: 0 },
    top_edge: { col: 6, row: 0 },
    bottom_edge: { col: 7, row: 0 },
    outside_tl: { col: 0, row: 1 },
    outside_tr: { col: 1, row: 1 },
    outside_bl: { col: 2, row: 1 },
    outside_br: { col: 3, row: 1 },
    inside_tl: { col: 4, row: 1 },
    inside_tr: { col: 5, row: 1 },
    inside_bl: { col: 6, row: 1 },
    inside_br: { col: 7, row: 1 },
    platform_left: { col: 0, row: 2 },
    platform_right: { col: 1, row: 2 },
    one_way: { col: 2, row: 2 },
    hazard: { col: 3, row: 2 },
    breakable: { col: 4, row: 2 },
    door: { col: 5, row: 2 },
    decor_a: { col: 6, row: 2 },
    decor_b: { col: 7, row: 2 },
    ground_wear: { col: 0, row: 3 },
    wall_wear: { col: 1, row: 3 },
    ceiling_wear: { col: 2, row: 3 },
    platform_wear: { col: 3, row: 3 },
    ground_crack: { col: 4, row: 3 },
    wall_crack: { col: 5, row: 3 },
    ground_moss: { col: 0, row: 4 },
    wall_moss: { col: 1, row: 4 },
    ceiling_moss: { col: 2, row: 4 },
    platform_moss: { col: 3, row: 4 },
    ground_rare: { col: 4, row: 4 },
    wall_rare: { col: 5, row: 4 },
  },
} as const;

export type TileRole = keyof typeof TILE_ATLAS.roles;

export interface CompiledTileset {
  atlas: Buffer;
  tileSize: number;
  width: number;
  height: number;
  tiles: Map<string, Buffer>;
  transformations: string[];
  seamIssues: string[];
  passed: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [60, 64, 78];
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luma(rgb: [number, number, number]): number {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

/** Sky / paper / cream fills from landscape sources must not become walkable stone. */
function clampTerrainFill(rgb: [number, number, number]): [number, number, number] {
  const L = luma(rgb);
  if (L > 150) return shade(rgb, Math.max(0.32, 118 / L));
  if (L < 22) return shade(rgb, Math.min(2.2, 36 / Math.max(L, 1)));
  return rgb;
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

interface RoleFills {
  wall: [number, number, number];
  ground: [number, number, number];
  ceiling: [number, number, number];
  platform: [number, number, number];
  hazard: [number, number, number];
  door: [number, number, number];
  accent: [number, number, number];
  mortar: [number, number, number];
}

function isSkyFill(rgb: [number, number, number]): boolean {
  return rgb[2] > rgb[1] + 15 && rgb[2] > rgb[0] + 25;
}

function isGrassFill(rgb: [number, number, number]): boolean {
  return rgb[1] > rgb[0] + 25 && rgb[1] > rgb[2] + 15;
}

function isGoldFill(rgb: [number, number, number]): boolean {
  return rgb[0] > 140 && rgb[1] > 100 && rgb[2] < 90 && rgb[0] > rgb[2] + 30;
}

function ensureLuma(rgb: [number, number, number], minL: number, maxL: number): [number, number, number] {
  const L = luma(rgb);
  if (L < minL) return shade(rgb, minL / Math.max(L, 1));
  if (L > maxL) return shade(rgb, maxL / L);
  return rgb;
}

function asMasonry(rgb: [number, number, number]): [number, number, number] {
  // Drowned-citadel wet glass-stone. Keep G/B ahead of R so screenshots do not read as greybox.
  const wet: [number, number, number] = [36, 148, 158];
  return ensureLuma(mixRgb(rgb, wet, 0.88), 78, 128);
}

function pickRoleFills(extracted: [number, number, number][], hex: [number, number, number][]): RoleFills {
  const candidates = [...extracted, ...hex]
    .map(clampTerrainFill)
    .filter((c) => luma(c) > 28 && luma(c) < 168)
    .filter((c) => !isSkyFill(c) && !isGrassFill(c) && !isGoldFill(c));
  const wall = asMasonry(candidates[0] ?? [64, 92, 90]);
  const ground = ensureLuma(shade(wall, 0.78), 48, Math.max(48, luma(wall) - 8));
  const ceiling = ensureLuma(shade(wall, 0.62), 40, Math.max(40, luma(ground) - 4));
  // Ledges stay in the masonry family — grass/gold bible tokens are pickups, not walkable tops.
  const platform = ensureLuma(mixRgb(wall, [110, 98, 78], 0.22), luma(wall) + 4, 118);
  return {
    wall,
    ground,
    ceiling,
    platform,
    hazard: clampTerrainFill(extracted[3] ?? hex[3] ?? [200, 80, 80]),
    door: clampTerrainFill(extracted.find((c) => c[2] > c[0]) ?? hex[2] ?? [90, 140, 220]),
    accent: clampTerrainFill(extracted[2] ?? hex[2] ?? [90, 140, 220]),
    mortar: shade(wall, 0.32),
  };
}

function fillForRole(kind: TileRole, fills: RoleFills): [number, number, number] {
  if (kind === 'hazard') return fills.hazard;
  if (kind === 'door') return fills.door;
  if (kind.startsWith('decor')) return fills.accent;
  if (kind === 'breakable') return shade(fills.wall, 0.88);
  if (kind.includes('platform') || kind === 'one_way') return fills.platform;
  if (kind.includes('moss')) return mixRgb(fillForRole(kind.replace('_moss', '') as TileRole, fills), [72, 110, 86], 0.28);
  if (kind.includes('wear') || kind.includes('crack') || kind.includes('rare')) {
    const base = fillForRole(kind.replace(/_wear|_crack|_rare/g, '') as TileRole, fills);
    return kind.includes('crack') ? shade(base, 0.82) : mixRgb(base, fills.mortar, 0.18);
  }
  if (kind === 'ground' || kind === 'bottom_edge' || kind === 'outside_bl' || kind === 'outside_br') {
    return fills.ground;
  }
  if (kind === 'ceiling' || kind === 'top_edge' || kind === 'outside_tl' || kind === 'outside_tr') {
    return fills.ceiling;
  }
  return fills.wall;
}

function setPixel(rgba: Uint8Array, w: number, x: number, y: number, rgb: [number, number, number], a = 255): void {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  rgba[i] = rgb[0];
  rgba[i + 1] = rgb[1];
  rgba[i + 2] = rgb[2];
  rgba[i + 3] = a;
}

function shade(rgb: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.max(0, Math.min(255, Math.round(rgb[0] * amount))),
    Math.max(0, Math.min(255, Math.round(rgb[1] * amount))),
    Math.max(0, Math.min(255, Math.round(rgb[2] * amount))),
  ];
}

/** Five-tone material ramp derived from a role's base fill color. Index 0 is the brightest
 * highlight tone, 2 is the raw fill, 4 is the deepest shadow tone. Kept anchored on the exact
 * `shade(fill, 1.25)`/`shade(fill, 0.55)` values the original flat-fill renderer used for its
 * highlight/shadow corners, so overall tile lighting direction is unchanged — only the amount of
 * distinguishable material detail *within* each lighting band increases. */
function buildRamp(fill: [number, number, number]): [number, number, number][] {
  return [
    shade(fill, 1.25),
    shade(fill, 1.1),
    fill,
    shade(fill, 0.8),
    shade(fill, 0.55),
  ];
}

/** FNV-1a style integer hash — deterministic, no Math.random, same inputs always produce the
 * same output so procedural texture is reproducible across runs/machines (same standard Phase 2
 * held deterministic pose fallback to). */
function hashInt(...vals: number[]): number {
  let h = 2166136261;
  for (const v of vals) {
    h ^= v | 0;
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  return h >>> 0;
}

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function hash01(...vals: number[]): number {
  return (hashInt(...vals) % 10000) / 10000;
}

/** 4x4 ordered (Bayer) dither matrix. Produces a disciplined, repeating pixel-art dither grain
 * instead of white noise — the same technique retro tile sets use to fake extra material tones
 * out of a small palette without reading as garbled static. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function ditherOffset(x: number, y: number): number {
  // Only the matrix's two most extreme corners nudge a pixel (~4/16 of the tile combined) — a
  // subtle grain accent, not a dominant checkerboard. The structural motifs (mortar coursing,
  // cracks, plank seams) are what should read first at a glance; dither is a texture-of-texture
  // detail on top of them.
  const v = BAYER4[y & 3]![x & 3]! / 16;
  if (v > 0.85) return 1;
  if (v < 0.15) return -1;
  return 0;
}

/** Deterministic structural motif per role family — mortar coursing for masonry-like roles
 * (ground/wall/ceiling/edges/corners/platform), crack accents for `breakable`, plank seams for
 * `door`, organic mottling for `decor_*`. This is what keeps a texture-less procedural fallback
 * (no AI source image available) from being just a differently-colored flat rectangle: the tile
 * still carries a real, recognizable material pattern even with zero source pixels to sample.
 * Returned offsets are in ramp-index space, where a *higher* index is darker (see buildRamp) —
 * positive values darken (mortar joints, cracks, seams), negative values lighten (flecks). */
function roleStructureOffset(kind: TileRole, x: number, y: number, tileSize: number): number {
  if (kind === 'breakable') {
    const d = (x - y + tileSize * 4) % tileSize;
    if (d === 0 || d === tileSize - 1) return 2;
    if (d === 1 || d === tileSize - 2) return 1;
    return 0;
  }
  if (kind === 'door') {
    const seg = Math.max(2, Math.floor(tileSize / 4));
    return x % seg === 0 ? 1 : 0;
  }
  if (kind.startsWith('decor')) {
    if (hash01(x * 13, y * 7) > 0.72) return 1;
    if (hash01(x * 17, y * 3) < 0.16) return -1;
    return 0;
  }
  if (kind === 'hazard' || kind === 'one_way') {
    return hash01(x * 5, y * 11) > 0.6 ? 1 : 0;
  }
  // Masonry: different coursing so ground brick, wall ashlar, and platform flagstone do not
  // stamp as the same 4px grid. Platforms get a light cap so ledges read at a glance.
  const isWall =
    kind === 'wall' ||
    kind.includes('left') ||
    kind.includes('right') ||
    kind.startsWith('outside') ||
    kind.startsWith('inside');
  const isPlatform = kind.includes('platform');
  const isCeiling = kind === 'ceiling' || kind === 'top_edge';
  if (isPlatform && y <= 2) return -1;
  let courseHeight = Math.max(3, Math.floor(tileSize / 8));
  let jointWidth = Math.max(3, Math.floor(tileSize / 4));
  if (isWall) {
    courseHeight = Math.max(6, Math.floor(tileSize / 4));
    jointWidth = Math.max(6, Math.floor(tileSize / 3));
  } else if (isPlatform) {
    courseHeight = Math.max(5, Math.floor(tileSize / 5));
    jointWidth = Math.max(8, Math.floor(tileSize / 2));
  } else if (isCeiling) {
    courseHeight = Math.max(3, Math.floor(tileSize / 10));
    jointWidth = Math.max(5, Math.floor(tileSize / 3));
  }
  const rowInCourse = y % courseHeight;
  if (rowInCourse === 0) return 2;
  const course = Math.floor(y / courseHeight);
  const stagger = course % 2 === 0 ? 0 : Math.floor(jointWidth / 2);
  if ((x + stagger) % jointWidth === 0) return 1;
  return 0;
}

interface TexturePatch {
  data: Float32Array;
  mean: number;
}

/** Sample a real local patch of pixels out of the AI-generated biome source image (rather than
 * reducing the whole image to a global dominant-color histogram) and reduce it to a normalized
 * luminance field. Only the *spatial pattern* (grain, cracks, brick lines — whatever texture the
 * real source art contains) is kept; the actual output color still comes from the role's fill
 * ramp, so real source detail shows through without photo-texture colors breaking the limited
 * pixel-art palette. Different roles/tiles sample different deterministic sub-regions (via
 * `seed`) so the atlas doesn't repeat one patch everywhere. */
function extractTexturePatch(png: Buffer, tileSize: number, seed: number): TexturePatch | null {
  try {
    const { rgba, width, height } = decodePngRgba(png);
    if (width < 4 || height < 4) return null;
    const regionW = Math.max(4, Math.floor(width / 2));
    const regionH = Math.max(4, Math.floor(height / 2));
    const maxOx = Math.max(0, width - regionW);
    const maxOy = Math.max(0, height - regionH);
    const ox = maxOx > 0 ? hashInt(seed, 1) % (maxOx + 1) : 0;
    const oy = maxOy > 0 ? hashInt(seed, 2) % (maxOy + 1) : 0;
    const data = new Float32Array(tileSize * tileSize);
    let sum = 0;
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const sx = Math.min(width - 1, ox + Math.floor((x / tileSize) * regionW));
        const sy = Math.min(height - 1, oy + Math.floor((y / tileSize) * regionH));
        const si = (sy * width + sx) * 4;
        const a = rgba[si + 3]!;
        const lum = a < 16 ? 0.5 : (0.299 * rgba[si]! + 0.587 * rgba[si + 1]! + 0.114 * rgba[si + 2]!) / 255;
        const idx = y * tileSize + x;
        data[idx] = lum;
        sum += lum;
      }
    }
    return { data, mean: sum / data.length };
  } catch {
    return null;
  }
}

function paintTile(
  rgba: Uint8Array,
  atlasW: number,
  originX: number,
  originY: number,
  tileSize: number,
  fill: [number, number, number],
  kind: TileRole,
  patch: TexturePatch | null = null,
  mortar?: [number, number, number],
): void {
  const ramp = buildRamp(fill);
  const outline: [number, number, number] = mortar ?? shade(fill, 0.28);
  const roleSeed = hashString(kind);
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      let c = fill;
      // Interior texture only — keep the shared 1px edge as the flat base fill so adjacent
      // autotile roles (ground|wall) do not invent a hard seam (measureSeams() below asserts this).
      const interior = x > 0 && x < tileSize - 1 && y > 0 && y < tileSize - 1;
      if (interior) {
        let tier = 2; // base fill tone
        if (x + y < tileSize * 0.35) tier = 0;
        else if (x > tileSize * 0.75 || y > tileSize * 0.8) tier = 4;
        tier += roleStructureOffset(kind, x, y, tileSize);
        if (patch) {
          const lum = patch.data[y * tileSize + x]!;
          // Brighter source pixel than the patch average -> lighter tile pixel (lower/brighter
          // ramp index); darker source pixel -> darker tile pixel (higher/darker ramp index).
          tier += Math.round((patch.mean - lum) * 5);
        } else {
          // No AI source image for this run (procedural-only generation) — still perturb with a
          // deterministic per-tile hash so the fallback isn't a second flat color.
          tier += hash01(x * 3 + roleSeed, y * 7 + roleSeed) > 0.82 ? 1 : 0;
        }
        tier += ditherOffset(x, y);
        tier = Math.max(0, Math.min(ramp.length - 1, tier));
        c = ramp[tier]!;
      }
      if (kind === 'hazard' && (x + y) % 8 === 0) c = mixRgb(fill, [48, 96, 118], 0.45);
      if (kind === 'one_way' && y > tileSize / 3) {
        setPixel(rgba, atlasW, originX + x, originY + y, fill, 0);
        continue;
      }
      if (kind.startsWith('decor') && (x - tileSize / 2) ** 2 + (y - tileSize / 2) ** 2 > (tileSize / 2.4) ** 2) {
        setPixel(rgba, atlasW, originX + x, originY + y, fill, 0);
        continue;
      }
      setPixel(rgba, atlasW, originX + x, originY + y, c);
    }
  }
  const masonry =
    !kind.startsWith('decor') && kind !== 'hazard' && kind !== 'one_way' && kind !== 'door';
  const edge = (kind.includes('left') || kind === 'outside_tl' || kind === 'outside_bl' || kind === 'inside_tl' || kind === 'inside_bl');
  const right = kind.includes('right') || kind === 'outside_tr' || kind === 'outside_br' || kind === 'inside_tr' || kind === 'inside_br';
  const top = kind.includes('top') || kind.startsWith('outside_t') || kind.startsWith('inside_t') || kind === 'ceiling' || kind === 'platform' || kind === 'one_way';
  const bottom = kind.includes('bottom') || kind.startsWith('outside_b') || kind.startsWith('inside_b') || kind === 'ground';
  for (let i = 0; i < tileSize; i++) {
    if (masonry || top) setPixel(rgba, atlasW, originX + i, originY, outline);
    if (masonry || bottom) setPixel(rgba, atlasW, originX + i, originY + tileSize - 1, outline);
    if (masonry || edge) setPixel(rgba, atlasW, originX, originY + i, outline);
    if (masonry || right) setPixel(rgba, atlasW, originX + tileSize - 1, originY + i, outline);
  }
}

function extractDominantPalette(png: Buffer, max = 6): [number, number, number][] {
  try {
    const { rgba } = decodePngRgba(png);
    const buckets = new Map<number, number>();
    for (let i = 0; i < rgba.length; i += 16) {
      const a = rgba[i + 3]!;
      if (a < 32) continue;
      const r = rgba[i]! >> 4;
      const g = rgba[i + 1]! >> 4;
      const b = rgba[i + 2]! >> 4;
      const key = (r << 8) | (g << 4) | b;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([key]) => {
        const r = ((key >> 8) & 15) * 17;
        const g = ((key >> 4) & 15) * 17;
        const b = (key & 15) * 17;
        return [r, g, b] as [number, number, number];
      });
  } catch {
    return [];
  }
}

function sliceAtlas(atlas: Buffer, tileSize: number): Map<string, Buffer> {
  return new PixelArtProcessor().sliceTiles(atlas, tileSize);
}

function measureSeams(atlas: Buffer, tileSize: number): string[] {
  const { rgba, width } = decodePngRgba(atlas);
  const issues: string[] = [];
  const sample = (col: number, row: number, lx: number, ly: number) => {
    const x = col * tileSize + lx;
    const y = row * tileSize + ly;
    const i = (y * width + x) * 4;
    return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!] as const;
  };
  const delta = (a: readonly number[], b: readonly number[]) =>
    Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!);
  // Ground should edge-match wallish neighbors on shared lighting.
  let mismatch = 0;
  for (let y = 2; y < tileSize - 2; y++) {
    const left = sample(0, 0, tileSize - 1, y);
    const right = sample(1, 0, 0, y);
    if (delta(left, right) > 90) mismatch++;
  }
  if (mismatch > tileSize * 0.5) {
    issues.push('visible vertical seam between ground and wall tiles');
  }
  const first = sliceAtlas(atlas, tileSize).get('tile_0_0');
  if (first) {
    const d = decodePngRgba(first);
    if (d.width !== tileSize || d.height !== tileSize) {
      issues.push(`tile dimension mismatch ${d.width}x${d.height} vs ${tileSize}`);
    }
  }
  return issues;
}

/**
 * Compile a gameplay tileset. AI source is treated as palette/material reference only.
 * The atlas is a deterministic autotile so adjacent cells share lighting and edges.
 */
export class TileCompiler {
  compile(opts: {
    sourcePng?: Buffer;
    tileSize: number;
    paletteHex?: string[];
  }): CompiledTileset {
    const tileSize = opts.tileSize;
    const width = TILE_ATLAS.cols * tileSize;
    const height = TILE_ATLAS.rows * tileSize;
    const rgba = new Uint8Array(width * height * 4);
    const extracted = opts.sourcePng ? extractDominantPalette(opts.sourcePng) : [];
    const hex = (opts.paletteHex ?? []).map(hexToRgb);
    const roleFills = pickRoleFills(extracted, hex);

    for (const [role, pos] of Object.entries(TILE_ATLAS.roles)) {
      const fill = fillForRole(role as TileRole, roleFills);
      // Each role samples a different deterministic sub-region of the source image so the atlas
      // doesn't repeat one patch across every cell; undefined sourcePng falls through to the
      // procedural hash texture inside paintTile() (see roleStructureOffset/ditherOffset).
      const patch = opts.sourcePng
        ? extractTexturePatch(opts.sourcePng, tileSize, hashString(role) ^ (tileSize * 2654435761))
        : null;
      paintTile(
        rgba,
        width,
        pos.col * tileSize,
        pos.row * tileSize,
        tileSize,
        fill,
        role as TileRole,
        patch,
        roleFills.mortar,
      );
    }

    const atlas = encodePng(width, height, rgba);
    const tiles = sliceAtlas(atlas, tileSize);
    const seamIssues = measureSeams(atlas, tileSize);
    const dimOk = [...tiles.values()].every((buf) => {
      const d = decodePngRgba(buf);
      return d.width === tileSize && d.height === tileSize;
    });
    if (!dimOk) seamIssues.push('not all sliced tiles match tileSize');

    return {
      atlas,
      tileSize,
      width,
      height,
      tiles,
      transformations: ['autotile-compile', 'nearest-neighbor', 'upper-left-lighting', 'shared-edges'],
      seamIssues,
      passed: dimOk && seamIssues.length === 0,
    };
  }
}

export function tileRoleAt(role: TileRole): { col: number; row: number } {
  return TILE_ATLAS.roles[role];
}
