import { describe, it, expect } from 'vitest';
import { generateWorldTopology } from '@metroforge/procedural';
import { applyWorldEditCommand, validateWorldGraph } from './world-edit.js';

describe('world edit validation', () => {
  it('accepts adding an optional treasure room', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
    });
    const sourceRoom = worldGraph.nodes.find((n) => n.type === 'room')!.id;
    const updated = applyWorldEditCommand(worldGraph, {
      type: 'add_room',
      roomId: 'room_treasure_secret',
      label: 'Hidden Cache',
      archetype: 'treasure',
      connectFromRoomId: sourceRoom,
    });
    expect(updated.nodes.some((n) => n.id === 'room_treasure_secret')).toBe(true);
    expect(validateWorldGraph(updated).valid).toBe(true);
  });

  it('rejects disconnecting the boss room from the spine', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
    });
    const bossRoom = worldGraph.nodes[worldGraph.nodes.length - 1]!.id;
    const penultimate = worldGraph.nodes[worldGraph.nodes.length - 2]!.id;
    const edgeToBoss = worldGraph.edges.find(
      (e) =>
        (e.from === penultimate && e.to === bossRoom) ||
        (e.from === bossRoom && e.to === penultimate),
    );
    expect(edgeToBoss).toBeDefined();
    expect(() =>
      applyWorldEditCommand(worldGraph, {
        type: 'disconnect_rooms',
        from: edgeToBoss!.from,
        to: edgeToBoss!.to,
      }),
    ).toThrow();
  });
});
