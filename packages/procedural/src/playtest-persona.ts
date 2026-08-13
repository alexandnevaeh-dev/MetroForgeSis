import type { PlaytestRoutePlan } from './playtest-route.js';

/** Bot behavior profiles for automated playtesting — distinct from graph reachability proofs. */
export type PlaytestPersonaId = 'victory_rusher' | 'ability_collector';

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
};

export type PlaytestRouteWithPersona = PlaytestRoutePlan & { persona: PlaytestPersona };

export function resolvePlaytestPersona(id?: string): PlaytestPersona {
  if (id && id in PLAYTEST_PERSONAS) {
    return PLAYTEST_PERSONAS[id as PlaytestPersonaId];
  }
  return PLAYTEST_PERSONAS.victory_rusher;
}

/** Default persona for a profile — larger worlds get a more patient collector bot. */
export function defaultPlaytestPersonaForProfile(
  profile: 'TINY_TEST' | 'SMALL' | 'MEDIUM' | 'LARGE',
): PlaytestPersona {
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
