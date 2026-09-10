import { encodePng } from './png.js';

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [70, 78, 72];
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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
 *  interactables — palette.global[0] is the Foundry sky, so a courier painted with
 *  it vanishes. Returns RGBA tuples for SpriteSpec. */
export function actorPalette(palette?: {
  global?: string[];
  accents?: string[];
  highlights?: string[];
}): { fill: [number, number, number, number]; accent: [number, number, number, number] } {
  const { fill, accent } = interactablePalette(palette);
  const f = hexRgb(fill);
  const a = hexRgb(accent);
  return {
    fill: [f[0], f[1], f[2], 255],
    accent: [a[0], a[1], a[2], 255],
  };
}

/** Palette-matched world interactables that replace ColorRect stubs in pickup/save/ability scenes. */
export const WORLD_INTERACTABLE_ASSETS = [
  { id: 'world_pickup', path: 'assets/props/interact/pickup.png', family: 'pickup', width: 32, height: 32 },
  { id: 'world_save_shrine', path: 'assets/props/interact/save_shrine.png', family: 'shrine', width: 32, height: 48 },
  { id: 'world_ability', path: 'assets/props/interact/ability.png', family: 'ability', width: 32, height: 32 },
] as const;

export function generatePropSprite(opts: {
  width: number;
  height: number;
  fill: string;
  accent: string;
  family: string;
  seed: number;
}): Buffer {
  const { width, height } = opts;
  const fill = hexRgb(opts.fill);
  const accent = hexRgb(opts.accent);
  const rgba = new Uint8Array(width * height * 4);
  const family = opts.family.toLowerCase();
  const h = (n: number) => {
    let x = (opts.seed + n * 374761393) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;
      let inside = false;
      if (family.includes('pickup') || family.includes('scrap') || family.includes('gem') || family.includes('item')) {
        const dx = Math.abs(nx - 0.5);
        const dy = Math.abs(ny - 0.52);
        inside = dx + dy * 0.9 < 0.34 && ny > 0.18 && ny < 0.92;
      } else if (family.includes('ability') || family.includes('crystal')) {
        inside = Math.abs(nx - 0.5) < 0.2 - (ny - 0.15) * 0.1 && ny > 0.08 && ny < 0.94;
      } else if (family.includes('lantern') || family.includes('light')) {
        inside = Math.hypot(nx - 0.5, ny - 0.45) < 0.28 || (ny > 0.7 && nx > 0.35 && nx < 0.65);
      } else if (family.includes('shrine') || family.includes('statue') || family.includes('save')) {
        const pillar = nx > 0.28 && nx < 0.72 && ny > 0.28 && ny < 0.96;
        const cap = nx > 0.18 && nx < 0.82 && ny > 0.12 && ny < 0.32;
        inside = pillar || cap;
      } else if (family.includes('chain') || family.includes('vine')) {
        inside = Math.abs(nx - 0.5) < 0.12 && ny > 0.05;
      } else {
        inside = ny > 0.45 + h(x) * 0.12 && nx > 0.22 && nx < 0.78 && ny < 0.98;
      }
      if (!inside) continue;
      const useAccent = h(x * 7 + y * 13) > 0.82;
      const i = (y * width + x) * 4;
      const grass = fill[1] > fill[0] + 20 && fill[1] > fill[2] + 10;
      const gold = fill[0] > 140 && fill[1] > 100 && fill[2] < 90;
      const masonry: [number, number, number] = grass || gold ? [58, 72, 78] : fill;
      const trim: [number, number, number] = grass || gold ? [168, 142, 88] : accent;
      const rgb = useAccent ? trim : masonry;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}
