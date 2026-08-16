import { describe, expect, it } from 'vitest';
import {
  isRegisteredAbilityId,
  pickRegisteredAbilities,
  assertRegisteredAbilityIds,
  assertReleaseCandidateAbilities,
  missingReleaseCandidateAbilities,
  REGISTERED_ABILITY_IDS,
} from './registered-abilities.js';

describe('registered-abilities', () => {
  it('never emits ability_N placeholders', () => {
    for (const profile of [
      'TINY_TEST',
      'VISUAL_VERTICAL_SLICE',
      'SMALL',
      'MEDIUM',
      'LARGE',
      'RELEASE_CANDIDATE',
    ] as const) {
      const abilities = pickRegisteredAbilities(profile);
      for (const a of abilities) {
        expect(a.id).not.toMatch(/^ability_/);
        expect(isRegisteredAbilityId(a.id)).toBe(true);
      }
    }
  });

  it('scales by profile', () => {
    expect(pickRegisteredAbilities('TINY_TEST')).toHaveLength(1);
    expect(pickRegisteredAbilities('VISUAL_VERTICAL_SLICE')).toHaveLength(1);
    expect(pickRegisteredAbilities('SMALL')).toHaveLength(3);
    expect(pickRegisteredAbilities('MEDIUM')).toHaveLength(6);
    expect(pickRegisteredAbilities('LARGE')).toHaveLength(9);
    expect(pickRegisteredAbilities('RELEASE_CANDIDATE')).toHaveLength(5);
  });

  it('RELEASE_CANDIDATE DNA uses air_dash, wall_*, swim, and phase', () => {
    const ids = pickRegisteredAbilities('RELEASE_CANDIDATE').map((a) => a.id);
    expect(ids).toEqual(['air_dash', 'wall_slide', 'wall_jump', 'swim', 'phase']);
    expect(() => assertReleaseCandidateAbilities(ids)).not.toThrow();
    expect(missingReleaseCandidateAbilities(['dash'])).toEqual([
      'air_dash',
      'wall_jump|wall_slide',
      'swim',
      'phase|grapple',
    ]);
  });

  it('assertRegisteredAbilityIds rejects unknown ids', () => {
    expect(() => assertRegisteredAbilityIds(['dash', 'ability_1'])).toThrow(/Unknown ability/);
    expect(() => assertRegisteredAbilityIds(REGISTERED_ABILITY_IDS)).not.toThrow();
  });
});
