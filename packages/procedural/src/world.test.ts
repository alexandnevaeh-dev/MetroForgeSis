import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/rng.js';
import {
  generateWorldTopology,
  validateReachability,
  validateWorldConnectivity,
  validateWorldReachability,
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

describe('validateWorldReachability', () => {
  it('reaches every room from zero starting abilities via progressive pickup', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash', 'wall_jump'],
      bossCount: 1,
    });
    const { reachable, unreachableRoomIds } = validateWorldReachability(worldGraph, new Set());
    expect(reachable).toBe(true);
    expect(unreachableRoomIds).toHaveLength(0);
  });

  it('tags exactly one room per ability with grantsAbilities, matching the gate that needs it', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash', 'wall_jump'],
      bossCount: 1,
    });
    const grantRooms = worldGraph.nodes.filter(
      (n) => Array.isArray(n.metadata.grantsAbilities) && n.metadata.grantsAbilities.length > 0,
    );
    expect(grantRooms).toHaveLength(2);
    for (const room of grantRooms) {
      const ability = (room.metadata.grantsAbilities as string[])[0]!;
      const gatedEdge = worldGraph.edges.find(
        (e) => e.from === room.id && e.requirements.includes(ability),
      );
      expect(gatedEdge).toBeDefined();
    }
  });

  it('catches an ability gate whose pickup room is itself unreachable', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash', 'wall_jump'],
      bossCount: 1,
    });
    // Simulate a generation bug: the wall_jump pickup got assigned to a room, but the edges
    // leading to that room were never actually connected to the rest of the world.
    const brokenGraph = {
      ...worldGraph,
      edges: worldGraph.edges.filter((e) => e.from !== 'room_005' && e.to !== 'room_005'),
    };
    const { reachable, unreachableRoomIds } = validateWorldReachability(brokenGraph, new Set());
    expect(reachable).toBe(false);
    expect(unreachableRoomIds).toContain('room_005');
  });

  it('catches an ability gate that is unsolvable because the ability is never granted anywhere', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash', 'wall_jump'],
      bossCount: 1,
    });
    // Simulate the pickup-tagging step failing to run: no room grants wall_jump, so its gate
    // can never be crossed regardless of the room graph's connectivity.
    const brokenGraph = {
      ...worldGraph,
      nodes: worldGraph.nodes.map((n) =>
        (n.metadata.grantsAbilities as string[] | undefined)?.includes('wall_jump')
          ? { ...n, metadata: { ...n.metadata, grantsAbilities: [] } }
          : n,
      ),
    };
    const { reachable, unreachableRoomIds } = validateWorldReachability(brokenGraph, new Set());
    expect(reachable).toBe(false);
    expect(unreachableRoomIds.length).toBeGreaterThan(0);
  });
});
