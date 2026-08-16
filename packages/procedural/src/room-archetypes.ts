import { PROFILE_DEFAULTS, type GenerationProfile } from '@metroforge/shared';
import { SeededRNG } from './rng.js';

/** Gameplay archetypes the world generator may assign (schema-valid subset). */
export const PROCEDURAL_ARCHETYPE_POOL = [
  'connector',
  'traversal',
  'combat',
  'arena',
  'puzzle',
  'secret',
  'challenge',
  'set_piece',
  'transition',
] as const;

export type ProceduralArchetype = (typeof PROCEDURAL_ARCHETYPE_POOL)[number];

export function abilityGateRoomIndex(
  abilityIndex: number,
  abilityCount: number,
  roomCount: number,
): number {
  return Math.floor(((abilityIndex + 1) / (abilityCount + 1)) * roomCount);
}

/** Interior-room index for the Nth NPC — shared with content generation. */
export function npcRoomIndex(
  npcSlot: number,
  npcCount: number,
  interiorRoomCount: number,
): number {
  if (interiorRoomCount <= 0) return 0;
  return Math.min(
    Math.floor(((npcSlot + 1) / (npcCount + 1)) * interiorRoomCount),
    interiorRoomCount - 1,
  );
}

export function interiorRoomId(roomIds: string[], interiorIndex: number): string {
  return roomIds[1 + interiorIndex] ?? roomIds[roomIds.length - 1]!;
}

export interface AssignRoomArchetypesOptions {
  roomCount: number;
  abilityCount: number;
  npcCount: number;
  biomeCount: number;
  seed: number;
  profile?: GenerationProfile;
}

/** Visual slice: 10 purpose-built rooms. Ability shrine index must match abilityGateRoomIndex. */
export const VISUAL_SLICE_ROOM_ARCHETYPES = [
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
] as const;

/** Deterministic + seeded archetype tags for every room in the world graph. */
export function assignRoomArchetypes(options: AssignRoomArchetypesOptions): string[] {
  const rng = new SeededRNG(options.seed + 7919);
  if (options.profile === 'VISUAL_VERTICAL_SLICE') {
    return VISUAL_SLICE_ROOM_ARCHETYPES.slice(0, options.roomCount).map((tag) => tag);
  }
  const interiorCount = Math.max(0, options.roomCount - 2);

  const abilityGateIndices = new Set(
    Array.from({ length: options.abilityCount }, (_, ai) =>
      abilityGateRoomIndex(ai, options.abilityCount, options.roomCount),
    ),
  );
  const abilityPostIndices = new Set(
    Array.from({ length: options.abilityCount }, (_, ai) =>
      Math.min(
        abilityGateRoomIndex(ai, options.abilityCount, options.roomCount) + 1,
        options.roomCount - 1,
      ),
    ),
  );
  const npcRoomIndices = new Set(
    Array.from({ length: options.npcCount }, (_, i) => 1 + npcRoomIndex(i, options.npcCount, interiorCount)),
  );
  const transitionIndices = new Set<number>();
  if (options.roomCount >= 30 && options.biomeCount > 1) {
    const roomsPerBiome = Math.ceil(options.roomCount / options.biomeCount);
    for (let b = 1; b < options.biomeCount; b++) {
      transitionIndices.add(Math.min(b * roomsPerBiome, options.roomCount - 2));
    }
  }

  const archetypes: string[] = [];
  for (let i = 0; i < options.roomCount; i++) {
    if (i === 0) {
      archetypes.push('tutorial');
      continue;
    }
    if (i === options.roomCount - 1) {
      archetypes.push('boss');
      continue;
    }
    if (abilityGateIndices.has(i)) {
      archetypes.push('ability_shrine');
      continue;
    }
    if (abilityPostIndices.has(i) && !abilityGateIndices.has(i)) {
      archetypes.push('ability_gate');
      continue;
    }
    if (npcRoomIndices.has(i)) {
      archetypes.push('npc');
      continue;
    }
    if (transitionIndices.has(i)) {
      archetypes.push('transition');
      continue;
    }
    if (i % 7 === 0) {
      archetypes.push('save');
      continue;
    }
    if (i % 5 === 0) {
      archetypes.push('treasure');
      continue;
    }
    if (i % 11 === 3) {
      archetypes.push('puzzle');
      continue;
    }
    if (i % 13 === 6) {
      archetypes.push('secret');
      continue;
    }
    if (i % 9 === 4) {
      archetypes.push('challenge');
      continue;
    }
    if (i % 6 === 2) {
      archetypes.push('arena');
      continue;
    }
    if (i % 17 === 8) {
      archetypes.push('set_piece');
      continue;
    }
    archetypes.push(rng.pick([...PROCEDURAL_ARCHETYPE_POOL]));
  }
  return archetypes;
}

export function npcCountForProfile(profile: GenerationProfile | undefined): number {
  return PROFILE_DEFAULTS[profile ?? 'SMALL'].npcs;
}
