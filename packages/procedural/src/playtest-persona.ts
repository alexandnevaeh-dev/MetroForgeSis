import type { GenerationProfile } from '@metroforge/shared';
import type { PlaytestRoutePlan } from './playtest-route.js';

/** Bot behavior profiles for automated playtesting — distinct from graph reachability proofs. */
export type PlaytestPersonaId = 'victory_rusher' | 'ability_collector' | 'critical_path' | 'explorer';

export interface PlaytestPersona {
  id: PlaytestPersonaId;
  displayName: string;
  /** Max seconds to walk toward a transition or pickup before failing the step. */
  walkTimeoutSec: number;
  /** Max seconds spent attacking the final boss. */
  bossAttackTimeoutSec: number;
  /** When true, detour to every AbilityPickup in each room before exiting. */
  collectAllPickups: boolean;
}

export const PLAYTEST_PERSONAS: Record<PlaytestPersonaId, PlaytestPersona> = {
  victory_rusher: {
    id: 'victory_rusher',
    displayName: 'Victory Rusher',
    walkTimeoutSec: 8,
    bossAttackTimeoutSec: 12,
    collectAllPickups: true,
  },
  ability_collector: {
    id: 'ability_collector',
    displayName: 'Ability Collector',
    walkTimeoutSec: 12,
    bossAttackTimeoutSec: 14,
    collectAllPickups: true,
  },
  critical_path: {
    id: 'critical_path',
    displayName: 'Critical Path',
    walkTimeoutSec: 10,
    bossAttackTimeoutSec: 16,
    collectAllPickups: true,
  },
  explorer: {
    id: 'explorer',
    displayName: 'Explorer',
    walkTimeoutSec: 14,
    bossAttackTimeoutSec: 16,
    collectAllPickups: true,
  },
};

const PERSONA_ALIASES: Record<string, PlaytestPersonaId> = {
  VICTORY_RUSHER: 'victory_rusher',
  CRITICAL_PATH: 'critical_path',
  EXPLORER: 'explorer',
  ABILITY_COLLECTOR: 'ability_collector',
  COMPLETIONIST: 'ability_collector',
};

export type PlaytestRouteWithPersona = PlaytestRoutePlan & { persona: PlaytestPersona };

export function resolvePlaytestPersona(id?: string): PlaytestPersona {
  if (!id) return PLAYTEST_PERSONAS.victory_rusher;
  if (id in PLAYTEST_PERSONAS) {
    return PLAYTEST_PERSONAS[id as PlaytestPersonaId];
  }
  const aliased = PERSONA_ALIASES[id];
  if (aliased) return PLAYTEST_PERSONAS[aliased];
  return PLAYTEST_PERSONAS.victory_rusher;
}

/** Default persona for a profile — larger worlds get a more patient collector bot. */
export function defaultPlaytestPersonaForProfile(profile: GenerationProfile): PlaytestPersona {
  if (profile === 'RELEASE_CANDIDATE') return PLAYTEST_PERSONAS.critical_path;
  return profile === 'TINY_TEST' || profile === 'SMALL'
    ? PLAYTEST_PERSONAS.victory_rusher
    : PLAYTEST_PERSONAS.ability_collector;
}

export function attachPlaytestPersona(
  plan: PlaytestRoutePlan,
  persona?: PlaytestPersona | PlaytestPersonaId,
): PlaytestRouteWithPersona {
  const resolved =
    typeof persona === 'string'
      ? resolvePlaytestPersona(persona)
      : (persona ?? PLAYTEST_PERSONAS.victory_rusher);
  return { ...plan, persona: resolved };
}
