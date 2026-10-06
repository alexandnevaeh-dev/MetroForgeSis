import { SeededRNG } from '../rng.js';

/** Terrain planning for the pixel-art woodland set. Art is supplied independently.
 * Values follow the top-down runtime: grass 0, path 1, water 2, wall 3.
 * Large connected material regions replace per-cell random obstacle scatter.
 */
export function carveWoodland(w: number, h: number, seed: number): number[][] {
  const rng = new SeededRNG(seed);
  const tiles: number[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 3 : 0)),
  );
  const paint = (x: number, y: number, radius: number, value: number) => {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const px = Math.round(x) + dx,
          py = Math.round(y) + dy;
        if (px > 0 && py > 0 && px < w - 1 && py < h - 1 && dx * dx + dy * dy <= radius * radius)
          tiles[py]![px] = value;
      }
  };
  // Two connected pond lobes form a landmark rather than isolated blocked pixels.
  const pondX = Math.round(w * 0.73),
    pondY = Math.round(h * 0.42);
  const pondRadius = Math.max(2, Math.floor(Math.min(w, h) * 0.1));
  paint(pondX, pondY, pondRadius, 2);
  paint(pondX + 1, pondY + pondRadius - 1, pondRadius, 2);
  // A broad circulation loop connects a sheltered arrival and the northern ruin.
  const bend = rng.int(-1, 1);
  const anchors = [
    [0.5, 0.77],
    [0.3, 0.64],
    [0.28, 0.32],
    [0.5, 0.19],
    [0.85, 0.24],
    [0.86, 0.67],
    [0.5, 0.77],
  ];
  const route = (from: number[], to: number[]) => {
    const ax = from[0]! * w,
      ay = from[1]! * h;
    const bx = to[0]! * w,
      by = to[1]! * h;
    const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2);
    for (let n = 0; n <= steps; n++) {
      const t = steps === 0 ? 0 : n / steps;
      paint(ax + (bx - ax) * t + Math.sin(t * Math.PI) * bend, ay + (by - ay) * t, 2, 1);
    }
  };
  for (let i = 1; i < anchors.length; i++) route(anchors[i - 1]!, anchors[i]!);
  route([0.28, 0.48], [0.15, 0.48]);
  // Keep the historic central arrival cluster clear until every client uses the new anchors.
  paint(w * 0.5, h * 0.5, Math.max(3, Math.floor(Math.min(w, h) * 0.15)), 0);
  return tiles;
}
