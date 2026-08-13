import { describe, expect, it } from 'vitest';
import { planVictoryRoute } from './playtest-route.js';
import { generateWorldTopology } from './world.js';
import {
  attachPlaytestPersona,
  defaultPlaytestPersonaForProfile,
  resolvePlaytestPersona,
} from './playtest-persona.js';

describe('playtest persona', () => {
  it('resolvePlaytestPersona falls back to victory_rusher', () => {
    expect(resolvePlaytestPersona('not_a_persona').id).toBe('victory_rusher');
    expect(resolvePlaytestPersona('ability_collector').collectAllPickups).toBe(true);
  });

  it('attachPlaytestPersona embeds persona on the route plan', () => {
    const { worldGraph, roomIds } = generateWorldTopology({
      seed: 1,
      roomCount: 6,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
      profile: 'TINY_TEST',
    });
    const plan = planVictoryRoute(worldGraph, { victoryRoomId: roomIds.at(-1) });
    const enriched = attachPlaytestPersona(plan, 'ability_collector');
    expect(enriched.persona.id).toBe('ability_collector');
    expect(enriched.reachable).toBe(plan.reachable);
  });

  it('defaultPlaytestPersonaForProfile picks patient bot for MEDIUM+', () => {
    expect(defaultPlaytestPersonaForProfile('TINY_TEST').id).toBe('victory_rusher');
    expect(defaultPlaytestPersonaForProfile('MEDIUM').id).toBe('ability_collector');
  });
});
