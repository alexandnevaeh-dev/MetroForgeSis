import { describe, expect, it } from 'vitest';
import {
  ABILITY_ALIAS_MAP,
  normalizeAbilityId,
  remapAbilityList,
  remapAbilityReferences,
  remapAbilityReferenceToken,
  resolveAbilityAlias,
} from './ability-remap.js';

describe('ability-remap', () => {
  it('maps wind_disc / wind_blade / gale / wind / disc to dash', () => {
    expect(resolveAbilityAlias('wind_disc')).toBe('dash');
    expect(resolveAbilityAlias('wind_blade')).toBe('dash');
    expect(resolveAbilityAlias('gale')).toBe('dash');
    expect(resolveAbilityAlias('wind')).toBe('dash');
    expect(resolveAbilityAlias('disc')).toBe('dash');
    expect(ABILITY_ALIAS_MAP.wind_disc).toBe('dash');
    expect(ABILITY_ALIAS_MAP.wind_blade).toBe('dash');
    expect(ABILITY_ALIAS_MAP.gale).toBe('dash');
  });

  it('normalizes hyphens and case', () => {
    expect(normalizeAbilityId('Wind-Disc')).toBe('wind_disc');
    expect(resolveAbilityAlias('Double-Jump')).toBe('double_jump');
    expect(resolveAbilityAlias('AIR-DASH')).toBe('air_dash');
  });

  it('keeps already-registered ids', () => {
    const result = remapAbilityList([
      { id: 'dash', name: 'Dash', category: 'movement', enabled: true },
      { id: 'grapple', name: 'Grapple', category: 'movement', enabled: false },
    ]);
    expect(result.abilities.map((a) => a.id)).toEqual(['dash', 'grapple']);
    expect(result.remapped).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('remaps synonyms, removes unknowns, and deduplicates', () => {
    const result = remapAbilityList([
      { id: 'wind_disc', name: 'Wind Disc', category: 'movement', enabled: true },
      { id: 'dash', name: 'Dash', category: 'movement', enabled: false },
      { id: 'mystery_orb', name: 'Mystery Orb', category: 'movement', enabled: true },
      { id: 'wall-jump', enabled: true },
    ]);

    expect(result.abilities.map((a) => a.id).sort()).toEqual(['dash', 'wall_jump']);
    expect(result.abilities.find((a) => a.id === 'dash')?.enabled).toBe(true);
    expect(result.abilities.find((a) => a.id === 'dash')?.name).toBe('Dash');
    expect(result.remapped).toEqual(
      expect.arrayContaining([
        { from: 'wind_disc', to: 'dash' },
        { from: 'wall-jump', to: 'wall_jump' },
      ]),
    );
    expect(result.removed).toEqual(['mystery_orb']);
    expect(result.warnings.some((w) => /mystery_orb/.test(w))).toBe(true);
    expect(result.warnings.some((w) => /Deduplicated/.test(w))).toBe(true);
  });

  it('preserves extra fields on remapped entries', () => {
    const result = remapAbilityList([{ id: 'sprint', enabled: true, unlockRoom: 'room_a' }]);
    expect(result.abilities).toHaveLength(1);
    expect(result.abilities[0]?.id).toBe('dash');
    expect(result.abilities[0]?.unlockRoom).toBe('room_a');
  });

  it('remapAbilityReferenceToken maps ids and item_ prefixes', () => {
    expect(remapAbilityReferenceToken('wind_disc')).toBe('dash');
    expect(remapAbilityReferenceToken('item_wind_disc')).toBe('item_dash');
    expect(remapAbilityReferenceToken('item-gale')).toBe('item-dash');
    expect(remapAbilityReferenceToken('dash')).toBeNull();
    expect(remapAbilityReferenceToken('Wind Disc')).toBeNull();
  });

  it('remapAbilityReferences rewrites nested reward / gate strings', () => {
    const result = remapAbilityReferences({
      grantsAbilities: ['wind_disc'],
      rewardItemId: 'wind_disc',
      dungeonItemId: 'wind_disc',
      nodes: [{ id: 'item_wind_disc', label: 'wind_disc' }],
      edges: [{ requires: ['wind_disc'], from: 'item_wind_disc' }],
      flavor: 'A Wind Disc relic',
    });
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      grantsAbilities: ['dash'],
      rewardItemId: 'dash',
      dungeonItemId: 'dash',
      nodes: [{ id: 'item_dash', label: 'dash' }],
      edges: [{ requires: ['dash'], from: 'item_dash' }],
      flavor: 'A Wind Disc relic',
    });
    expect(result.remapped.some((h) => h.from === 'wind_disc' && h.to === 'dash')).toBe(true);
  });
});
