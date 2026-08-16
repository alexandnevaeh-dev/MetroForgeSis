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

function paintTile(
  rgba: Uint8Array,
  atlasW: number,
  originX: number,
  originY: number,
  tileSize: number,
  fill: [number, number, number],
  kind: TileRole,
): void {
  const highlight = shade(fill, 1.25);
  const shadow = shade(fill, 0.55);
  const outline: [number, number, number] = shade(fill, 0.28);
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      let c = fill;
      // Interior lighting only — keep the shared 1px edge as the base fill so adjacent
      // autotile roles (ground|wall) do not invent a hard seam.
      const interior = x > 0 && x < tileSize - 1 && y > 0 && y < tileSize - 1;
      if (interior) {
        if (x + y < tileSize * 0.35) c = highlight;
        if (x > tileSize * 0.75 || y > tileSize * 0.8) c = shadow;
      }
      if (kind === 'hazard' && (x + y) % 6 < 2) c = [180, 70, 50];
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
  const edge = (kind.includes('left') || kind === 'outside_tl' || kind === 'outside_bl' || kind === 'inside_tl' || kind === 'inside_bl');
  const right = kind.includes('right') || kind === 'outside_tr' || kind === 'outside_br' || kind === 'inside_tr' || kind === 'inside_br';
  const top = kind.includes('top') || kind.startsWith('outside_t') || kind.startsWith('inside_t') || kind === 'ceiling' || kind === 'platform' || kind === 'one_way';
  const bottom = kind.includes('bottom') || kind.startsWith('outside_b') || kind.startsWith('inside_b') || kind === 'ground';
  for (let i = 0; i < tileSize; i++) {
    if (top) setPixel(rgba, atlasW, originX + i, originY, outline);
    if (bottom) setPixel(rgba, atlasW, originX + i, originY + tileSize - 1, outline);
    if (edge) setPixel(rgba, atlasW, originX, originY + i, outline);
    if (right) setPixel(rgba, atlasW, originX + tileSize - 1, originY + i, outline);
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
    const fills: [number, number, number][] = [
      extracted[0] ?? hex[1] ?? [60, 64, 78],
      extracted[1] ?? hex[0] ?? [20, 24, 32],
      extracted[2] ?? hex[2] ?? [90, 140, 220],
      extracted[3] ?? [200, 80, 80],
    ];

    for (const [role, pos] of Object.entries(TILE_ATLAS.roles)) {
      const fill =
        role === 'hazard' ? fills[3]! : role === 'door' ? fills[2]! : role.includes('platform') ? fills[0]! : fills[0]!;
      paintTile(rgba, width, pos.col * tileSize, pos.row * tileSize, tileSize, fill, role as TileRole);
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
