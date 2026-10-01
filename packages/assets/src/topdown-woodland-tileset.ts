import { encodePng } from './png.js';

export const WOODLAND_TILE_SIZE = 32;
export const WOODLAND_ATLAS_COLUMNS = 8;
export const WOODLAND_ATLAS_ROWS = 6;
type Rgba = readonly [number, number, number, number];

const C = {
  grassDark: [31, 65, 61, 255], grass: [48, 91, 73, 255], grassLight: [79, 127, 86, 255],
  moss: [101, 145, 83, 255], stoneDark: [48, 41, 62, 255], stone: [76, 65, 88, 255],
  stoneLight: [112, 101, 120, 255], pathDark: [103, 77, 58, 255], path: [151, 112, 69, 255],
  pathLight: [193, 151, 91, 255], waterDark: [24, 76, 91, 255], water: [31, 122, 128, 255],
  waterLight: [79, 190, 167, 255], flower: [237, 112, 123, 255], gold: [232, 190, 91, 255],
} as const satisfies Record<string, Rgba>;

function put(rgba: Uint8Array, x: number, y: number, color: Rgba): void {
  const width = WOODLAND_TILE_SIZE * WOODLAND_ATLAS_COLUMNS;
  if (x < 0 || y < 0 || x >= width || y >= WOODLAND_TILE_SIZE * WOODLAND_ATLAS_ROWS) return;
  rgba.set(color, (y * width + x) * 4);
}
function pixel(rgba: Uint8Array, c: number, r: number, x: number, y: number, color: Rgba): void {
  put(rgba, c * WOODLAND_TILE_SIZE + x, r * WOODLAND_TILE_SIZE + y, color);
}
function fill(rgba: Uint8Array, c: number, r: number, color: Rgba): void {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) pixel(rgba, c, r, x, y, color);
}
function rect(rgba: Uint8Array, c: number, r: number, x: number, y: number, w: number, h: number, color: Rgba): void {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) pixel(rgba, c, r, px, py, color);
}
function grass(rgba: Uint8Array, c: number, r: number, variation = 0): void {
  fill(rgba, c, r, C.grass);
  const clusters = variation % 2 === 0 ? [[7, 8], [22, 19], [13, 25]] : [[20, 7], [8, 19], [25, 25]];
  for (const [x, y] of clusters) {
    pixel(rgba, c, r, x!, y!, C.grassLight);
    pixel(rgba, c, r, x! - 1, y! + 1, C.grassDark);
  }
}
function stone(rgba: Uint8Array, c: number, r: number, mossy = false): void {
  fill(rgba, c, r, C.stone);
  for (let y = 7; y < 32; y += 8) rect(rgba, c, r, 0, y, 32, 2, C.stoneDark);
  for (let x = 8; x < 32; x += 12) rect(rgba, c, r, x, 1 + (x % 3) * 8, 2, 7, C.stoneDark);
  rect(rgba, c, r, 2, 2, 12, 2, C.stoneLight);
  if (mossy) {
    rect(rgba, c, r, 0, 0, 32, 4, C.moss);
    for (const x of [3, 12, 25]) rect(rgba, c, r, x, 4, 3, 3 + (x % 4), C.grassLight);
  }
}
function path(rgba: Uint8Array, c: number, r: number, cracked = false): void {
  fill(rgba, c, r, C.path);
  for (const [x, y] of [[6, 8], [20, 6], [13, 20], [26, 25]]) {
    rect(rgba, c, r, x!, y!, 3, 2, C.pathLight);
    pixel(rgba, c, r, x! + 3, y! + 2, C.pathDark);
  }
  if (cracked) { rect(rgba, c, r, 15, 8, 2, 9, C.pathDark); rect(rgba, c, r, 17, 15, 6, 2, C.pathDark); }
}
function water(rgba: Uint8Array, c: number, r: number): void {
  fill(rgba, c, r, C.water);
  for (const y of [5, 15, 25]) {
    const offset = y % 3;
    rect(rgba, c, r, 3 + offset, y, 10, 2, C.waterLight);
    rect(rgba, c, r, 18 - offset, y + 3, 9, 2, C.waterDark);
  }
}

/** Generates a crisp atlas matching the existing 8x6 terrain-role contract. */
export function generateTopDownWoodlandTileset(): Buffer {
  const width = 32 * WOODLAND_ATLAS_COLUMNS, height = 32 * WOODLAND_ATLAS_ROWS;
  const rgba = new Uint8Array(width * height * 4);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) grass(rgba, c, r, r + c);
  grass(rgba, 0, 0); stone(rgba, 1, 0, true); stone(rgba, 2, 0); path(rgba, 3, 0);
  for (let c = 4; c < 8; c++) stone(rgba, c, 0, true);
  for (let c = 0; c < 8; c++) stone(rgba, c, 1, c % 2 === 0);
  path(rgba, 0, 2); path(rgba, 1, 2); path(rgba, 2, 2); water(rgba, 3, 2); stone(rgba, 4, 2, true);
  stone(rgba, 5, 2); rect(rgba, 5, 2, 10, 5, 12, 24, C.stoneDark); rect(rgba, 5, 2, 13, 9, 6, 18, C.gold);
  grass(rgba, 6, 2, 1); rect(rgba, 6, 2, 14, 13, 4, 8, C.flower);
  grass(rgba, 7, 2, 2); rect(rgba, 7, 2, 11, 11, 10, 10, C.moss);
  path(rgba, 0, 3); stone(rgba, 1, 3); stone(rgba, 2, 3); path(rgba, 3, 3, true);
  path(rgba, 4, 3, true); stone(rgba, 5, 3);
  grass(rgba, 0, 4, 1); stone(rgba, 1, 4, true); stone(rgba, 2, 4, true); path(rgba, 3, 4);
  grass(rgba, 4, 4, 2); rect(rgba, 4, 4, 14, 13, 4, 4, C.gold);
  stone(rgba, 5, 4, true); rect(rgba, 5, 4, 15, 12, 3, 5, C.gold);
  return encodePng(width, height, rgba);
}
