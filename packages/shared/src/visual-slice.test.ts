import { describe, expect, it } from 'vitest';
import {
  PROFILE_DEFAULTS,
  GENERATION_PROFILES,
  isMassVisualProfile,
  tileSizeForProfile,
} from '../src/index.js';
import { pickRegisteredAbilities } from '../src/registered-abilities.js';

describe('VISUAL_VERTICAL_SLICE profile', () => {
  it('is registered with 1 biome and 8–12 rooms', () => {
    expect(GENERATION_PROFILES).toContain('VISUAL_VERTICAL_SLICE');
    const d = PROFILE_DEFAULTS.VISUAL_VERTICAL_SLICE;
    expect(d.biomes).toBe(1);
    expect(d.roomsMin).toBeGreaterThanOrEqual(8);
    expect(d.roomsMax).toBeLessThanOrEqual(12);
    expect(d.enemies).toBeLessThanOrEqual(4);
    expect(d.bosses).toBe(1);
    expect(d.abilities).toBe(1);
  });

  it('uses one registered traversal ability and 32px tiles', () => {
    expect(pickRegisteredAbilities('VISUAL_VERTICAL_SLICE')).toHaveLength(1);
    expect(tileSizeForProfile('VISUAL_VERTICAL_SLICE')).toBe(32);
    expect(tileSizeForProfile('TINY_TEST')).toBe(16);
  });

  it('treats LARGE and RELEASE_CANDIDATE as mass visual profiles', () => {
    expect(isMassVisualProfile('LARGE')).toBe(true);
    expect(isMassVisualProfile('RELEASE_CANDIDATE')).toBe(true);
    expect(isMassVisualProfile('VISUAL_VERTICAL_SLICE')).toBe(false);
    expect(isMassVisualProfile('TINY_TEST')).toBe(false);
  });
});
