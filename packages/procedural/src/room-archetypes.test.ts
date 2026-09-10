import { describe, it, expect } from 'vitest';
import {
  assignRoomArchetypes,
  abilityGateRoomIndex,
  npcRoomIndex,
  PROCEDURAL_ARCHETYPE_POOL,
} from './room-archetypes.js';

describe('assignRoomArchetypes', () => {
  it('tags tutorial, boss, ability shrines, and npc rooms deterministically', () => {
    const archetypes = assignRoomArchetypes({
      roomCount: 8,
      abilityCount: 2,
      npcCount: 1,
      biomeCount: 1,
      seed: 42,
    });

    expect(archetypes[0]).toBe('tutorial');
    expect(archetypes[7]).toBe('boss');
    expect(archetypes[abilityGateRoomIndex(0, 2, 8)]).toBe('ability_shrine');
    expect(archetypes[abilityGateRoomIndex(1, 2, 8)]).toBe('ability_shrine');
    expect(archetypes[1 + npcRoomIndex(0, 1, 6)]).toBe('npc');
  });

  it('uses transition archetypes at biome boundaries for medium worlds', () => {
    const archetypes = assignRoomArchetypes({
      roomCount: 30,
      abilityCount: 4,
      npcCount: 4,
      biomeCount: 3,
      seed: 1,
    });
    expect(archetypes).toContain('transition');
  });

  it('includes puzzle, secret, challenge, arena, and set_piece in larger worlds', () => {
    const archetypes = assignRoomArchetypes({
      roomCount: 40,
      abilityCount: 4,
      npcCount: 4,
      biomeCount: 3,
      seed: 99,
    });
    const featured = ['puzzle', 'secret', 'challenge', 'arena', 'set_piece', 'miniboss'];
    for (const tag of featured) {
      expect(archetypes).toContain(tag);
    }
  });

  it('only emits schema-valid procedural pool picks', () => {
    const archetypes = assignRoomArchetypes({
      roomCount: 50,
      abilityCount: 4,
      npcCount: 4,
      biomeCount: 3,
      seed: 7,
    });
    const allowed = new Set([
      'tutorial',
      'boss',
      'ability_shrine',
      'ability_gate',
      'npc',
      'save',
      'treasure',
      'transition',
      'puzzle',
      'secret',
      'challenge',
      'arena',
      'set_piece',
      ...PROCEDURAL_ARCHETYPE_POOL,
    ]);
    for (const archetype of archetypes) {
      expect(allowed.has(archetype)).toBe(true);
    }
  });

  it('locks VISUAL_VERTICAL_SLICE to the ten purpose-built rooms', () => {
    const archetypes = assignRoomArchetypes({
      roomCount: 10,
      abilityCount: 1,
      npcCount: 1,
      biomeCount: 1,
      seed: 1,
      profile: 'VISUAL_VERTICAL_SLICE',
    });
    expect(archetypes).toEqual([
      'tutorial',
      'traversal',
      'combat',
      'challenge',
      'npc',
      'ability_shrine',
      'ability_gate',
      'secret',
      'save',
      'boss',
    ]);
    expect(archetypes[abilityGateRoomIndex(0, 1, 10)]).toBe('ability_shrine');
  });

  it('scales VISUAL_VERTICAL_SLICE past 10 rooms without any room falling back to undefined/combat', () => {
    // Regression: PROFILE_DEFAULTS.VISUAL_VERTICAL_SLICE requests 12-15 rooms, but the archetype
    // list used to be a fixed 10-entry array — rooms past index 9 got `archetype: undefined` in
    // the world graph, which fell back to 'combat' for geometry while a separate isBossRoom check
    // still published the true last room as 'boss', producing a boss room composed as a generic
    // combat room (BOSS_ROOM_GENERIC). Every room must now get a real, defined archetype tag, and
    // the true last room must always be the one tagged 'boss'.
    for (const roomCount of [12, 13, 14, 15]) {
      const archetypes = assignRoomArchetypes({
        roomCount,
        abilityCount: 1,
        npcCount: 1,
        biomeCount: 3,
        seed: 184729,
        profile: 'VISUAL_VERTICAL_SLICE',
      });
      expect(archetypes).toHaveLength(roomCount);
      expect(archetypes.every((a) => typeof a === 'string' && a.length > 0)).toBe(true);
      expect(archetypes[0]).toBe('tutorial');
      expect(archetypes[roomCount - 1]).toBe('boss');
      expect(archetypes.filter((a) => a === 'boss')).toHaveLength(1);
      expect(archetypes[abilityGateRoomIndex(0, 1, roomCount)]).toBe('ability_shrine');
    }
  });
});
