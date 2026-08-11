import { describe, it, expect } from 'vitest';
import { generateWorldTopology, resolveRoomCount } from '../src/world.js';

describe('resolveRoomCount', () => {
  it('returns fixed count for TINY_TEST', () => {
    expect(resolveRoomCount('TINY_TEST', 42)).toBe(8);
  });

  it('returns seeded range for MEDIUM', () => {
    const a = resolveRoomCount('MEDIUM', 42);
    const b = resolveRoomCount('MEDIUM', 42);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(80);
    expect(a).toBeLessThanOrEqual(120);
  });
});

describe('MEDIUM world topology', () => {
  it('generates branching graph with multiple ability gates', () => {
    const abilities = ['dash', 'wall_jump', 'grapple', 'double_jump', 'ground_slam', 'phase'];
    const { worldGraph, roomIds } = generateWorldTopology({
      seed: 123,
      roomCount: 90,
      biomeCount: 5,
      abilities,
      bossCount: 5,
      profile: 'MEDIUM',
    });

    expect(roomIds).toHaveLength(90);
    expect(worldGraph.regions).toHaveLength(5);

    const gatedEdges = worldGraph.edges.filter((e) => e.requirements.length > 0);
    expect(gatedEdges.length).toBeGreaterThanOrEqual(abilities.length);
  });
});

describe('SeededRNG branching', () => {
  it('branching is deterministic', () => {
    const opts = {
      seed: 99,
      roomCount: 50,
      biomeCount: 3,
      abilities: ['dash', 'wall_jump'],
      bossCount: 2,
      profile: 'SMALL' as const,
    };
    const a = generateWorldTopology(opts);
    const b = generateWorldTopology(opts);
    expect(a.worldGraph.edges.length).toBe(b.worldGraph.edges.length);
  });
});
