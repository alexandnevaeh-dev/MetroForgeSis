import { describe, it, expect } from 'vitest';
import { GenreDefinitionSchema } from '../src/genre.js';
import { GENRE_DEFINITIONS } from '@metroforge/shared';

describe('GenreDefinitionSchema', () => {
  it('accepts both registered genre definitions from shared', () => {
    for (const def of Object.values(GENRE_DEFINITIONS)) {
      const parsed = GenreDefinitionSchema.safeParse(def);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });
});
