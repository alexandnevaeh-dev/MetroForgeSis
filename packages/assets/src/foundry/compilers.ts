import type { AssetRequest } from '@metroforge/schemas';
import { decodePngRgba, encodePng, knockoutVfxBackground } from '../png.js';
import { PixelArtProcessor } from '../pixel-art-processor.js';
import { CompilationFailedError } from './errors.js';

export const FOUNDRY_CANONICAL_FRAME = {
  player: { width: 64, height: 64 },
  npc: { width: 64, height: 64 },
  enemy: { width: 64, height: 64 },
  boss: { width: 96, height: 96 },
} as const;

export interface CompileResult {
  buffer: Buffer;
  width: number;
  height: number;
  transformations: string[];
}

function paletteFromRequest(request: AssetRequest): [number, number, number][] | undefined {
  if (!request.style.palette?.length) return undefined;
  const out: [number, number, number][] = [];
  for (const hex of request.style.palette) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) continue;
    const n = Number.parseInt(m[1]!, 16);
    out.push([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }
  return out.length ? out : undefined;
}

function cropToSubject(rgba: Uint8Array, width: number, height: number, pad = 2): {
  rgba: Uint8Array;
  width: number;
  height: number;
  cropped: boolean;
} {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3]!;
      if (a > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) {
    return { rgba, width, height, cropped: false };
  }
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w === width && h === height) return { rgba, width, height, cropped: false };
  const next = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((minY + y) * width + (minX + x)) * 4;
      const di = (y * w + x) * 4;
      next[di] = rgba[si]!;
      next[di + 1] = rgba[si + 1]!;
      next[di + 2] = rgba[si + 2]!;
      next[di + 3] = rgba[si + 3]!;
    }
  }
  return { rgba: next, width: w, height: h, cropped: true };
}

function needsStudioKnockout(request: AssetRequest): boolean {
  if (request.assetType === 'background' || request.assetType === 'parallax' || request.assetType === 'tileset') {
    return false;
  }
  if (request.output.transparentBackground === true) return true;
  return [
    'player',
    'npc',
    'enemy',
    'boss',
    'weapon',
    'armor',
    'item',
    'pickup',
    'prop',
    'portrait',
    'animation',
    'vfx',
  ].includes(request.assetType);
}

export class SpriteCompiler {
  private readonly processor = new PixelArtProcessor();

  compile(sourcePng: Buffer, request: AssetRequest): CompileResult {
    try {
      let working = sourcePng;
      const transformations = ['alpha-cleanup'];
      if (needsStudioKnockout(request)) {
        working = knockoutVfxBackground(working);
        transformations.push('studio-knockout');
      }
      const decoded = decodePngRgba(working);
      const cropped = cropToSubject(decoded.rgba, decoded.width, decoded.height);
      const padded = encodePng(cropped.width, cropped.height, cropped.rgba);
      const target = request.dimensions ?? defaultSizeFor(request);
      const pixel = request.style.pixelArt !== false;
      if (cropped.cropped) transformations.push('subject-crop');
      if (pixel) transformations.push('nearest-neighbor', 'pixel-grid-normalize');
      const processed = this.processor.process(padded, {
        targetWidth: target.width,
        targetHeight: target.height,
        palette: paletteFromRequest(request),
        skipQuantize: true,
      });
      return {
        buffer: processed.buffer,
        width: processed.width,
        height: processed.height,
        transformations,
      };
    } catch (err) {
        throw new CompilationFailedError(err instanceof Error ? err.message : String(err));
    }
  }
}

export class PixelArtCompiler extends SpriteCompiler {}

export class TilesetCompiler {
  private readonly processor = new PixelArtProcessor();

  compile(sourcePng: Buffer, request: AssetRequest): CompileResult {
    const tileSize = request.output.tileSize ?? 16;
    const decoded = decodePngRgba(sourcePng);
    if (decoded.width % tileSize !== 0 || decoded.height % tileSize !== 0) {
      const processed = this.processor.process(sourcePng, {
        targetWidth: Math.max(tileSize, Math.round(decoded.width / tileSize) * tileSize),
        targetHeight: Math.max(tileSize, Math.round(decoded.height / tileSize) * tileSize),
        tileSize,
        palette: paletteFromRequest(request),
      });
      return {
        buffer: processed.buffer,
        width: processed.width,
        height: processed.height,
        transformations: ['tileset-normalize', 'nearest-neighbor'],
      };
    }
    const processed = this.processor.process(sourcePng, {
      targetWidth: decoded.width,
      targetHeight: decoded.height,
      tileSize,
      palette: paletteFromRequest(request),
    });
    return {
      buffer: processed.buffer,
      width: processed.width,
      height: processed.height,
      transformations: ['tileset-quantization'],
    };
  }

  slice(sourcePng: Buffer, tileSize: number): Map<string, Buffer> {
    return this.processor.sliceTiles(sourcePng, tileSize);
  }
}

export class IconCompiler extends SpriteCompiler {}
export class PortraitCompiler extends SpriteCompiler {}
export class BackgroundCompiler extends SpriteCompiler {}
export class AnimationCompiler extends SpriteCompiler {}
export class VFXCompiler extends SpriteCompiler {}

export class TextureCompiler {
  compile(sourcePng: Buffer, request: AssetRequest): CompileResult {
    const decoded = decodePngRgba(sourcePng);
    const target = request.dimensions ?? { width: decoded.width, height: decoded.height };
    const processor = new PixelArtProcessor();
    const processed = processor.process(sourcePng, {
      targetWidth: target.width,
      targetHeight: target.height,
    });
    return {
      buffer: processed.buffer,
      width: processed.width,
      height: processed.height,
      transformations: ['texture-normalize'],
    };
  }
}

export class Model3DCompiler {
  compile(_source: Buffer, _request: AssetRequest): CompileResult {
    throw new CompilationFailedError('3D compile is catalogued but not an active Godot production path');
  }
}

export function compileForRequest(sourcePng: Buffer, request: AssetRequest): CompileResult {
  switch (request.assetType) {
    case 'tileset':
    case 'terrain':
    case 'platform':
      return new TilesetCompiler().compile(sourcePng, request);
    case 'icon':
    case 'ui':
    case 'hud':
      return new IconCompiler().compile(sourcePng, request);
    case 'portrait':
      return new PortraitCompiler().compile(sourcePng, request);
    case 'background':
    case 'parallax':
      return new BackgroundCompiler().compile(sourcePng, request);
    case 'vfx':
      return new VFXCompiler().compile(sourcePng, request);
    case 'animation':
      return new AnimationCompiler().compile(sourcePng, request);
    case 'texture':
    case 'material':
      return new TextureCompiler().compile(sourcePng, request);
    case '3d-model':
      return new Model3DCompiler().compile(sourcePng, request);
    default:
      return new SpriteCompiler().compile(sourcePng, request);
  }
}

function defaultSizeFor(request: AssetRequest): { width: number; height: number } {
  if (request.assetType === 'player' || request.assetType === 'npc' || request.assetType === 'enemy') {
    return FOUNDRY_CANONICAL_FRAME[request.assetType];
  }
  if (request.assetType === 'boss') return FOUNDRY_CANONICAL_FRAME.boss;
  if (request.assetType === 'icon' || request.assetType === 'item' || request.assetType === 'pickup') {
    return { width: 16, height: 16 };
  }
  if (request.assetType === 'tileset') return { width: 128, height: 128 };
  return { width: 64, height: 64 };
}
