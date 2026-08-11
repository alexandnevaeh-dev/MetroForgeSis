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

/** Horizontal walk-cycle spritesheet (frameCount frames) */
export function generateWalkCycleSheet(spec: SpriteSpec, frameCount = 4): Buffer {
  const { rgba, width, height } = decodePngRgba(generateProceduralSprite(spec));
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

function decodePngRgba(png: Buffer): { rgba: Uint8Array; width: number; height: number } {
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
