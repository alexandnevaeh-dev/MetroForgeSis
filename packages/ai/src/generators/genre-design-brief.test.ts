import { describe, expect, it } from 'vitest';
import { generateGameDNA, createDeterministicGameDNA } from './game-dna.js';
import type { TextGenerationRequest } from '../types.js';

describe('genre study reaches the actual DNA provider request', () => {
  it.each(['SIDE_VIEW_METROIDVANIA', 'TOP_DOWN_ACTION_ADVENTURE'] as const)('guides %s without changing supported ability ids', async (archetype) => {
    const input = { prompt: 'An original painted haunted abbey', profile: 'TINY_TEST' as const, seed: 42, archetype };
    const fixture = createDeterministicGameDNA(input);
    let request: TextGenerationRequest | undefined;
    const result = await generateGameDNA(input, { health: 'healthy', generateText: async (value) => {
      request = value;
      return { text: JSON.stringify(fixture) };
    } });
    expect(result.source).toBe('ai');
    expect(result.dna.abilities.map(a => a.id)).toEqual(fixture.abilities.map(a => a.id));
    expect(request?.prompt).toContain(input.prompt);
    expect(request?.prompt).toContain('Preserve the requested rendering medium');
    expect(request?.prompt).toContain(archetype === 'SIDE_VIEW_METROIDVANIA' ? 'ability-gated return routes' : 'Top-down adventure');
    if (archetype === 'TOP_DOWN_ACTION_ADVENTURE') expect(request?.prompt).not.toContain('varied long halls and vertical chambers');
  });
});
