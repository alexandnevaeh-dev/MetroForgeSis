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
  'miniboss',
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

/** Visual slice: legacy 10-room reference ordering, kept for docs/tests. Real assignment below
 * scales to whatever roomCount the profile actually requests (roomsMin/roomsMax can exceed 10). */
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

/** Rotating pool used to fill visual-slice rooms beyond the fixed tutorial/ability/boss anchors —
 * every entry is a real, distinct archetype so no room silently falls back to 'combat' just
 * because the room count exceeds the historical 10-room slice. Ordered so a 10-room slice
 * reproduces the original curated sequence exactly (traversal, combat, challenge, npc, secret,
 * save at indices 1-4/7-8); rooms 12-15 draw on the extra entries for more variety. */
// 'arena' deliberately excluded: it can roll a dash-gated pit (tile-layout.ts pitEligible) that,
// combined with a right-edge door, broke the playtest bot's transition-approach path the first
// time a visual slice actually exercised that combination (Candidate 05 investigation) — a
// pre-existing gap in the pit/door interaction, not something safe to paper over in this pass.
const VISUAL_SLICE_FILLER_POOL = [
  'traversal',
  'combat',
  'challenge',
  'npc',
  'secret',
  'save',
  'combat',
  'set_piece',
  'treasure',
  'puzzle',
] as const;

/**
 * Visual slice archetypes, computed for the *actual* roomCount (12-15, not a fixed 10).
 * tutorial is always first, boss is always the true last room, and the ability shrine/gate land
 * on whatever indices abilityGateRoomIndex() computes for this roomCount — the same formula
 * world.ts uses to decide which room grants the ability — so the tag always matches where the
 * real pickup/gate end up, at any room count in range, not just the historical 10.
 */
function assignVisualSliceArchetypes(options: AssignRoomArchetypesOptions): string[] {
  const n = options.roomCount;
  const tags = new Array<string>(n);
  const bossIdx = n - 1;
  tags[0] = 'tutorial';
  if (bossIdx > 0) tags[bossIdx] = 'boss';
  const abilityCount = Math.max(1, options.abilityCount);
  const gateIdx = abilityGateRoomIndex(0, abilityCount, n);
  const postIdx = Math.min(gateIdx + 1, n - 1);
  if (gateIdx > 0 && gateIdx < bossIdx) tags[gateIdx] = 'ability_shrine';
  if (postIdx > 0 && postIdx < bossIdx && !tags[postIdx]) tags[postIdx] = 'ability_gate';
  let poolIdx = 0;
  for (let i = 1; i < bossIdx; i++) {
    if (tags[i]) continue;
    tags[i] = VISUAL_SLICE_FILLER_POOL[poolIdx % VISUAL_SLICE_FILLER_POOL.length]!;
    poolIdx++;
  }
  return tags;
}

/** Deterministic + seeded archetype tags for every room in the world graph. */
export function assignRoomArchetypes(options: AssignRoomArchetypesOptions): string[] {
  const rng = new SeededRNG(options.seed + 7919);
  if (options.profile === 'VISUAL_VERTICAL_SLICE') {
    return assignVisualSliceArchetypes(options);
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
    if (i === options.roomCount - 2 && options.roomCount >= 8) {
      archetypes.push('miniboss');
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
  // Small worlds may never reach an unreserved seventh room. Reserve a checkpoint
  // from an ordinary interior encounter without replacing progression or story roles.
  if (!archetypes.includes('save')) {
    const replaceable = new Set<string>(['connector', 'traversal', 'combat', 'arena', 'puzzle', 'secret', 'challenge', 'set_piece', 'treasure']);
    for (let i = archetypes.length - 2; i > 0; i--) {
      if (replaceable.has(archetypes[i]!)) {
        archetypes[i] = 'save';
        break;
      }
    }
  }
  return archetypes;
}

export function npcCountForProfile(profile: GenerationProfile | undefined): number {
  return PROFILE_DEFAULTS[profile ?? 'SMALL'].npcs;
}
