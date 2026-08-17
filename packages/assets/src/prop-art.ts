import { encodePng } from './png.js';

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [70, 78, 72];
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

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
      if (opts.family.includes('lantern') || opts.family.includes('light')) {
        inside = Math.hypot(nx - 0.5, ny - 0.45) < 0.28 || (ny > 0.7 && nx > 0.35 && nx < 0.65);
      } else if (opts.family.includes('shrine') || opts.family.includes('statue')) {
        inside = nx > 0.25 && nx < 0.75 && ny > 0.2 && ny < 0.95;
      } else if (opts.family.includes('chain') || opts.family.includes('vine')) {
        inside = Math.abs(nx - 0.5) < 0.12 && ny > 0.05;
      } else {
        inside = ny > 0.35 + h(x) * 0.15 && nx > 0.15 && nx < 0.85;
      }
      if (!inside) continue;
      const useAccent = h(x * 7 + y * 13) > 0.72;
      const i = (y * width + x) * 4;
      const rgb = useAccent ? accent : fill;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}
