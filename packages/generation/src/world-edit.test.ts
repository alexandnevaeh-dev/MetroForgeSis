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

  it('duplicates a leaf room and keeps the graph valid', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
    });
    const sourceRoom = worldGraph.nodes.find((n) => n.type === 'room')!.id;
    const updated = applyWorldEditCommand(worldGraph, {
      type: 'duplicate_room',
      roomId: sourceRoom,
      newRoomId: 'room_copy_test',
      label: 'Copied Chamber',
    });
    expect(updated.nodes.some((n) => n.id === 'room_copy_test')).toBe(true);
    expect(updated.edges.some((e) => e.from === sourceRoom && e.to === 'room_copy_test')).toBe(true);
    expect(validateWorldGraph(updated).valid).toBe(true);
  });

  it('moves a room by writing metadata coordinates without breaking connectivity', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
    });
    const sourceRoom = worldGraph.nodes.find((n) => n.type === 'room')!.id;
    const updated = applyWorldEditCommand(worldGraph, {
      type: 'move_room',
      roomId: sourceRoom,
      x: 4,
      y: 2,
    });
    expect(updated.nodes.find((n) => n.id === sourceRoom)?.metadata?.x).toBe(4);
    expect(updated.nodes.find((n) => n.id === sourceRoom)?.metadata?.y).toBe(2);
    expect(validateWorldGraph(updated).valid).toBe(true);
  });

  it('removes an optional duplicated room', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
    });
    const sourceRoom = worldGraph.nodes.find((n) => n.type === 'room')!.id;
    const withCopy = applyWorldEditCommand(worldGraph, {
      type: 'duplicate_room',
      roomId: sourceRoom,
      newRoomId: 'room_copy_remove',
    });
    const removed = applyWorldEditCommand(withCopy, {
      type: 'remove_room',
      roomId: 'room_copy_remove',
    });
    expect(removed.nodes.some((n) => n.id === 'room_copy_remove')).toBe(false);
    expect(validateWorldGraph(removed).valid).toBe(true);
  });
});
