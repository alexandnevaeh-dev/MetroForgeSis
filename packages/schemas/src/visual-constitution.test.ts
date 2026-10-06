import { describe, expect, it } from 'vitest';
import { VisualConstitutionSchema, visualConstitutionIsStale } from './visual-constitution.js';

describe('visual constitution', () => {
  it('validates a versioned constitution and detects stale assets', () => {
    const constitution = VisualConstitutionSchema.parse({
      id: 'constitution-test',
      version: '1.0.0',
      artDirection: 'mechanical pixel art',
      renderingStyle: 'modern-pixel',
      perspective: 'side view',
      targetResolution: { width: 320, height: 180 },
      baseSpriteScale: 1,
      tileSize: 16,
      palette: { global: ['#000000'], shadows: ['#000000'], highlights: ['#ffffff'], accents: ['#ff0000'], ui: ['#ffffff'] },
      lighting: { direction: 'left', contrast: 'high', ambient: 'soft', emissive: 'cyan' },
      language: { characters: 'clear silhouettes', environments: 'modular metal', enemies: 'angular', bosses: 'large', props: 'story-rich', ui: 'high contrast', vfx: 'bright impacts' },
      silhouetteRules: ['read at native scale'],
      materialRules: ['hard edges'],
      animationRules: ['stable feet'],
      forbiddenTraits: ['watermarks'],
      consistencyConstraints: ['shared palette'],
      provenance: { source: 'test', seed: 1, generatedAt: new Date().toISOString() },
    });
    expect(constitution.version).toBe('1.0.0');
    expect(visualConstitutionIsStale('0.9.0', constitution.version)).toBe(true);
    expect(visualConstitutionIsStale('1.0.0', constitution.version)).toBe(false);
  });
});
