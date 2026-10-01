import { encodePng } from './png.js';

export const TOP_DOWN_FACINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type TopDownFacing = (typeof TOP_DOWN_FACINGS)[number];
export type TopDownAction = 'idle' | 'walk' | 'run' | 'attack' | 'hurt' | 'death';

const FRAME_SIZE = 64;
const PALETTE = {
  outline: [25, 24, 38, 255],
  shadow: [57, 43, 73, 255],
  cloak: [205, 72, 78, 255],
  cloakLight: [239, 116, 88, 255],
  cream: [238, 218, 164, 255],
  skin: [191, 132, 104, 255],
  steel: [167, 207, 211, 255],
  glow: [79, 222, 190, 255],
} as const;

type Rgba = readonly [number, number, number, number];

function frameCount(action: TopDownAction): number {
  return { idle: 4, walk: 8, run: 10, attack: 10, hurt: 4, death: 8 }[action];
}

function facingVector(facing: TopDownFacing): [number, number] {
  const vectors: Record<TopDownFacing, [number, number]> = {
    N: [0, -1],
    NE: [1, -1],
    E: [1, 0],
    SE: [1, 1],
    S: [0, 1],
    SW: [-1, 1],
    W: [-1, 0],
    NW: [-1, -1],
  };
  return vectors[facing];
}

function put(buffer: Uint8Array, sheetWidth: number, x: number, y: number, color: Rgba): void {
  if (x < 0 || y < 0 || x >= sheetWidth || y >= FRAME_SIZE) return;
  const index = (y * sheetWidth + x) * 4;
  buffer[index] = color[0];
  buffer[index + 1] = color[1];
  buffer[index + 2] = color[2];
  buffer[index + 3] = color[3];
}

function rect(
  buffer: Uint8Array,
  sheetWidth: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Rgba,
): void {
  for (let py = y; py < y + h; py++)
    for (let px = x; px < x + w; px++) put(buffer, sheetWidth, px, py, color);
}

function drawFrame(
  buffer: Uint8Array,
  sheetWidth: number,
  frame: number,
  action: TopDownAction,
  facing: TopDownFacing,
  count: number,
): void {
  const origin = frame * FRAME_SIZE;
  const phase = (frame / count) * Math.PI * 2;
  const [fx, fy] = facingVector(facing);
  const gait =
    action === 'walk'
      ? Math.round(Math.sin(phase) * 2)
      : action === 'run'
        ? Math.round(Math.sin(phase) * 3)
        : 0;
  const bob =
    action === 'idle'
      ? frame === 1
        ? -1
        : frame === 3
          ? 1
          : 0
      : action === 'walk'
        ? Math.abs(Math.round(Math.sin(phase)))
        : action === 'run'
          ? Math.abs(Math.round(Math.sin(phase) * 2))
          : 0;
  const hurtDirection = fx === 0 ? 1 : fx;
  const hurt = action === 'hurt' ? Math.round((frame - (count - 1) / 2) * hurtDirection * 2) : 0;
  const death = action === 'death' ? frame / Math.max(1, count - 1) : 0;
  const cx = origin + 32 + Math.round(hurt);
  const feetY = 55 + bob + Math.round(death * 4);
  const squash = Math.round(death * 12);

  // Soft, fixed foot shadow makes the feet anchor visible without becoming scenery.
  rect(buffer, sheetWidth, cx - 9, 55, 18, 2, [18, 22, 32, Math.round(105 * (1 - death * 0.6))]);

  const legA = gait;
  const legB = -gait;
  rect(
    buffer,
    sheetWidth,
    cx - 7 + legA,
    feetY - 10 + squash,
    5,
    Math.max(3, 9 - squash),
    PALETTE.outline,
  );
  rect(
    buffer,
    sheetWidth,
    cx + 2 + legB,
    feetY - 10 + squash,
    5,
    Math.max(3, 9 - squash),
    PALETTE.outline,
  );
  rect(buffer, sheetWidth, cx - 8 + legA, feetY - 3, 7, 3, PALETTE.cream);
  rect(buffer, sheetWidth, cx + 1 + legB, feetY - 3, 7, 3, PALETTE.cream);

  const bodyTop = 27 + squash;
  rect(buffer, sheetWidth, cx - 11, bodyTop, 22, Math.max(7, 23 - squash), PALETTE.outline);
  rect(buffer, sheetWidth, cx - 9, bodyTop + 2, 18, Math.max(5, 18 - squash), PALETTE.cloak);
  rect(
    buffer,
    sheetWidth,
    cx - 7 - fx * 2,
    bodyTop + 4,
    6,
    Math.max(3, 13 - squash),
    PALETTE.cloakLight,
  );
  rect(buffer, sheetWidth, cx - 9, bodyTop + Math.max(5, 18 - squash), 18, 3, PALETTE.shadow);

  const headY = 16 + Math.round(death * 13);
  rect(buffer, sheetWidth, cx - 8, headY, 16, 13, PALETTE.outline);
  rect(buffer, sheetWidth, cx - 6, headY + 2, 12, 9, PALETTE.cream);
  rect(buffer, sheetWidth, cx - 6 - fx * 2, headY + 2, 5, 9, PALETTE.cloakLight);
  if (fy >= 0) {
    rect(buffer, sheetWidth, cx - 4 + fx * 2, headY + 6, 8, 4, PALETTE.skin);
    put(buffer, sheetWidth, cx + fx * 3 - 2, headY + 7, PALETTE.outline);
    put(buffer, sheetWidth, cx + fx * 3 + 2, headY + 7, PALETTE.outline);
  }

  const armSwing = action === 'walk' || action === 'run' ? -gait : 0;
  rect(buffer, sheetWidth, cx - 15, bodyTop + 4 + armSwing, 5, 15, PALETTE.outline);
  rect(buffer, sheetWidth, cx + 10, bodyTop + 4 - armSwing, 5, 15, PALETTE.outline);
  rect(buffer, sheetWidth, cx - 13, bodyTop + 6 + armSwing, 3, 10, PALETTE.cloakLight);
  rect(buffer, sheetWidth, cx + 10, bodyTop + 6 - armSwing, 3, 10, PALETTE.cloak);

  // Sword direction follows the authored facing. Attack uses anticipation, contact, recovery.
  const attackT = action === 'attack' ? frame / Math.max(1, count - 1) : 0.2;
  const sweep = action === 'attack' ? (attackT - 0.5) * Math.PI * 1.4 : 0;
  const baseAngle = Math.atan2(fy, fx || 0.001);
  const angle = baseAngle + sweep;
  const handX = cx + 10;
  const handY = bodyTop + 14;
  const length = action === 'attack' ? 17 : 13;
  for (let n = 0; n < length; n++) {
    const px = Math.round(handX + Math.cos(angle) * n);
    const py = Math.round(handY + Math.sin(angle) * n * 0.65);
    put(buffer, sheetWidth, px, py, n < 3 ? PALETTE.cream : PALETTE.steel);
    if (n > 4) put(buffer, sheetWidth, px, py + 1, PALETTE.outline);
  }
  if (action === 'attack' && frame >= 4 && frame <= 6)
    put(
      buffer,
      sheetWidth,
      Math.round(handX + Math.cos(angle) * length),
      Math.round(handY + Math.sin(angle) * length * 0.65),
      PALETTE.glow,
    );
}

/** Crisp, transparent, bottom-anchored strips for the separate top-down pixel-art set. */
export function generateTopDownPlayerSheet(action: TopDownAction, facing: TopDownFacing): Buffer {
  const count = frameCount(action);
  const width = FRAME_SIZE * count;
  const rgba = new Uint8Array(width * FRAME_SIZE * 4);
  for (let frame = 0; frame < count; frame++) drawFrame(rgba, width, frame, action, facing, count);
  return encodePng(width, FRAME_SIZE, rgba);
}

export function topDownPlayerFrameCount(action: TopDownAction): number {
  return frameCount(action);
}
