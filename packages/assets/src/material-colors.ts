import { decodePngRgba, encodePng } from './png.js';

export interface MaterialColorRule {
  region: { x: number; y: number; width: number; height: number };
  from: string;
  to: string;
  tolerance: number;
  preserveShading: boolean;
}

function rgb(value: string): [number, number, number] {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
    throw new Error('Choose a six-digit source and replacement color');
  return [1, 3, 5].map(start => parseInt(value.slice(start, start + 2), 16)) as [number, number, number];
}

export function validateMaterialColorRules(value: unknown, width: number, height: number): MaterialColorRule[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16)
    throw new Error('Choose between one and sixteen color changes');
  return value.map((raw: MaterialColorRule) => {
    if (!raw || typeof raw !== 'object' || !raw.region || typeof raw.region !== 'object')
      throw new Error('Choose a source-image rectangle for each color change');
    const { x, y, width: w, height: h } = raw.region;
    if (![x, y, w, h].every(Number.isSafeInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height)
      throw new Error('Color-change rectangles must stay inside the source image');
    rgb(raw.from); rgb(raw.to);
    if (!Number.isFinite(raw.tolerance) || raw.tolerance < 0 || raw.tolerance > 255 || typeof raw.preserveShading !== 'boolean')
      throw new Error('Color tolerance must be between 0 and 255; choose whether to preserve shading');
    return { region: { x, y, width: w, height: h }, from: raw.from.toLowerCase(), to: raw.to.toLowerCase(), tolerance: raw.tolerance, preserveShading: raw.preserveShading };
  });
}

/** Match the original pixels for every rule. Later overlapping rules win, without cascading colors. */
export function applyMaterialColors(source: Buffer, requested: unknown): { buffer: Buffer; changedPixels: number; rules: MaterialColorRule[] } {
  const { width, height, rgba } = decodePngRgba(source);
  if (width > 4096 || height > 4096 || width * height > 4_194_304)
    throw new Error('Source artwork is too large for material editing');
  const rules = validateMaterialColorRules(requested, width, height);
  const output = new Uint8Array(rgba);
  const luminance = (color: ArrayLike<number>) => 0.2126 * color[0]! + 0.7152 * color[1]! + 0.0722 * color[2]!;
  for (const rule of rules) {
    const from = rgb(rule.from), to = rgb(rule.to), area = rule.region;
    for (let y = area.y; y < area.y + area.height; y++) for (let x = area.x; x < area.x + area.width; x++) {
      const i = (y * width + x) * 4;
      if (!rgba[i + 3] || Math.max(...from.map((channel, c) => Math.abs(channel - rgba[i + c]!))) > rule.tolerance) continue;
      const shade = rule.preserveShading ? luminance(rgba.subarray(i, i + 3)) / Math.max(1, luminance(from)) : 1;
      for (let c = 0; c < 3; c++) output[i + c] = Math.max(0, Math.min(255, Math.round(to[c]! * shade)));
    }
  }
  let changedPixels = 0;
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i] !== output[i] || rgba[i + 1] !== output[i + 1] || rgba[i + 2] !== output[i + 2]) changedPixels++;
  return { buffer: encodePng(width, height, output), changedPixels, rules };
}
