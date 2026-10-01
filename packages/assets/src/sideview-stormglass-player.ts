import { encodePng } from './png.js';

export type StormglassAction =
  | 'idle' | 'walk' | 'run' | 'jump_start' | 'jump' | 'fall'
  | 'land' | 'dash' | 'attack' | 'hurt' | 'death';

const SIZE = 64;
const COUNTS: Record<StormglassAction, number> = {
  idle: 8, walk: 10, run: 12, jump_start: 4, jump: 4, fall: 4,
  land: 5, dash: 8, attack: 10, hurt: 5, death: 10,
};
type Rgba = readonly [number, number, number, number];
const P = {
  ink: [19, 19, 35, 255], stone: [57, 53, 85, 255], cloak: [62, 73, 125, 255],
  cloakLight: [91, 111, 163, 255], mask: [222, 218, 196, 255], amber: [241, 166, 66, 255],
  amberDark: [156, 82, 45, 255], glass: [75, 218, 206, 255], steel: [166, 205, 213, 255],
} as const satisfies Record<string, Rgba>;

function put(out: Uint8Array, width: number, x: number, y: number, color: Rgba): void {
  if (x < 0 || y < 0 || x >= width || y >= SIZE) return;
  out.set(color, (y * width + x) * 4);
}
function rect(out: Uint8Array, width: number, x: number, y: number, w: number, h: number, color: Rgba): void {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) put(out, width, px, py, color);
}
function line(out: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number, color: Rgba): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) put(out, width, Math.round(x0 + (x1 - x0) * i / steps), Math.round(y0 + (y1 - y0) * i / steps), color);
}

function drawFrame(out: Uint8Array, width: number, frame: number, action: StormglassAction, count: number): void {
  const ox = frame * SIZE;
  const phase = frame / count * Math.PI * 2;
  const grounded = !['jump_start', 'jump', 'fall'].includes(action);
  const stride = action === 'walk' ? Math.round(Math.sin(phase) * 3) : action === 'run' ? Math.round(Math.sin(phase) * 5) : 0;
  const lean = action === 'run' || action === 'dash' ? 4 : action === 'hurt' ? -3 : 0;
  const rise = action === 'jump_start' ? frame * 2 : action === 'jump' ? 7 : action === 'fall' ? 4 - frame : 0;
  const death = action === 'death' ? frame / (count - 1) : 0;
  const squash = action === 'land' ? Math.max(0, 5 - frame * 2) : Math.round(death * 15);
  const cx = ox + 31 + lean + (action === 'hurt' ? frame - 2 : 0);
  const feet = 56 - rise;

  rect(out, width, cx - 10, 56, 21, 2, [10, 14, 25, grounded ? 90 : 35]);
  // Legs with opposing stride and a fixed contact line.
  rect(out, width, cx - 7 + stride, feet - 13 + squash, 5, Math.max(3, 12 - squash), P.ink);
  rect(out, width, cx + 2 - stride, feet - 13 + squash, 5, Math.max(3, 12 - squash), P.ink);
  rect(out, width, cx - 8 + stride, feet - 3, 8, 3, P.steel);
  rect(out, width, cx + 1 - stride, feet - 3, 8, 3, P.steel);

  const bodyY = feet - 37 + squash;
  rect(out, width, cx - 11, bodyY, 21, Math.max(8, 25 - squash), P.ink);
  rect(out, width, cx - 9, bodyY + 2, 17, Math.max(6, 20 - squash), P.cloak);
  rect(out, width, cx - 7, bodyY + 4, 5, Math.max(4, 15 - squash), P.cloakLight);
  // Pale asymmetric mask.
  rect(out, width, cx - 6, bodyY - 11, 14, 12, P.ink);
  rect(out, width, cx - 4, bodyY - 9, 10, 8, P.mask);
  rect(out, width, cx + 3, bodyY - 6, 2, 2, P.glass);

  // Amber scarf tail gives every motion a clear secondary action arc.
  const scarfLift = action === 'run' ? -5 : action === 'jump' ? 4 : Math.round(Math.sin(phase) * 2);
  const scarfReach = 16 + (action === 'walk' || action === 'run' || action === 'attack' ? frame : frame % 3);
  line(out, width, cx - 7, bodyY - 1, cx - 17, bodyY + 3 + scarfLift, P.amberDark);
  line(out, width, cx - 9, bodyY, cx - scarfReach, bodyY + 2 + scarfLift, P.amber);

  // Arms oppose the legs; attacks replace the resting blade with a full crescent sweep.
  rect(out, width, cx - 14 - stride, bodyY + 4, 4, 14, P.ink);
  rect(out, width, cx + 9 + stride, bodyY + 4, 4, 14, P.ink);
  const attackT = action === 'attack' ? frame / (count - 1) : 0.22;
  const angle = action === 'attack' ? -1.5 + attackT * 2.4 : -0.35;
  const handX = cx + 11, handY = bodyY + 15;
  const tipX = handX + Math.round(Math.cos(angle) * 22);
  const tipY = handY + Math.round(Math.sin(angle) * 18);
  line(out, width, handX, handY, tipX, tipY, P.steel);
  line(out, width, tipX, tipY, tipX - 5, tipY + 4, P.glass);
  if (action === 'dash' && frame >= 2 && frame <= 5) {
    line(out, width, cx - 14, bodyY + 7, cx - 28, bodyY + 7, [75, 218, 206, 150]);
    line(out, width, cx - 10, bodyY + 14, cx - 24, bodyY + 14, [75, 218, 206, 100]);
  }
}

export function stormglassFrameCount(action: StormglassAction): number { return COUNTS[action]; }

/** New side-view family: transparent 64px strips with a stable grounded foot line. */
export function generateStormglassPlayerSheet(action: StormglassAction): Buffer {
  const count = COUNTS[action], width = SIZE * count;
  const rgba = new Uint8Array(width * SIZE * 4);
  for (let frame = 0; frame < count; frame++) drawFrame(rgba, width, frame, action, count);
  return encodePng(width, SIZE, rgba);
}
