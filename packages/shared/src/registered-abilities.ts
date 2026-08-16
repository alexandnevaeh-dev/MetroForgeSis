import type { GenerationProfile } from './constants.js';

/** Canonical traversal abilities with real Godot runtime implementations.
 *  The generator must never emit an ID outside this list. Order defines unlock progression. */
export const REGISTERED_ABILITIES = [
  {
    id: 'dash',
    name: 'Dash',
    category: 'movement' as const,
    inputAction: 'dash',
    displayName: 'Dash',
    description: 'Quick horizontal burst on the ground.',
  },
  {
    id: 'double_jump',
    name: 'Double Jump',
    category: 'movement' as const,
    inputAction: 'jump',
    displayName: 'Double Jump',
    description: 'Jump again while airborne.',
  },
  {
    id: 'wall_slide',
    name: 'Wall Slide',
    category: 'movement' as const,
    inputAction: 'move_up',
    displayName: 'Wall Slide',
    description: 'Slow your fall while touching a wall.',
  },
  {
    id: 'wall_jump',
    name: 'Wall Jump',
    category: 'movement' as const,
    inputAction: 'jump',
    displayName: 'Wall Jump',
    description: 'Kick off a wall to climb vertical shafts.',
  },
  {
    id: 'air_dash',
    name: 'Air Dash',
    category: 'movement' as const,
    inputAction: 'dash',
    displayName: 'Air Dash',
    description: 'Dash while airborne.',
  },
  {
    id: 'ground_slam',
    name: 'Ground Slam',
    category: 'movement' as const,
    inputAction: 'move_down',
    displayName: 'Ground Slam',
    description: 'Slam downward to break through weak floors.',
  },
  {
    id: 'grapple',
    name: 'Grapple',
    category: 'movement' as const,
    inputAction: 'jump',
    displayName: 'Grapple',
    description: 'Latch onto grapple points to cross vertical gaps.',
  },
  {
    id: 'swim',
    name: 'Swim',
    category: 'movement' as const,
    inputAction: 'move_up',
    displayName: 'Swim',
    description: 'Move freely through submerged water zones.',
  },
  {
    id: 'phase',
    name: 'Phase',
    category: 'movement' as const,
    inputAction: 'dash',
    displayName: 'Phase',
    description: 'Dash through phase barriers.',
  },
] as const;

export type RegisteredAbilityId = (typeof REGISTERED_ABILITIES)[number]['id'];

export const REGISTERED_ABILITY_IDS: RegisteredAbilityId[] = REGISTERED_ABILITIES.map((a) => a.id);

export function isRegisteredAbilityId(id: string): id is RegisteredAbilityId {
  return (REGISTERED_ABILITY_IDS as readonly string[]).includes(id);
}

/** RELEASE_CANDIDATE traversal set matching the Heart Engine prompt — all registered. */
export const RELEASE_CANDIDATE_ABILITY_IDS: RegisteredAbilityId[] = [
  'air_dash',
  'wall_slide',
  'wall_jump',
  'swim',
  'phase',
];

/** Profile-scaled ability pick — only returns IDs with runtime implementations. */
export function pickRegisteredAbilities(profile: GenerationProfile): {
  id: RegisteredAbilityId;
  name: string;
  category: string;
  enabled: boolean;
}[] {
  if (profile === 'RELEASE_CANDIDATE') {
    return RELEASE_CANDIDATE_ABILITY_IDS.map((id) => {
      const a = REGISTERED_ABILITIES.find((entry) => entry.id === id)!;
      return {
        id: a.id,
        name: a.name,
        category: a.category,
        enabled: true,
      };
    });
  }
  const counts: Record<GenerationProfile, number> = {
    TINY_TEST: 1,
    VISUAL_VERTICAL_SLICE: 1,
    SMALL: 3,
    MEDIUM: 6,
    LARGE: 9,
    RELEASE_CANDIDATE: RELEASE_CANDIDATE_ABILITY_IDS.length,
  };
  const count = Math.min(counts[profile], REGISTERED_ABILITIES.length);
  return REGISTERED_ABILITIES.slice(0, count).map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    enabled: true,
  }));
}

export function assertRegisteredAbilityIds(ids: string[]): void {
  const unknown = ids.filter((id) => !isRegisteredAbilityId(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown ability IDs (no runtime implementation): ${unknown.join(', ')}`);
  }
}

/**
 * RELEASE_CANDIDATE DNA must include air dash, a wall traversal ability, water traversal,
 * and one unusual world-interaction ability (phase or grapple).
 */
export function missingReleaseCandidateAbilities(ids: readonly string[]): string[] {
  const set = new Set(ids);
  const missing: string[] = [];
  if (!set.has('air_dash')) missing.push('air_dash');
  if (!set.has('wall_jump') && !set.has('wall_slide')) missing.push('wall_jump|wall_slide');
  if (!set.has('swim')) missing.push('swim');
  if (!set.has('phase') && !set.has('grapple')) missing.push('phase|grapple');
  return missing;
}

export function assertReleaseCandidateAbilities(ids: readonly string[]): void {
  const missing = missingReleaseCandidateAbilities(ids);
  if (missing.length > 0) {
    throw new Error(
      `RELEASE_CANDIDATE DNA is missing required registered abilities: ${missing.join(', ')}`,
    );
  }
}
