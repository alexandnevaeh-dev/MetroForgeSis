import { encodePng } from './png.js';

export type StormglassBackgroundLayer = 'far' | 'mid' | 'near' | 'foreground' | 'overlay';
type Rgba = readonly [number, number, number, number];
const SIZES: Record<StormglassBackgroundLayer, readonly [number, number]> = {
  far: [960, 540], mid: [960, 320], near: [960, 320], foreground: [960, 540], overlay: [640, 360],
};
const C = {
  skyTop: [7, 12, 29, 255], skyMid: [18, 35, 58, 255], skyBottom: [44, 72, 92, 255],
  cloudDark: [30, 48, 70, 210], cloudLight: [69, 91, 111, 128], moon: [197, 225, 218, 255],
  cliffFar: [15, 21, 39, 255], cliffNear: [23, 28, 49, 255],
  ruinDark: [22, 23, 43, 255], ruin: [38, 41, 69, 255], ruinLight: [70, 77, 109, 255],
  mortar: [94, 99, 126, 170], teal: [64, 204, 197, 230], rose: [207, 69, 127, 225],
  amber: [238, 161, 62, 235], violet: [116, 83, 174, 220], mist: [92, 151, 166, 36],
} as const satisfies Record<string, Rgba>;

function put(out: Uint8Array, width: number, height: number, x: number, y: number, color: Rgba): void {
  const px = Math.round(x); const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return;
  out.set(color, (py * width + px) * 4);
}
function rect(out: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number, color: Rgba): void {
  for (let py = Math.max(0, Math.floor(y)); py < Math.min(height, Math.ceil(y + h)); py++)
    for (let px = Math.max(0, Math.floor(x)); px < Math.min(width, Math.ceil(x + w)); px++) put(out, width, height, px, py, color);
}
function line(out: Uint8Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number, color: Rgba, thickness = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let step = 0; step <= steps; step++) {
    const t = steps === 0 ? 0 : step / steps;
    const x = Math.round(x0 + (x1 - x0) * t); const y = Math.round(y0 + (y1 - y0) * t);
    rect(out, width, height, x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
  }
}
function disc(out: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number, color: Rgba): void {
  for (let y = -radius; y <= radius; y++) {
    const half = Math.floor(Math.sqrt(Math.max(0, radius * radius - y * y)));
    rect(out, width, height, cx - half, cy + y, half * 2 + 1, 1, color);
  }
}
function steppedSpire(out: Uint8Array, width: number, height: number, cx: number, base: number, towerWidth: number, towerHeight: number, color: Rgba): void {
  rect(out, width, height, cx - towerWidth / 2, base - towerHeight, towerWidth, towerHeight, color);
  rect(out, width, height, cx - towerWidth * 0.62, base - towerHeight - 7, towerWidth * 1.24, 7, color);
  for (let tier = 0; tier < 4; tier++) rect(out, width, height, cx - (towerWidth / 2 - tier * 4), base - towerHeight - 15 - tier * 7, towerWidth - tier * 8, 8, color);
  line(out, width, height, cx, base - towerHeight - 43, cx, base - towerHeight - 54, color, 2);
}
function pointedArch(out: Uint8Array, width: number, height: number, cx: number, floor: number, span: number, archHeight: number, color: Rgba, edge: Rgba): void {
  const left = Math.round(cx - span / 2); const right = Math.round(cx + span / 2);
  const spring = Math.round(floor - archHeight * 0.58); const apex = Math.round(floor - archHeight);
  rect(out, width, height, left, spring, 12, floor - spring, color); rect(out, width, height, right - 12, spring, 12, floor - spring, color);
  line(out, width, height, left, spring, cx, apex, color, 12); line(out, width, height, cx, apex, right, spring, color, 12);
  line(out, width, height, left + 5, spring, cx, apex + 8, edge, 2); line(out, width, height, cx, apex + 8, right - 5, spring, edge, 2);
}
function lancetWindow(out: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number, glass: Rgba): void {
  const cx = Math.round(x + w / 2);
  rect(out, width, height, x, y + Math.floor(w / 2), w, h - Math.floor(w / 2), glass);
  for (let row = 0; row < Math.ceil(w / 2); row++) rect(out, width, height, cx - row, y + row, row * 2 + 1, 1, glass);
  line(out, width, height, cx, y + 3, cx, y + h, C.ruinDark, 2); line(out, width, height, x + 2, y + h * 0.58, x + w - 2, y + h * 0.58, C.ruinDark, 2);
}

/** Cohesive storm-lashed cliff monastery parallax, authored as crisp pixel art. */
export function generateStormglassBackground(layer: StormglassBackgroundLayer, biome = 0): Buffer {
  const [width, height] = SIZES[layer]; const out = new Uint8Array(width * height * 4);
  if (layer === 'far') {
    for (let y = 0; y < height; y++) {
      const t = y / Math.max(1, height - 1); const split = t < 0.56 ? t / 0.56 : (t - 0.56) / 0.44;
      const a = t < 0.56 ? C.skyTop : C.skyMid; const b = t < 0.56 ? C.skyMid : C.skyBottom;
      const color: Rgba = [Math.round(a[0] + (b[0] - a[0]) * split), Math.round(a[1] + (b[1] - a[1]) * split), Math.round(a[2] + (b[2] - a[2]) * split), 255];
      rect(out, width, height, 0, y, width, 1, color);
    }
    disc(out, width, height, 792, 84, 34, C.moon); disc(out, width, height, 804, 75, 33, C.skyTop);
    for (let i = 0; i < 54; i++) { const x = (i * 173 + biome * 47) % width; const y = 18 + ((i * 71) % 210); put(out, width, height, x, y, i % 5 === 0 ? C.teal : C.moon); }
    for (let band = 0; band < 5; band++) {
      const y = 110 + band * 48 + ((biome * 11 + band * 17) % 23);
      for (let x = -90 + band * 61; x < width; x += 240) { rect(out, width, height, x, y, 160, 8, C.cloudDark); rect(out, width, height, x + 28, y - 5, 96, 5, C.cloudLight); }
    }
    const base = height - 34;
    for (let x = -80; x < width + 120; x += 120) { const peak = 300 + ((x * 13 + biome * 29) % 95); line(out, width, height, x, base, x + 54, peak, C.cliffFar, 22); line(out, width, height, x + 54, peak, x + 122, base, C.cliffFar, 22); }
    rect(out, width, height, 0, base - 18, width, 52, C.cliffFar);
    for (const [x, w, h] of [[70, 44, 128], [188, 58, 175], [344, 38, 116], [510, 72, 205], [690, 46, 146], [865, 54, 188]] as const) {
      steppedSpire(out, width, height, x, base - 12, w, h, C.cliffNear);
      for (let wy = base - h + 22; wy < base - 30; wy += 31) rect(out, width, height, x - 3, wy, 6, 11, C.amber);
    }
    line(out, width, height, 214, base - 92, 540, base - 134, C.cliffNear, 8); line(out, width, height, 540, base - 134, 716, base - 84, C.cliffNear, 8);
  } else if (layer === 'mid') {
    rect(out, width, height, 0, height - 34, width, 34, C.ruinDark);
    for (let bay = 0; bay < 6; bay++) {
      const cx = 82 + bay * 170 + ((biome * 23) % 31);
      pointedArch(out, width, height, cx, height - 30, 126, 186 + (bay % 2) * 22, C.ruin, C.ruinLight);
      rect(out, width, height, cx - 74, height - 47, 148, 14, C.ruinLight); rect(out, width, height, cx - 66, height - 41, 132, 5, C.mortar);
      if (bay % 2 === 0) steppedSpire(out, width, height, cx - 63, height - 32, 28, 122, C.ruinDark);
    }
    for (let x = 20; x < width; x += 96) { line(out, width, height, x, height - 34, x + 44, height - 124 - (x % 3) * 14, C.ruinDark, 7); line(out, width, height, x + 44, height - 124 - (x % 3) * 14, x + 82, height - 34, C.ruinDark, 7); }
    for (let y = height - 92; y < height; y += 17) rect(out, width, height, (y * 7) % 90 - 40, y, width, 7, C.mist);
  } else if (layer === 'near') {
    for (let bay = 0; bay < 5; bay++) {
      const x = bay * 208; const glass = [C.teal, C.rose, C.amber, C.violet][(bay + biome) % 4]!;
      rect(out, width, height, x + 14, 58, 24, height - 58, C.ruinDark); rect(out, width, height, x + 174, 36, 28, height - 36, C.ruinDark);
      rect(out, width, height, x + 28, 79, 158, 16, C.ruin); rect(out, width, height, x + 41, 96, 132, 8, C.ruinLight);
      lancetWindow(out, width, height, x + 80, 116, 48, 112, glass); rect(out, width, height, x + 77, 226, 54, 7, C.ruinLight);
      for (let chip = 0; chip < 5; chip++) rect(out, width, height, x + 22 + chip * 34, 70 + (chip % 2) * 9, 7, 4, C.mortar);
    }
    for (let x = 0; x < width; x += 13) if ((x + biome) % 39 !== 0) put(out, width, height, x, height - 18 - ((x * 7) % 6), C.teal);
  } else if (layer === 'foreground') {
    rect(out, width, height, 0, 0, 30, height, [9, 11, 24, 238]); rect(out, width, height, width - 30, 0, 30, height, [9, 11, 24, 238]);
    for (const side of [0, 1]) {
      const edge = side === 0 ? 28 : width - 29; const direction = side === 0 ? 1 : -1;
      for (let y = 18; y < height; y += 82) { line(out, width, height, edge, y, edge + direction * (42 + (y % 3) * 7), y + 18, C.ruinDark, 7); line(out, width, height, edge + direction * 14, y + 5, edge + direction * 7, y + 48, C.ruinLight, 3); disc(out, width, height, edge + direction * 42, y + 18, 5, y % 164 === 18 ? C.teal : C.rose); }
    }
    for (let x = 0; x < width; x += 120) { line(out, width, height, x, 0, x + 18, 72 + (x % 5) * 9, [15, 19, 35, 185], 3); disc(out, width, height, x + 18, 74 + (x % 5) * 9, 4, C.amber); }
  } else {
    for (let x = 8; x < width; x += 23) for (let y = (x * 7) % 41; y < height; y += 53) line(out, width, height, x, y, x - 3, y + 11, [128, 222, 229, 45], 1);
    for (let y = 238; y < height; y += 19) rect(out, width, height, (y * 5) % 70 - 30, y, width, 5, C.mist);
  }
  return encodePng(width, height, out);
}
