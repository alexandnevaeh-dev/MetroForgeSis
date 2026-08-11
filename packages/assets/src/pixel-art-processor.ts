import { encodePng } from './png.js';
import { inflateSync } from 'node:zlib';

export interface PixelArtOptions {
  targetWidth: number;
  targetHeight: number;
  tileSize?: number;
  palette?: [number, number, number][];
  alphaThreshold?: number;
}

export interface PixelArtResult {
  buffer: Buffer;
  width: number;
  height: number;
  palette: [number, number, number][];
  fallbackProcessed: boolean;
}

const DEFAULT_PALETTE: [number, number, number][] = [
  [20, 24, 32],
  [60, 64, 78],
  [90, 140, 220],
  [200, 80, 80],
  [80, 200, 120],
  [200, 180, 60],
  [180, 100, 200],
  [240, 240, 250],
];

/** Deterministic pixel-art post-processing pipeline */
export class PixelArtProcessor {
  process(sourcePng: Buffer, options: PixelArtOptions): PixelArtResult {
    const { rgba, width, height } = decodePngSimple(sourcePng);
    const palette = options.palette ?? DEFAULT_PALETTE;

    const scaled = nearestNeighborScale(
      rgba,
      width,
      height,
      options.targetWidth,
      options.targetHeight,
    );

    const quantized = quantizeToPalette(scaled.rgba, scaled.width, scaled.height, palette);
    const cleaned = cleanupAlpha(quantized, scaled.width, scaled.height, options.alphaThreshold ?? 128);

    if (options.tileSize) {
      alignToGrid(cleaned, scaled.width, scaled.height, options.tileSize);
    }

    return {
      buffer: encodePng(scaled.width, scaled.height, cleaned),
      width: scaled.width,
      height: scaled.height,
      palette,
      fallbackProcessed: true,
    };
  }

  /** Slice tileset source into individual tile PNGs */
  sliceTiles(sourcePng: Buffer, tileSize: number): Map<string, Buffer> {
    const { rgba, width, height } = decodePngSimple(sourcePng);
    const tiles = new Map<string, Buffer>();

    const cols = Math.floor(width / tileSize);
    const rows = Math.floor(height / tileSize);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileRgba = new Uint8Array(tileSize * tileSize * 4);
        for (let y = 0; y < tileSize; y++) {
          for (let x = 0; x < tileSize; x++) {
            const sx = col * tileSize + x;
            const sy = row * tileSize + y;
            const si = (sy * width + sx) * 4;
            const di = (y * tileSize + x) * 4;
            tileRgba[di] = rgba[si]!;
            tileRgba[di + 1] = rgba[si + 1]!;
            tileRgba[di + 2] = rgba[si + 2]!;
            tileRgba[di + 3] = rgba[si + 3]!;
          }
        }
        tiles.set(`tile_${col}_${row}`, encodePng(tileSize, tileSize, tileRgba));
      }
    }

    return tiles;
  }
}

function nearestNeighborScale(
  rgba: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { rgba: Uint8Array; width: number; height: number } {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor((x / dstW) * srcW);
      const sy = Math.floor((y / dstH) * srcH);
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = rgba[si]!;
      out[di + 1] = rgba[si + 1]!;
      out[di + 2] = rgba[si + 2]!;
      out[di + 3] = rgba[si + 3]!;
    }
  }
  return { rgba: out, width: dstW, height: dstH };
}

function quantizeToPalette(
  rgba: Uint8Array,
  _width: number,
  _height: number,
  palette: [number, number, number][],
): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 32) {
      out[i + 3] = 0;
      continue;
    }
    const nearest = nearestPaletteColor(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, palette);
    out[i] = nearest[0];
    out[i + 1] = nearest[1];
    out[i + 2] = nearest[2];
    out[i + 3] = rgba[i + 3]!;
  }
  return out;
}

function nearestPaletteColor(r: number, g: number, b: number, palette: [number, number, number][]): [number, number, number] {
  let best = palette[0]!;
  let bestDist = Infinity;
  for (const c of palette) {
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function cleanupAlpha(rgba: Uint8Array, _w: number, _h: number, threshold: number): Uint8Array {
  const out = new Uint8Array(rgba);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3]! < threshold) {
      out[i + 3] = 0;
    } else {
      out[i + 3] = 255;
    }
  }
  return out;
}

function alignToGrid(rgba: Uint8Array, width: number, height: number, grid: number): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = Math.floor(x / grid) * grid + Math.floor((x % grid) / grid);
      const gy = Math.floor(y / grid) * grid + Math.floor((y % grid) / grid);
      const si = (y * width + x) * 4;
      const gi = (gy * width + gx) * 4;
      if (rgba[si + 3]! < 128 && rgba[gi + 3]! >= 128) {
        rgba[si] = rgba[gi]!;
        rgba[si + 1] = rgba[gi + 1]!;
        rgba[si + 2] = rgba[gi + 2]!;
        rgba[si + 3] = 0;
      }
    }
  }
}

/** Minimal PNG decoder for RGBA8 — sufficient for our generated assets */
function decodePngSimple(png: Buffer): { rgba: Uint8Array; width: number; height: number } {
  if (png[0] !== 137 || png.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Not a PNG file');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let idat = Buffer.alloc(0);

  while (offset < png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idat = Buffer.concat([idat, data]);
    } else if (type === 'IEND') {
      break;
    }
  }

  const inflated = inflateSync(idat);
  const rgba = new Uint8Array(width * height * 4);
  const stride = width * 4;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1) + 1;
    for (let x = 0; x < width; x++) {
      const si = rowStart + x * 4;
      const di = (y * width + x) * 4;
      rgba[di] = inflated[si]!;
      rgba[di + 1] = inflated[si + 1]!;
      rgba[di + 2] = inflated[si + 2]!;
      rgba[di + 3] = inflated[si + 3]!;
    }
  }

  return { rgba, width, height };
}
