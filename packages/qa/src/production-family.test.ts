import { describe, expect, it } from 'vitest';
import type { VisualConstitution } from '@metroforge/schemas';
import { buildProductionAssetFamilies, productionSliceReady } from './production-family.js';

const constitution = { id: 'constitution', version: '1.0.0' } as VisualConstitution;

describe('production asset families', () => {
  it('creates all five target families and blocks placeholder members', () => {
    const families = buildProductionAssetFamilies(constitution, [
      { id: 'player', path: 'assets/characters/player.png', fallbackGenerated: true, critiquePassed: true },
    ], 424242);
    expect(families.map((family) => family.familyType)).toEqual(['player', 'enemy', 'boss', 'biome', 'tileset', 'background']);
    expect(families.find((family) => family.familyType === 'player')?.status).toBe('FAMILY_REVIEW_REQUIRED');
    expect(productionSliceReady(families)).toBe(false);
  });

  it('requires every mandatory member before a family can be production-ready', () => {
    const sourceIds = ['player', 'player_walk', 'player_attack', 'player_hurt', 'player_death'];
    const families = buildProductionAssetFamilies(constitution, sourceIds.map((id) => ({
      id,
      path: `assets/${id}.png`,
      critiquePassed: true,
      productionReady: true,
      technicalValid: true,
    })), 424242);
    const player = families.find((family) => family.familyType === 'player')!;
    expect(player.status).toBe('FAMILY_PRODUCTION_READY');
    expect(player.defects).toEqual([]);
  });
});
