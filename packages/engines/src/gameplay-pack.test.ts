import { describe, expect, it } from 'vitest';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import { buildGameplayPack } from './gameplay-pack.js';

const dna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: { title: 'Pack Slice', genre: 'Metroidvania', tone: 'dark', visualStyle: 'pixel art' },
  technical: { resolution: { width: 1920, height: 1080 }, tileSize: 16, targetPlaytimeHours: 1, difficulty: 'normal' },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 3 },
  narrative: { premise: 'Test', protagonist: 'Courier', centralConflict: 'Pour' },
  seed: 3,
  profile: 'TINY_TEST',
};

describe('buildGameplayPack', () => {
  it('emits shared rooms with pickup, gate, enemy, and victory', () => {
    const roomIds = ['room_000', 'room_001', 'room_002'];
    const pack = buildGameplayPack({
      outputDir: '/tmp/does-not-need-to-exist',
      gameDna: dna,
      worldGraph: {
        version: '0.1.0',
        seed: 3,
        nodes: [
          { id: 'room_000', type: 'room', label: 'Start', metadata: { grantsAbilities: ['dash', 'item_reactor_key'] } },
          { id: 'room_001', type: 'room', label: 'Gate', metadata: {} },
          { id: 'room_002', type: 'room', label: 'End', metadata: { archetype: 'save' } },
        ],
        edges: [
          { id: 'e1', from: 'room_000', to: 'room_001', requirements: ['dash'], optional: false, bidirectional: true },
          { id: 'e2', from: 'room_001', to: 'room_002', requirements: [], optional: false, bidirectional: true },
        ],
        regions: [{ id: 'region_0', name: 'R0', biomeId: 'biome_0', roomIds }],
      } satisfies WorldGraph,
      progressionGraph: {
        version: '0.1.0',
        seed: 3,
        startNodeId: 'room_000',
        endNodeId: 'room_002',
        nodes: [],
        edges: [],
        abilities: ['dash'],
        criticalPath: roomIds,
      } satisfies ProgressionGraph,
      roomIds,
    });
    expect(pack.rooms).toHaveLength(3);
    expect(pack.startRoomId).toBe('room_000');
    expect(pack.rooms[0]?.abilityPickup?.id).toBe('dash');
    expect(pack.rooms[0]?.abilityPickups?.map(pickup => pickup.id)).toEqual(['dash', 'item_reactor_key']);
    expect(pack.rooms[0]?.abilityPickups?.[1]?.x).toBeGreaterThan(pack.rooms[0]?.abilityPickups?.[0]?.x ?? 0);
    expect(pack.rooms.some((room) => room.gates.length > 0)).toBe(true);
    expect(pack.rooms.some((room) => room.enemy?.id)).toBe(true);
    expect(pack.rooms.some((room) => room.checkpoint)).toBe(true);
    expect(pack.rooms.some((room) => room.victory)).toBe(true);
    expect(pack.rooms[0]?.solids.length).toBeGreaterThan(0);
  });
});
