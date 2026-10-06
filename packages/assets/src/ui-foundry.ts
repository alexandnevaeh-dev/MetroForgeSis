import { encodePng } from './png.js';

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [40, 48, 62];
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function setPx(rgba: Uint8Array, w: number, x: number, y: number, rgb: [number, number, number], a = 255): void {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  rgba[i] = rgb[0];
  rgba[i + 1] = rgb[1];
  rgba[i + 2] = rgb[2];
  rgba[i + 3] = a;
}

export function generateUiPanel(opts: {
  width: number;
  height: number;
  fill: string;
  border: string;
  accent: string;
  borderPx?: number;
}): Buffer {
  const { width, height } = opts;
  const fill = hexRgb(opts.fill);
  const border = hexRgb(opts.border);
  const accent = hexRgb(opts.accent);
  const b = opts.borderPx ?? 2;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x < b || y < b || x >= width - b || y >= height - b;
      const corner = (x < b + 2 && y < b + 2) || (x >= width - b - 2 && y < b + 2);
      setPx(rgba, width, x, y, edge ? (corner ? accent : border) : fill, edge ? 255 : 220);
    }
  }
  return encodePng(width, height, rgba);
}

export function generateUiIcon(opts: { size: number; fill: string; accent: string; kind: string }): Buffer {
  const s = opts.size;
  const fill = hexRgb(opts.fill);
  const accent = hexRgb(opts.accent);
  const rgba = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = x - s / 2;
      const dy = y - s / 2;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < s * 0.42) setPx(rgba, s, x, y, r < s * 0.22 ? accent : fill);
    }
  }
  void opts.kind;
  return encodePng(s, s, rgba);
}

export const UI_FOUNDRY_ASSETS = [
  { id: 'hud_frame', path: 'assets/ui/hud_frame.png', width: 320, height: 48, kind: 'panel' },
  { id: 'health_meter', path: 'assets/ui/health_meter.png', width: 128, height: 16, kind: 'meter' },
  { id: 'boss_bar', path: 'assets/ui/boss_bar.png', width: 256, height: 20, kind: 'meter' },
  { id: 'dialogue_panel', path: 'assets/ui/dialogue_panel.png', width: 320, height: 96, kind: 'panel' },
  { id: 'quest_panel', path: 'assets/ui/quest_panel.png', width: 240, height: 120, kind: 'panel' },
  { id: 'inventory_panel', path: 'assets/ui/inventory_panel.png', width: 256, height: 192, kind: 'panel' },
  { id: 'inventory_slot', path: 'assets/ui/inventory_slot.png', width: 32, height: 32, kind: 'slot' },
  { id: 'button_frame', path: 'assets/ui/button_frame.png', width: 96, height: 32, kind: 'panel' },
  { id: 'menu_panel', path: 'assets/ui/menu_panel.png', width: 280, height: 180, kind: 'panel' },
  { id: 'cursor', path: 'assets/ui/cursor.png', width: 16, height: 16, kind: 'icon' },
  { id: 'selector', path: 'assets/ui/selector.png', width: 24, height: 24, kind: 'icon' },
  { id: 'map_marker', path: 'assets/ui/map_marker.png', width: 16, height: 16, kind: 'icon' },
] as const;
