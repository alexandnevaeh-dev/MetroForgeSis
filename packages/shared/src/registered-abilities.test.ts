import { describe, expect, it } from 'vitest';
import {
  isRegisteredAbilityId,
  pickRegisteredAbilities,
  assertRegisteredAbilityIds,
  REGISTERED_ABILITY_IDS,
} from './registered-abilities.js';

describe('registered-abilities', () => {
  it('never emits ability_N placeholders', () => {
    for (const profile of ['TINY_TEST', 'SMALL', 'MEDIUM', 'LARGE'] as const) {
      const abilities = pickRegisteredAbilities(profile);
      for (const a of abilities) {
        expect(a.id).not.toMatch(/^ability_/);
        expect(isRegisteredAbilityId(a.id)).toBe(true);
      }
    }
  });

  it('scales by profile', () => {
    expect(pickRegisteredAbilities('TINY_TEST')).toHaveLength(1);
    expect(pickRegisteredAbilities('SMALL')).toHaveLength(3);
    expect(pickRegisteredAbilities('MEDIUM')).toHaveLength(6);
    expect(pickRegisteredAbilities('LARGE')).toHaveLength(9);
  });

  it('assertRegisteredAbilityIds rejects unknown ids', () => {
    expect(() => assertRegisteredAbilityIds(['dash', 'ability_1'])).toThrow(/Unknown ability/);
    expect(() => assertRegisteredAbilityIds(REGISTERED_ABILITY_IDS)).not.toThrow();
  });
});
