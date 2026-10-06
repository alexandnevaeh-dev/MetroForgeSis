import { encodePng } from './png.js';

export const STORMGLASS_TILE_SIZE = 32;
export const STORMGLASS_ATLAS_WIDTH = 256;
export const STORMGLASS_ATLAS_HEIGHT = 192;
type Rgba = readonly [number, number, number, number];

const C = {
  void: [17, 18, 34, 255], mortar: [31, 31, 57, 255], stone: [55, 57, 88, 255],
  stoneLight: [84, 88, 124, 255], wet: [43, 75, 103, 255], teal: [57, 188, 181, 255],
  tealLight: [123, 235, 215, 255], amber: [226, 151, 57, 255], rose: [195, 75, 124, 255],
  glassDark: [40, 72, 102, 255], white: [202, 215, 207, 255],
} as const satisfies Record<string, Rgba>;

const BIOME_PALETTES = [
  // Gothic Castle: blue-black masonry, restrained violet glass and cold rain edges.
  { void: [13, 17, 32, 255], mortar: [25, 27, 49, 255], stone: [49, 53, 83, 255], stoneLight: [82, 91, 126, 255], wet: [38, 75, 104, 255], teal: [55, 178, 178, 255], tealLight: [126, 225, 214, 255], amber: [213, 145, 55, 255], rose: [174, 67, 112, 255], glassDark: [31, 57, 86, 255] },
  // Sunken Halls: water-darkened limestone with oxidized teal seams.
  { void: [10, 24, 35, 255], mortar: [18, 41, 53, 255], stone: [42, 69, 79, 255], stoneLight: [76, 111, 116, 255], wet: [25, 91, 111, 255], teal: [39, 170, 169, 255], tealLight: [127, 225, 207, 255], amber: [202, 156, 75, 255], rose: [126, 79, 117, 255], glassDark: [22, 67, 82, 255] },
  // Ancient Ruins: charcoal stone, worn bronze and muted relic light.
  { void: [25, 20, 25, 255], mortar: [44, 35, 39, 255], stone: [79, 66, 63, 255], stoneLight: [124, 104, 86, 255], wet: [67, 76, 70, 255], teal: [75, 150, 143, 255], tealLight: [143, 202, 176, 255], amber: [219, 159, 67, 255], rose: [150, 70, 83, 255], glassDark: [59, 49, 55, 255] },
  // Storm-Ice Heights: near-black slate, frost-blue edges and electric glass.
  { void: [10, 17, 31, 255], mortar: [20, 33, 52, 255], stone: [45, 68, 91, 255], stoneLight: [100, 137, 158, 255], wet: [46, 105, 133, 255], teal: [73, 198, 207, 255], tealLight: [171, 239, 237, 255], amber: [227, 177, 79, 255], rose: [154, 79, 137, 255], glassDark: [27, 64, 94, 255] },
] as const satisfies ReadonlyArray<Record<Exclude<keyof typeof C, 'white'>, Rgba>>;

function pixel(out: Uint8Array, c: number, r: number, x: number, y: number, color: Rgba): void {
  const px = c * 32 + x, py = r * 32 + y;
  if (px < 0 || py < 0 || px >= 256 || py >= 192) return;
  out.set(color, (py * 256 + px) * 4);
}
function rect(out: Uint8Array, c: number, r: number, x: number, y: number, w: number, h: number, color: Rgba): void {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) pixel(out, c, r, px, py, color);
}
function fill(out: Uint8Array, c: number, r: number, color: Rgba): void { rect(out, c, r, 0, 0, 32, 32, color); }
function masonry(out: Uint8Array, c: number, r: number, accent: Rgba = C.stoneLight): void {
  fill(out, c, r, C.stone);
  for (const y of [7, 15, 23, 31]) rect(out, c, r, 0, y, 32, 1, C.mortar);
  for (let band = 0; band < 4; band++) {
    const shift = band % 2 ? 5 : 0;
    for (let x = shift; x < 32; x += 11) rect(out, c, r, x, band * 8, 1, 7, C.mortar);
  }
  rect(out, c, r, 2, 2, 8, 1, accent);
}
function glass(out: Uint8Array, c: number, r: number): void {
  fill(out, c, r, C.glassDark);
  rect(out, c, r, 2, 2, 28, 28, C.mortar);
  rect(out, c, r, 4, 4, 11, 11, C.teal);
  rect(out, c, r, 17, 4, 11, 11, C.rose);
  rect(out, c, r, 4, 17, 11, 11, C.amber);
  rect(out, c, r, 17, 17, 11, 11, C.teal);
  rect(out, c, r, 6, 5, 2, 8, C.tealLight);
}
function platform(out: Uint8Array, c: number, r: number, edge: 'none' | 'left' | 'right' = 'none'): void {
  fill(out, c, r, C.void);
  rect(out, c, r, edge === 'left' ? 5 : 0, 2, edge === 'right' ? 27 : edge === 'left' ? 27 : 32, 5, C.stoneLight);
  rect(out, c, r, edge === 'left' ? 5 : 0, 7, edge === 'right' ? 27 : edge === 'left' ? 27 : 32, 3, C.mortar);
  rect(out, c, r, edge === 'left' ? 8 : 3, 10, 4, 15, C.stone);
  rect(out, c, r, edge === 'right' ? 21 : 20, 10, 4, 12, C.stone);
}
function water(out: Uint8Array, c: number, r: number): void {
  fill(out, c, r, C.void);
  for (let y = 6; y < 32; y += 6) {
    rect(out, c, r, y % 4, y, 13, 2, C.teal);
    rect(out, c, r, 18 - y % 3, y + 2, 10, 1, C.tealLight);
  }
}
function crack(out: Uint8Array, c: number, r: number): void {
  rect(out, c, r, 16, 4, 2, 10, C.mortar); rect(out, c, r, 12, 13, 6, 2, C.mortar);
  rect(out, c, r, 11, 15, 2, 9, C.mortar); rect(out, c, r, 8, 22, 5, 2, C.mortar);
}

function recolorForBiome(out: Uint8Array, biomeIndex: number): void {
  const palette = BIOME_PALETTES[Math.max(0, Math.min(BIOME_PALETTES.length - 1, biomeIndex))]!;
  const replacements = Object.entries(palette).map(([name, replacement]) => ({
    source: C[name as keyof typeof palette],
    replacement,
  }));
  for (let i = 0; i < out.length; i += 4) {
    for (const { source, replacement } of replacements) {
      if (out[i] === source[0] && out[i + 1] === source[1] && out[i + 2] === source[2]) {
        out.set(replacement, i);
        break;
      }
    }
  }
}

function addBiomeSurfaceDetails(out: Uint8Array, biomeIndex: number): void {
  const platformTiles: ReadonlyArray<readonly [number, number]> = [
    [3, 0], [0, 2], [1, 2], [2, 2], [3, 3], [3, 4],
  ];
  if (biomeIndex === 1) {
    // Oxidized copper caps, algae and mineral drips distinguish flooded traversal ledges.
    for (const [c, r] of platformTiles) {
      rect(out, c, r, 0, 1, 32, 3, [75, 137, 132, 255]);
      rect(out, c, r, 4 + (c * 5) % 14, 4, 8, 2, [62, 175, 156, 255]);
      rect(out, c, r, 8 + (c * 7) % 13, 6, 2, 10 + (r % 3) * 3, [27, 103, 108, 255]);
      rect(out, c, r, 22, 7, 3, 7, [39, 151, 141, 255]);
    }
  } else if (biomeIndex === 2) {
    // Heavy bronze rails, repair staples and small archive runes replace generic brick ledges.
    for (const [c, r] of platformTiles) {
      rect(out, c, r, 0, 1, 32, 3, [191, 137, 61, 255]);
      rect(out, c, r, 2, 4, 28, 2, [105, 72, 45, 255]);
      rect(out, c, r, 7, 10, 3, 12, [151, 99, 49, 255]);
      rect(out, c, r, 21, 10, 3, 12, [151, 99, 49, 255]);
      rect(out, c, r, 13, 11, 6, 2, [219, 159, 67, 255]);
      rect(out, c, r, 15, 9, 2, 7, [219, 159, 67, 255]);
    }
  } else if (biomeIndex === 3) {
    // Bright frost caps and irregular icicles make the final-height platforms unmistakable.
    for (const [c, r] of platformTiles) {
      rect(out, c, r, 0, 0, 32, 3, [171, 229, 235, 255]);
      rect(out, c, r, 2, 3, 28, 2, [94, 162, 190, 255]);
      rect(out, c, r, 5 + (c * 3) % 5, 5, 3, 9 + (r % 2) * 5, [118, 195, 213, 255]);
      rect(out, c, r, 18 + (r * 2) % 5, 5, 2, 6 + (c % 3) * 4, [154, 220, 225, 255]);
    }
  } else {
    // The opening castle uses engraved silver-blue caps and narrow structural braces.
    for (const [c, r] of platformTiles) {
      rect(out, c, r, 0, 1, 32, 2, [103, 117, 151, 255]);
      rect(out, c, r, 4, 4, 24, 2, [38, 43, 70, 255]);
      rect(out, c, r, 7, 10, 3, 12, [67, 73, 108, 255]);
      rect(out, c, r, 22, 10, 3, 12, [67, 73, 108, 255]);
    }
  }
}

/** Complete side-view Stormglass atlas using MetroForge's canonical role positions. */
export function generateStormglassTileset(biomeIndex = 0): Buffer {
  const out = new Uint8Array(256 * 192 * 4);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) masonry(out, c, r);
  masonry(out, 0, 0); masonry(out, 1, 0); masonry(out, 2, 0, C.wet); platform(out, 3, 0);
  for (let c = 4; c < 8; c++) masonry(out, c, 0, c % 2 ? C.teal : C.stoneLight);
  for (let c = 0; c < 8; c++) masonry(out, c, 1, c % 3 === 0 ? C.teal : C.stoneLight);
  platform(out, 0, 2, 'left'); platform(out, 1, 2, 'right'); platform(out, 2, 2); water(out, 3, 2);
  masonry(out, 4, 2); crack(out, 4, 2); glass(out, 5, 2);
  glass(out, 6, 2); masonry(out, 7, 2); rect(out, 7, 2, 13, 6, 6, 20, C.amber);
  masonry(out, 0, 3, C.wet); masonry(out, 1, 3, C.wet); masonry(out, 2, 3, C.wet); platform(out, 3, 3);
  masonry(out, 4, 3); crack(out, 4, 3); masonry(out, 5, 3); crack(out, 5, 3);
  masonry(out, 0, 4, C.teal); rect(out, 0, 4, 0, 26, 32, 6, C.wet);
  masonry(out, 1, 4, C.teal); rect(out, 1, 4, 0, 0, 5, 18, C.wet);
  masonry(out, 2, 4, C.teal); rect(out, 2, 4, 0, 26, 32, 6, C.wet);
  platform(out, 3, 4); rect(out, 3, 4, 5, 2, 12, 2, C.teal);
  glass(out, 4, 4); glass(out, 5, 4);
  recolorForBiome(out, biomeIndex);
  addBiomeSurfaceDetails(out, biomeIndex);
  return encodePng(256, 192, out);
}
