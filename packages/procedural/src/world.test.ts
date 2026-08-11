import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/rng.js';
import {
  generateWorldTopology,
  validateReachability,
  validateWorldConnectivity,
} from '../src/world.js';

describe('SeededRNG', () => {
  it('produces deterministic sequence', () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(42);
    for (let i = 0; i < 10; i++) {
      expect(a.next()).toBe(b.next());
    }
  });
});

describe('generateWorldTopology', () => {
  it('generates correct room count', () => {
    const result = generateWorldTopology({
      seed: 1,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
    });
    expect(result.roomIds).toHaveLength(8);
    expect(result.worldGraph.nodes).toHaveLength(8);
  });
});

describe('validateReachability', () => {
  it('reaches the final boss starting from zero unlocked abilities (progressive unlock)', () => {
    const { progressionGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash', 'wall_jump'],
      bossCount: 1,
    });
    // Deliberately starts empty — proves each ability is picked up via its own progression
    // node and unlocks the next gate, rather than everything being pre-granted.
    const { reachable, unreachableNodes } = validateReachability(progressionGraph, new Set());
    expect(reachable).toBe(true);
    expect(unreachableNodes).toHaveLength(0);
  });

  it('actually gates progression on the required ability (not a no-op check)', () => {
    const { progressionGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash', 'wall_jump'],
      bossCount: 1,
    });
    // Simulate a broken world where the wall_jump ability node was never actually placed —
    // its outgoing edge (which requires wall_jump) should now be untraversable.
    const brokenGraph = {
      ...progressionGraph,
      nodes: progressionGraph.nodes.filter((n) => n.id !== 'ability_wall_jump'),
    };
    const { reachable, unreachableNodes } = validateReachability(brokenGraph, new Set());
    expect(reachable).toBe(false);
    expect(unreachableNodes).toContain(brokenGraph.endNodeId);
  });
});

describe('validateWorldConnectivity', () => {
  it('reports every room reachable in a normally generated world', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 40,
      biomeCount: 3,
      abilities: ['dash', 'wall_jump'],
      bossCount: 1,
    });
    const { connected, unreachableRoomIds } = validateWorldConnectivity(worldGraph);
    expect(connected).toBe(true);
    expect(unreachableRoomIds).toHaveLength(0);
  });

  it('catches rooms left disconnected by a broken edge list', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
    });
    // Simulate a buildEdges bug: strip every edge touching room_004. In a linear spine this
    // severs the chain, stranding room_004 and everything downstream of it — a realistic
    // shape for this kind of bug, not just a single isolated room.
    const brokenGraph = {
      ...worldGraph,
      edges: worldGraph.edges.filter((e) => e.from !== 'room_004' && e.to !== 'room_004'),
    };
    const { connected, unreachableRoomIds } = validateWorldConnectivity(brokenGraph);
    expect(connected).toBe(false);
    expect(unreachableRoomIds).toContain('room_004');
    expect(unreachableRoomIds.length).toBeGreaterThan(0);
  });
});
