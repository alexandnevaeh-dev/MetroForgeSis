import { describe, expect, it } from 'vitest';
import { buildReplacementPrompt } from './prompt-builder.js';
import type { AssetReplacementPlan } from './types.js';

function plan(overrides: Partial<AssetReplacementPlan> = {}): AssetReplacementPlan {
  return {
    projectSlug: 'test-slug',
    generationId: 'gen-1',
    assetId: 'player',
    family: 'player',
    role: 'player character',
    sourceAssetPath: 'assets/characters/player.png',
    sourceAssetKind: 'procedural-production',
    references: ['/abs/assets/characters/player.png'],
    dimensions: { width: 64, height: 64 },
    transparentBackground: true,
    preserveSilhouette: true,
    preservePose: true,
    preserveScale: true,
    preserveOrientation: true,
    priority: 'P0',
    replacementStrategy: 'edit-from-procedural-base',
    ...overrides,
  };
}

describe('buildReplacementPrompt (fallback template, no VisualDNA)', () => {
  it('never emits a bare generic prompt — always carries family, dimensions, and constraints', () => {
    const prompt = buildReplacementPrompt(plan());
    expect(prompt.toLowerCase()).not.toMatch(/^generate a fantasy/);
    expect(prompt).toContain('64x64');
    expect(prompt.toLowerCase()).toContain('player character');
  });

  it('includes transparent-background clause for character families', () => {
    const prompt = buildReplacementPrompt(plan({ family: 'player', transparentBackground: true }));
    expect(prompt.toLowerCase()).toContain('transparent background');
  });

  it('includes full-frame clause (not transparency) for backgrounds', () => {
    const prompt = buildReplacementPrompt(
      plan({ family: 'background', transparentBackground: false, dimensions: { width: 640, height: 360 } }),
    );
    expect(prompt.toLowerCase()).toContain('full-frame composition');
    expect(prompt.toLowerCase()).not.toContain('transparent background');
  });

  it('includes no-text / no-UI language for environment and prop-like families', () => {
    const prompt = buildReplacementPrompt(plan({ family: 'checkpoint', transparentBackground: true }));
    expect(prompt.toLowerCase()).toContain('no readable text');
  });

  it('includes preserve-silhouette/pose/scale/orientation clauses when the plan asks for them', () => {
    const prompt = buildReplacementPrompt(plan({ preserveSilhouette: true, preservePose: true }));
    expect(prompt.toLowerCase()).toContain('preserve the original silhouette');
    expect(prompt.toLowerCase()).toContain('preserve the original pose');
  });

  it('omits preserve clauses the plan does not request (checkpoint/pickup/gate skip pose)', () => {
    const prompt = buildReplacementPrompt(
      plan({ family: 'gate', preserveSilhouette: false, preservePose: false, preserveOrientation: false }),
    );
    expect(prompt.toLowerCase()).not.toContain('preserve the original pose');
    expect(prompt.toLowerCase()).not.toContain('preserve the original silhouette');
  });

  it('strips vendor brand tokens via sanitizeImagePromptText even if they appear in context', () => {
    const prompt = buildReplacementPrompt(plan(), { gameStyleLabel: 'NVIDIA showcase style' });
    expect(prompt).not.toMatch(/\bNVIDIA\b/);
  });

  it('incorporates biome context when a BiomeVisualDNA-like context is supplied', () => {
    const prompt = buildReplacementPrompt(
      plan({ family: 'background' }),
      {
        biomeVisualDNA: {
          displayName: 'Drowned Citadel',
          atmosphere: 'damp, bioluminescent gloom',
        } as never,
      },
    );
    expect(prompt).toContain('Drowned Citadel');
  });
});
