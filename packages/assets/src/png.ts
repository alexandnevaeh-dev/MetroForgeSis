import { deflateSync, inflateSync } from 'node:zlib';

/** Minimal RGBA PNG encoder — no external dependencies */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error(`RGBA buffer size mismatch: expected ${width * height * 4}, got ${rgba.length}`);
  }

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.subarray(y * stride, y * stride + stride)).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const compressed = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ].map((c, i) => (i === 0 ? Buffer.concat([pngSignature(), c]) : c)));
}

const pngSignature = () => Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface SpriteSpec {
  id: string;
  width: number;
  height: number;
  fill: [number, number, number, number];
  accent?: [number, number, number, number];
  shape?: 'humanoid' | 'enemy' | 'boss' | 'item' | 'tile';
}

export function generateProceduralSprite(spec: SpriteSpec): Buffer {
  const { width, height, fill, accent = fill } = spec;
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let inside = false;

      switch (spec.shape ?? 'humanoid') {
        case 'humanoid':
          inside =
            (x >= width * 0.35 && x <= width * 0.65 && y >= height * 0.1 && y <= height * 0.45) ||
            (x >= width * 0.25 && x <= width * 0.75 && y >= height * 0.45 && y <= height * 0.85);
          break;
        case 'enemy':
          inside = Math.hypot(x - width / 2, y - height / 2) < Math.min(width, height) * 0.4;
          break;
        case 'boss':
          inside =
            Math.hypot(x - width / 2, y - height * 0.55) < Math.min(width, height) * 0.45 ||
            (x >= width * 0.2 && x <= width * 0.8 && y >= height * 0.15 && y <= height * 0.35);
          break;
        case 'item':
          inside = x >= width * 0.3 && x <= width * 0.7 && y >= height * 0.3 && y <= height * 0.7;
          break;
        case 'tile':
          inside = y >= height * 0.6;
          break;
      }

      if (!inside) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
      } else {
        const useAccent = spec.shape === 'humanoid' && y < height * 0.25;
        const c = useAccent ? accent : fill;
        rgba[i] = c[0]!;
        rgba[i + 1] = c[1]!;
        rgba[i + 2] = c[2]!;
        rgba[i + 3] = c[3]!;
      }
    }
  }

  return encodePng(width, height, rgba);
}

export interface VfxSpec {
  id: string;
  size: number;
  core: [number, number, number, number];
  edge: [number, number, number, number];
  style?: 'burst' | 'streak';
}

/** Small radial or streak VFX sprites for hit/dash/pickup/death feedback. */
export function generateVfxTexture(spec: VfxSpec): Buffer {
  const { size, core, edge, style = 'burst' } = spec;
  const rgba = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let alpha = 0.0;
      if (style === 'streak') {
        const dx = (x - cx + 0.5) / (size * 0.45);
        const dy = (y - cy + 0.5) / (size * 0.22);
        const d = Math.hypot(dx, dy);
        if (d <= 1) alpha = Math.pow(1 - d, 1.2);
      } else {
        const d = Math.hypot(x - cx + 0.5, y - cy + 0.5) / (size * 0.5);
        if (d <= 1) alpha = Math.pow(1 - d, 1.5);
      }

      if (alpha <= 0) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
        continue;
      }

      const t = 1 - alpha;
      rgba[i] = Math.round(core[0]! * alpha + edge[0]! * t);
      rgba[i + 1] = Math.round(core[1]! * alpha + edge[1]! * t);
      rgba[i + 2] = Math.round(core[2]! * alpha + edge[2]! * t);
      rgba[i + 3] = Math.round(255 * alpha * (core[3]! / 255));
    }
  }

  return encodePng(size, size, rgba);
}

/** Horizontal walk-cycle spritesheet (frameCount frames) */
export function generateWalkCycleSheet(spec: SpriteSpec, frameCount = 4, sourcePng?: Buffer): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));
  const sheet = new Uint8Array(width * frameCount * height * 4);

  for (let f = 0; f < frameCount; f++) {
    const bob = f % 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcY = Math.min(height - 1, Math.max(0, y - bob));
        const si = (srcY * width + x) * 4;
        const di = (y * width * frameCount + f * width + x) * 4;
        sheet[di] = rgba[si]!;
        sheet[di + 1] = rgba[si + 1]!;
        sheet[di + 2] = rgba[si + 2]!;
        sheet[di + 3] = rgba[si + 3]!;
      }
    }
  }

  return encodePng(width * frameCount, height, sheet);
}

/** Damage-flash animation: alternates the sprite's real colors with a bright red-white
 *  tint on every other frame — the classic "took damage" visual cue. Distinct from the
 *  walk cycle's bob, not a relabeled copy of it. */
export function generateHurtFlashSheet(spec: SpriteSpec, frameCount = 4, sourcePng?: Buffer): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));
  const sheet = new Uint8Array(width * frameCount * height * 4);

  for (let f = 0; f < frameCount; f++) {
    const flashed = f % 2 === 1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4;
        const di = (y * width * frameCount + f * width + x) * 4;
        const alpha = rgba[si + 3]!;
        if (alpha === 0) {
          sheet[di + 3] = 0;
          continue;
        }
        if (flashed) {
          sheet[di] = 255;
          sheet[di + 1] = 90;
          sheet[di + 2] = 90;
        } else {
          sheet[di] = rgba[si]!;
          sheet[di + 1] = rgba[si + 1]!;
          sheet[di + 2] = rgba[si + 2]!;
        }
        sheet[di + 3] = alpha;
      }
    }
  }

  return encodePng(width * frameCount, height, sheet);
}

/** Attack-swing animation: the sprite leans progressively further forward across frames,
 *  with a brightness pulse on the final "impact" frame — real visual feedback for the
 *  attack hitbox activating, not a relabeled walk cycle. */
export function generateAttackSheet(spec: SpriteSpec, frameCount = 4, sourcePng?: Buffer): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));
  const sheet = new Uint8Array(width * frameCount * height * 4);
  const maxShift = Math.floor(width * 0.15);

  for (let f = 0; f < frameCount; f++) {
    const shift = Math.floor((maxShift * (f + 1)) / frameCount);
    const isImpactFrame = f === frameCount - 1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcX = Math.min(width - 1, Math.max(0, x - shift));
        const si = (y * width + srcX) * 4;
        const di = (y * width * frameCount + f * width + x) * 4;
        const alpha = rgba[si + 3]!;
        if (alpha === 0) {
          sheet[di + 3] = 0;
          continue;
        }
        const boost = isImpactFrame ? 60 : 0;
        sheet[di] = Math.min(255, rgba[si]! + boost);
        sheet[di + 1] = Math.min(255, rgba[si + 1]! + boost);
        sheet[di + 2] = Math.min(255, rgba[si + 2]! + boost);
        sheet[di + 3] = alpha;
      }
    }
  }

  return encodePng(width * frameCount, height, sheet);
}

/** Death animation: the sprite sinks downward and desaturates toward gray across frames,
 *  fading to 45% opacity by the final frame — never fully invisible, since a completely
 *  transparent last frame reads as a rendering bug rather than a death, and would also fail
 *  the animation critic's "frame is empty" check. Frame 0 is pixel-identical to the base
 *  sprite (matches every other sheet here), not a relabeled hurt flash. */
export function generateDeathSheet(spec: SpriteSpec, frameCount = 4, sourcePng?: Buffer): Buffer {
  const { rgba, width, height } = sourcePng
    ? decodePngRgba(sourcePng)
    : decodePngRgba(generateProceduralSprite(spec));
  const sheet = new Uint8Array(width * frameCount * height * 4);

  for (let f = 0; f < frameCount; f++) {
    const t = frameCount > 1 ? f / (frameCount - 1) : 0;
    const dropPx = Math.round(t * height * 0.25);
    const alphaScale = 1 - t * 0.55;
    for (let y = 0; y < height; y++) {
      const srcY = y + dropPx;
      for (let x = 0; x < width; x++) {
        const di = (y * width * frameCount + f * width + x) * 4;
        if (srcY >= height) {
          sheet[di + 3] = 0;
          continue;
        }
        const si = (srcY * width + x) * 4;
        const alpha = rgba[si + 3]!;
        if (alpha === 0) {
          sheet[di + 3] = 0;
          continue;
        }
        const r = rgba[si]!;
        const g = rgba[si + 1]!;
        const b = rgba[si + 2]!;
        const gray = (r + g + b) / 3;
        sheet[di] = Math.round(r + (gray - r) * t);
        sheet[di + 1] = Math.round(g + (gray - g) * t);
        sheet[di + 2] = Math.round(b + (gray - b) * t);
        sheet[di + 3] = Math.round(alpha * alphaScale);
      }
    }
  }

  return encodePng(width * frameCount, height, sheet);
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Undoes PNG's per-scanline filtering (spec §9.2-9.3). Every real PNG encoder we ingest
 * (Pillow's `Image.save(format="PNG")` in `ensurePngBuffer`'s JPEG conversion, any external
 * image-gen provider) picks a per-row filter — usually Up or Paeth, since None compresses
 * poorly on photographic/gradient content. `encodePng` below always writes filter 0 (None) for
 * our own procedural output, so skipping this step happened to round-trip correctly for
 * everything we generated ourselves, but silently corrupted every externally-sourced PNG: e.g.
 * a constant alpha=255 channel under Up filtering reconstructs to a raw byte of 0
 * (255 - previous-row's-255) on every row after the first, which reads back as fully
 * transparent — turning a fully-opaque real AI image into a near-blank one once it hit the
 * pixel-art pipeline.
 */
function unfilter(inflated: Buffer, width: number, height: number, bpp: number): Buffer {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filterType = inflated[y * (stride + 1)]!;
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    const priorOut = rowOut - stride;
    for (let x = 0; x < stride; x++) {
      const raw = inflated[rowIn + x]!;
      const a = x >= bpp ? out[rowOut + x - bpp]! : 0;
      const b = y > 0 ? out[priorOut + x]! : 0;
      const c = y > 0 && x >= bpp ? out[priorOut + x - bpp]! : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + a;
          break;
        case 2:
          value = raw + b;
          break;
        case 3:
          value = raw + Math.floor((a + b) / 2);
          break;
        case 4:
          value = raw + paethPredictor(a, b, c);
          break;
        default:
          throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
      out[rowOut + x] = value & 0xff;
    }
  }
  return out;
}

export function decodePngRgba(png: Buffer): { rgba: Uint8Array; width: number; height: number } {
  if (png[0] !== 137 || png.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Not a PNG file');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let idat = Buffer.alloc(0);

  while (offset < png.length) {
    const len = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === 'IDAT') {
      idat = Buffer.concat([idat, data]);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(
      `Unsupported PNG format for decodePngRgba: bitDepth=${bitDepth}, colorType=${colorType} (only 8-bit RGB/RGBA supported)`,
    );
  }

  const srcBpp = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(idat);
  const pixels = unfilter(inflated, width, height, srcBpp);

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const si = i * srcBpp;
    const di = i * 4;
    rgba[di] = pixels[si]!;
    rgba[di + 1] = pixels[si + 1]!;
    rgba[di + 2] = pixels[si + 2]!;
    rgba[di + 3] = colorType === 6 ? pixels[si + 3]! : 255;
  }

  return { rgba, width, height };
}

export function generateTilesetSource(seed: number, size = 128): Buffer {
  const rng = (n: number) => ((seed * 9301 + 49297 + n) % 233280) / 233280;
  const rgba = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const tileX = Math.floor(x / 16);
      const tileY = Math.floor(y / 16);
      const isGround = y >= size * 0.5;
      const isWall = x < 16 || x >= size - 16;
      const n = rng(tileX + tileY * 8);

      if (isGround) {
        rgba[i] = Math.floor(60 + n * 40);
        rgba[i + 1] = Math.floor(62 + n * 35);
        rgba[i + 2] = Math.floor(70 + n * 30);
        rgba[i + 3] = 255;
      } else if (isWall && tileY < 4) {
        rgba[i] = Math.floor(45 + n * 25);
        rgba[i + 1] = Math.floor(48 + n * 20);
        rgba[i + 2] = Math.floor(55 + n * 20);
        rgba[i + 3] = 255;
      } else {
        rgba[i] = Math.floor(20 + n * 15);
        rgba[i + 1] = Math.floor(22 + n * 15);
        rgba[i + 2] = Math.floor(30 + n * 20);
        rgba[i + 3] = 255;
      }
    }
  }

  return encodePng(size, size, rgba);
}
