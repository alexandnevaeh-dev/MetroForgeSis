import { encodePng } from './png.js';

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [70, 78, 72];
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Which large decorative silhouette a free-form biome prop family (e.g. "broken pillars",
 *  "gothic arches", "gear pile") maps onto. These are the macro environment features — arches,
 *  columns, statues, machinery — that break up a room's read far more than tile-level variation
 *  alone; a room with 2-3 of these plus varied tiles no longer reads as "wallpaper". */
type PropShape = 'lantern' | 'statue' | 'chain' | 'arch' | 'pillar' | 'gear' | 'pipe' | 'debris';

function classifyFamily(family: string): PropShape {
  const f = family.toLowerCase();
  if (f.includes('arch') || f.includes('window') || f.includes('vault')) return 'arch';
  if (f.includes('pillar') || f.includes('column') || f.includes('colonnade') || f.includes('rib')) return 'pillar';
  if (f.includes('gear') || f.includes('cog') || f.includes('clock') || f.includes('pendulum')) return 'gear';
  if (f.includes('pipe') || f.includes('exhaust') || f.includes('stack') || f.includes('catwalk')) return 'pipe';
  if (f.includes('lantern') || f.includes('light') || f.includes('lamp') || f.includes('worklamp')) return 'lantern';
  if (f.includes('shrine') || f.includes('statue') || f.includes('lectern') || f.includes('save')) return 'statue';
  if (f.includes('ability') || f.includes('crystal') || f.includes('altar')) return 'lantern';
  if (f.includes('pickup') || f.includes('scrap') || f.includes('gem') || f.includes('item')) return 'gear';
  if (f.includes('chain') || f.includes('vine') || f.includes('root') || f.includes('moss')) return 'chain';
  return 'debris';
}

function inEllipse(nx: number, ny: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const dx = (nx - cx) / rx;
  const dy = (ny - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

/** A rounded archway/window opening: a solid frame with a punched-through arc at the top and a
 *  rectangular void below it — reads as architecture, not a blob, even at 32px. */
function insideArch(nx: number, ny: number): boolean {
  const frame = nx > 0.08 && nx < 0.92 && ny > 0.05 && ny < 0.98;
  if (!frame) return false;
  const archCenter = 0.42;
  const void_ =
    (ny > archCenter && nx > 0.22 && nx < 0.78) ||
    inEllipse(nx, ny, 0.5, archCenter, 0.28, 0.3);
  return !void_;
}

/** A fluted column: a shaft with a wider capital (top) and base (bottom) — the classic "pillar"
 *  read, distinct from a plain rectangle. */
function insidePillar(nx: number, ny: number): boolean {
  if (ny < 0.04 || ny > 0.97) return false;
  const capital = ny < 0.14;
  const base = ny > 0.86;
  if (capital || base) return nx > 0.14 && nx < 0.86;
  return nx > 0.32 && nx < 0.68;
}

/** A humanoid figure on a pedestal — reuses the same silhouette language as characters (round
 *  head, tapered body) so statues read as "a person carved in stone", not a rectangle. */
function insideStatue(nx: number, ny: number): boolean {
  const pedestal = ny > 0.78 && ny < 0.98 && nx > 0.15 && nx < 0.85;
  const head = inEllipse(nx, ny, 0.5, 0.22, 0.16, 0.14);
  const body = ny > 0.34 && ny < 0.8 && Math.abs(nx - 0.5) <= 0.3 - (ny - 0.34) * 0.18;
  return pedestal || head || body;
}

/** A ring gear silhouette — an annulus with radial teeth — for clockwork/mechanical biomes. */
function insideGear(nx: number, ny: number): boolean {
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const r = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const toothed = 0.34 + 0.06 * (Math.cos(angle * 8) > 0.2 ? 1 : 0);
  return r < toothed && r > 0.16;
}

/** A vertical pipe run with periodic joint collars — industrial/mechanical biomes. */
function insidePipe(nx: number, ny: number): boolean {
  const shaft = nx > 0.38 && nx < 0.62;
  const joint = ny % 0.24 < 0.06 && nx > 0.26 && nx < 0.74;
  return shaft || joint;
}

/** Broken masonry / crate rubble: two or three overlapping irregular-ish blocks instead of one
 *  smooth blob, for the catch-all "debris"/"pews"/"broken cart" family. */
function insideDebris(nx: number, ny: number, seed: number): boolean {
  const h = (n: number) => {
    let x = (seed + n * 374761393) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  const blockA = nx > 0.1 && nx < 0.62 && ny > 0.4 + h(1) * 0.15 && ny < 0.95;
  const blockB = nx > 0.45 && nx < 0.92 && ny > 0.55 + h(2) * 0.15 && ny < 0.88;
  return blockA || blockB;
}

/** Prop overlay features generatePropSprite can actually render — a deliberate subset of
 *  TILESET_SUPPORTED_FEATURES/BACKGROUND_SUPPORTED_FEATURES: 'panel_grates' and
 *  'damaged_modules' don't apply to a single discrete prop silhouette (there's no wall panel or
 *  module grid to grate/damage), so they're intentionally excluded here rather than silently
 *  accepted and ignored. */
export const PROP_SUPPORTED_FEATURES = ['corrosion', 'stains', 'vegetation'] as const;
export type PropFeature = (typeof PROP_SUPPORTED_FEATURES)[number];

export function partitionPropFeatures(requested: readonly string[] | undefined): {
  supported: PropFeature[];
  unsupported: string[];
} {
  const supported: PropFeature[] = [];
  const unsupported: string[] = [];
  for (const f of requested ?? []) {
    if ((PROP_SUPPORTED_FEATURES as readonly string[]).includes(f)) supported.push(f as PropFeature);
    else unsupported.push(f);
  }
  return { supported, unsupported };
}

function propHash(seed: number, a: number, b: number, salt: number): number {
  let x = (seed + a * 374761393 + b * 668265263 + salt * 2246822519) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function generatePropSprite(opts: {
  width: number;
  height: number;
  fill: string;
  accent: string;
  family: string;
  seed: number;
  /** Optional material dressing (see PROP_SUPPORTED_FEATURES), applied only within the prop's own
   *  opaque silhouette — never on the transparent background or the dark outline. Omitted ->
   *  byte-identical to every existing caller. */
  features?: readonly string[];
}): Buffer {
  const { width, height } = opts;
  const fill = hexRgb(opts.fill);
  const accent = hexRgb(opts.accent);
  const rgba = new Uint8Array(width * height * 4);
  const shape = classifyFamily(opts.family);
  const h = (n: number) => {
    let x = (opts.seed + n * 374761393) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };

  const OUTLINE: [number, number, number] = [14, 18, 26];
  const { supported: supportedFeatures } = partitionPropFeatures(opts.features);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;
      const inside = isSameShapePixel(shape, nx, ny, opts.seed);
      if (!inside) {
        // A dark outline against empty space is what makes a silhouette read against an
        // arbitrary background color — without it, a mid-tone fill can blend into a similarly
        // mid-tone room and the "macro architecture" reads as a soft blob instead of a shape.
        const outlined = [
          isSameShapePixel(shape, (x - 1) / width, ny, opts.seed),
          isSameShapePixel(shape, (x + 1) / width, ny, opts.seed),
          isSameShapePixel(shape, nx, (y - 1) / height, opts.seed),
          isSameShapePixel(shape, nx, (y + 1) / height, opts.seed),
        ].some(Boolean);
        if (outlined) {
          const i = (y * width + x) * 4;
          rgba[i] = OUTLINE[0];
          rgba[i + 1] = OUTLINE[1];
          rgba[i + 2] = OUTLINE[2];
          rgba[i + 3] = 255;
        }
        continue;
      }
      const useAccent = h(x * 7 + y * 13) > 0.88;
      const i = (y * width + x) * 4;
      const grass = fill[1] > fill[0] + 20 && fill[1] > fill[2] + 10;
      const gold = fill[0] > 140 && fill[1] > 100 && fill[2] < 90;
      // Darkened relative to the raw biome fill color, which is also the parallax background's
      // base tone — using it undimmed made architecture blend into the sky instead of reading as
      // a distinct, closer material plane.
      const dimmedFill: [number, number, number] = [
        Math.round(fill[0] * 0.55),
        Math.round(fill[1] * 0.55),
        Math.round(fill[2] * 0.6),
      ];
      const masonry: [number, number, number] = grass || gold ? [58, 72, 78] : dimmedFill;
      const trim: [number, number, number] = grass || gold ? [168, 142, 88] : accent;
      let rgb = useAccent ? trim : masonry;
      // A simple top-lit / bottom-shadowed cue so these read as solid architecture, not flat
      // stickers — the same cheap "form" trick used for character silhouettes.
      const edgeAbove = y === 0 || !isSameShapePixel(shape, nx, (y - 1) / height, opts.seed);
      const edgeBelow = y === height - 1 || !isSameShapePixel(shape, nx, (y + 1) / height, opts.seed);
      if (edgeAbove) rgb = [Math.min(255, rgb[0] + 24), Math.min(255, rgb[1] + 24), Math.min(255, rgb[2] + 24)];
      else if (edgeBelow) rgb = [Math.max(0, rgb[0] - 28), Math.max(0, rgb[1] - 28), Math.max(0, rgb[2] - 28)];
      if (supportedFeatures.length > 0) {
        if (supportedFeatures.includes('corrosion')) {
          const speck = propHash(opts.seed, x, y, 11);
          if (speck > 0.88) {
            const amt = 0.5;
            rgb = [
              Math.round(rgb[0] + (accent[0] - rgb[0]) * amt),
              Math.round(rgb[1] + (accent[1] - rgb[1]) * amt),
              Math.round(rgb[2] + (accent[2] - rgb[2]) * amt),
            ];
          }
        }
        if (supportedFeatures.includes('stains')) {
          const streakCol = Math.floor(x / 3);
          if (propHash(opts.seed, streakCol, 0, 23) > 0.75) {
            rgb = [Math.round(rgb[0] * 0.75), Math.round(rgb[1] * 0.75), Math.round(rgb[2] * 0.8)];
          }
        }
        if (supportedFeatures.includes('vegetation')) {
          const speck = propHash(opts.seed, x, y, 41);
          if (speck > 0.9) {
            const amt = 0.55;
            rgb = [
              Math.round(rgb[0] + (accent[0] - rgb[0]) * amt),
              Math.round(rgb[1] + (accent[1] - rgb[1]) * amt),
              Math.round(rgb[2] + (accent[2] - rgb[2]) * amt),
            ];
          }
        }
      }
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}

function isSameShapePixel(shape: PropShape, nx: number, ny: number, seed: number): boolean {
  switch (shape) {
    case 'lantern':
      return Math.hypot(nx - 0.5, ny - 0.45) < 0.28 || (ny > 0.7 && nx > 0.35 && nx < 0.65);
    case 'statue':
      return insideStatue(nx, ny);
    case 'chain':
      return Math.abs(nx - 0.5) < 0.12 && ny > 0.05;
    case 'arch':
      return insideArch(nx, ny);
    case 'pillar':
      return insidePillar(nx, ny);
    case 'gear':
      return insideGear(nx, ny);
    case 'pipe':
      return insidePipe(nx, ny);
    case 'debris':
    default:
      return insideDebris(nx, ny, seed);
  }
}


/** Readable fill/accent for world pickups. Never use palette.global[0] (void/sky) —
 *  Foundry rooms paint that swatch into the background, so interactables vanish. */
export function interactablePalette(palette?: {
  global?: string[];
  accents?: string[];
  highlights?: string[];
}): { fill: string; accent: string } {
  const global = palette?.global ?? [];
  const accents = palette?.accents ?? [];
  const highlights = palette?.highlights ?? [];
  const fill = global[1] ?? accents[0] ?? '#8a6840';
  const accent = highlights[2] ?? accents[1] ?? global[2] ?? '#48b8c8';
  return { fill, accent };
}

/** Actor fill/accent for procedural player/NPC placeholders. Same void skip as
 *  interactables — palette.global[0] is the Foundry sky. Returns RGBA tuples for SpriteSpec. */
export function actorPalette(palette?: {
  global?: string[];
  accents?: string[];
  highlights?: string[];
}): { fill: [number, number, number, number]; accent: [number, number, number, number] } {
  const { fill, accent } = interactablePalette(palette);
  const f = hexRgb(fill);
  const a = hexRgb(accent);
  return { fill: [f[0], f[1], f[2], 255], accent: [a[0], a[1], a[2], 255] };
}

const NPC_ROLE_ACCENT: Record<string, [number, number, number]> = {
  quest_giver: [186, 132, 58],
  merchant: [70, 150, 110],
  lore: [140, 110, 180],
  companion: [90, 150, 190],
  neutral: [160, 120, 90],
};

/** NPC placeholders share the courier silhouette. Fill is soot-iron derived from the actor
 *  brass; role color is a small helmet/pack accent only, not a full-body flood. */
export function npcActorPalette(
  role: string,
  palette?: { global?: string[]; accents?: string[]; highlights?: string[] },
): { fill: [number, number, number, number]; accent: [number, number, number, number] } {
  const actor = actorPalette(palette);
  const fill: [number, number, number, number] = [
    Math.max(0, actor.fill[0] - 40),
    Math.max(0, actor.fill[1] - 28),
    Math.max(0, actor.fill[2] - 16),
    255,
  ];
  const rgb = NPC_ROLE_ACCENT[role] ?? NPC_ROLE_ACCENT.neutral!;
  return { fill, accent: [rgb[0], rgb[1], rgb[2], 255] };
}

/** Palette-matched world interactables that replace ColorRect stubs in pickup/save/ability scenes. */
export const WORLD_INTERACTABLE_ASSETS = [
  { id: 'world_pickup', path: 'assets/props/interact/pickup.png', family: 'pickup', width: 32, height: 32 },
  { id: 'world_save_shrine', path: 'assets/props/interact/save_shrine.png', family: 'save_shrine', width: 32, height: 48 },
  { id: 'world_ability', path: 'assets/props/interact/ability.png', family: 'ability', width: 32, height: 32 },
] as const;
