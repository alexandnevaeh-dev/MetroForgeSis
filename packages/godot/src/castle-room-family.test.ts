import { describe, it, expect } from 'vitest';
import { CASTLE_ROOM_FAMILIES, buildCastleRoomFamily } from './castle-room-family.js';

describe('original castle room families', () => {
  for (const family of CASTLE_ROOM_FAMILIES)
    it(`${family} fits its grid and has supported stair landings`, () => {
      const plan = buildCastleRoomFamily(family);
      for (const rect of plan.platforms) {
        for (const value of Object.values(rect)) expect(value % 32).toBe(0);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(plan.width);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.y + rect.height).toBeLessThanOrEqual(plan.height);
      }
      for (const route of plan.routes) {
        const last = route.targets.at(-1)!;
        expect(last.y).toBe(plan.floors[route.to]);
        expect(
          plan.platforms.some((p) => p.y === last.y && p.x <= last.x && p.x + p.width >= last.x),
        ).toBe(true);
        expect(route.targets.every((p, i) => p.y === plan.floors[route.from]! - (i + 1) * 96)).toBe(
          true,
        );
      }
    });
});
