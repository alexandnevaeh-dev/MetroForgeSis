import { describe, expect, it } from 'vitest';
import { generateWorldTopology } from './world.js';
import { planVictoryRoute } from './playtest-route.js';

describe('planVictoryRoute', () => {
  it('finds a transition path to the final room for generated worlds', () => {
    const { worldGraph, roomIds } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
      profile: 'TINY_TEST',
    });

    const route = planVictoryRoute(worldGraph, {
      victoryRoomId: roomIds[roomIds.length - 1],
    });

    expect(route.reachable).toBe(true);
    expect(route.transitions.length).toBeGreaterThan(0);
    expect(route.transitions[0]!.fromRoomId).toBe(roomIds[0]);
    expect(route.visitedRoomOrder.at(-1)).toBe(roomIds[roomIds.length - 1]);
    expect(route.transitions.every((step) => step.fromRoomId !== step.toRoomId)).toBe(true);
  });

  it('returns unreachable when the victory room is disconnected', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 7,
      roomCount: 4,
      biomeCount: 1,
      abilities: [],
      bossCount: 1,
      profile: 'TINY_TEST',
    });

    const route = planVictoryRoute(worldGraph, { victoryRoomId: 'room_missing' });
    expect(route.reachable).toBe(false);
    expect(route.transitions).toHaveLength(0);
  });
});
