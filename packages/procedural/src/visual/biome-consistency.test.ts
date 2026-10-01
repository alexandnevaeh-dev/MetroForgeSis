import { describe, expect, it } from 'vitest';
import {
  propAllowedInBiome,
  tileAllowedInBiome,
  filterAllowedProps,
  biomeMaterialMatches,
  minimalBiomeContextFromId,
  collectBiomeForbiddenTokens,
  type BiomeConsistencyContext,
} from './biome-consistency.js';

function stubBiome(partial: Partial<BiomeConsistencyContext> & Pick<BiomeConsistencyContext, 'biomeId' | 'displayName'>): BiomeConsistencyContext {
  return {
    forbiddenPatterns: [],
    terrainMaterials: [],
    organicMaterials: [],
    propFamilies: [],
    architecturalFamilies: [],
    foregroundLanguage: [],
    midgroundLanguage: [],
    backgroundLanguage: [],
    ...partial,
  };
}

describe('biome-consistency hard reject', () => {
  it('rejects pastoral props in foundry biomes', () => {
    const biome = stubBiome({
      biomeId: 'biome_0',
      displayName: 'Ashen Pouring Bay',
      forbiddenPatterns: ['pastoral forest'],
      propFamilies: ['crucible', 'ladle'],
    });
    expect(propAllowedInBiome('pastoral forest shrine', biome)).toBe(false);
    expect(propAllowedInBiome('pine forest vista', biome)).toBe(false);
    expect(propAllowedInBiome('crucible', biome)).toBe(true);
    expect(filterAllowedProps(['crucible', 'grass meadow', 'ladle'], biome)).toEqual(['crucible', 'ladle']);
  });

  it('hard-rejects moss tiles when biome has no organic materials', () => {
    const foundry = minimalBiomeContextFromId('biome_0', 'Ashen Pouring Bay');
    expect(tileAllowedInBiome('ground_moss', foundry)).toBe(false);
    expect(tileAllowedInBiome('ground_wear', foundry)).toBe(true);

    const overgrown = minimalBiomeContextFromId('biome_2', 'Overgrown Cooling Yards');
    expect(tileAllowedInBiome('platform_moss', overgrown)).toBe(true);
  });

  it('persists motif bans into collectBiomeForbiddenTokens', () => {
    const biome = stubBiome({
      biomeId: 'biome_0',
      displayName: 'Ashen Foundry',
      forbiddenPatterns: ['outdoor landscape photography'],
    });
    const tokens = collectBiomeForbiddenTokens(biome);
    expect(tokens.some((t) => t.includes('pastoral'))).toBe(true);
    expect(biomeMaterialMatches('pastoral forest', biome)).toBe(false);
  });
});
