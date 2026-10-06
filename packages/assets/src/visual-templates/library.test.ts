import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadVisualReferenceLibrary,
  resolveVisualReferenceTemplate,
  templatesForRole,
  VisualReferenceLibraryError,
} from './library.js';

// Repo root: packages/assets/src/visual-templates/../../../.. -> Forged/
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('visual reference library loader', () => {
  it('loads the real fourteenth-session library and validates every reference path exists', () => {
    const library = loadVisualReferenceLibrary(REPO_ROOT);
    expect(library.id).toBe('metroforge-reference-library-v1');
    expect(library.templates.length).toBeGreaterThan(0);
    expect(library.biomes.map((b) => b.biome)).toEqual(
      expect.arrayContaining(['foundry', 'flooded_utility', 'overgrown_reactor']),
    );
  });

  it('resolves an exact (assetRole, biome) template', () => {
    const library = loadVisualReferenceLibrary(REPO_ROOT);
    const template = resolveVisualReferenceTemplate(library, { assetRole: 'enemy_flying', biome: 'flooded_utility' });
    expect(template?.id).toBe('enemy_flying-flooded_utility');
  });

  it('returns undefined (not a guessed nearest match) for a role/biome combination with no template', () => {
    const library = loadVisualReferenceLibrary(REPO_ROOT);
    const template = resolveVisualReferenceTemplate(library, { assetRole: 'npc', biome: 'foundry' });
    expect(template).toBeUndefined();
  });

  it('templatesForRole finds one entry per biome for enemy_flying', () => {
    const library = loadVisualReferenceLibrary(REPO_ROOT);
    const flying = templatesForRole(library, 'enemy_flying');
    expect(flying).toHaveLength(3);
    expect(new Set(flying.map((t) => t.biome))).toEqual(new Set(['foundry', 'flooded_utility', 'overgrown_reactor']));
  });

  it('throws (does not manufacture a fallback) when the manifest is missing', () => {
    expect(() => loadVisualReferenceLibrary('/tmp/definitely-not-a-real-metroforge-checkout')).toThrow(
      VisualReferenceLibraryError,
    );
  });
});
