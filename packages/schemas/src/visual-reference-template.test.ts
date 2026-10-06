import { describe, expect, it } from 'vitest';
import {
  VisualReferenceTemplateSchema,
  BiomeVisualTemplateSchema,
  VisualReferenceLibrarySchema,
} from './visual-reference-template.js';

function baseTemplate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'enemy_flying-foundry',
    assetRole: 'enemy_flying',
    biome: 'foundry',
    styleVersion: '1.0.0',
    referencePaths: ['enemies/flying-archetype.png'],
    dimensions: { width: 96, height: 96 },
    frameCount: 1,
    anchor: 'hover',
    facing: 'right',
    scale: 1,
    palette: ['#b95d3e', '#e39b58', '#efbd61'],
    materials: ['painted metal chassis'],
    requiredSilhouetteCues: ['central hovering body', 'two wing-fin masses', 'no legs'],
    requiredGameplayCues: ['rust base color reads as hostile'],
    allowedVariation: ['panel wear', 'thruster glow flicker pattern'],
    forbiddenChanges: ['wing placement', 'base color role (must stay enemy rust, not biome-tinted)'],
    promptRecipe: {
      promptPrefix: 'industrial sci-fi metroidvania pixel art',
      subjectTemplate: 'hovering enemy drone, {{biome}} biome dressing, rust chassis, twin wings',
      negativePrompt: 'text, letters, watermark, copyrighted character',
      estimatedTokenBudget: 40,
    },
    validationRules: ['silhouette must read with no legs visible'],
    provenance: {
      reviewer: 'claude-code:delegated-visual-qa-2026-09-07',
      qaStatus: 'QA_REVIEW',
      generatedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

describe('visual reference template schema', () => {
  it('validates a real template instance', () => {
    const parsed = VisualReferenceTemplateSchema.parse(baseTemplate());
    expect(parsed.assetRole).toBe('enemy_flying');
    expect(parsed.forbiddenChanges.length).toBeGreaterThan(0);
  });

  it('rejects a template with no forbidden changes (fixed-identity constraints must be non-empty)', () => {
    const result = VisualReferenceTemplateSchema.safeParse(baseTemplate({ forbiddenChanges: [] }));
    expect(result.success).toBe(false);
  });

  it('rejects a template with zero reference paths', () => {
    const result = VisualReferenceTemplateSchema.safeParse(baseTemplate({ referencePaths: [] }));
    expect(result.success).toBe(false);
  });

  it('accepts optional terrainAdjacency and animationPoses for the relevant roles', () => {
    const parsed = VisualReferenceTemplateSchema.parse(
      baseTemplate({
        assetRole: 'terrain',
        anchor: 'floor',
        terrainAdjacency: [{ tileRole: 'floor', adjacentTo: ['wall', 'transition'], seamRequirement: 'seamless horizontal repeat' }],
        animationPoses: [{ clip: 'idle', description: 'static tile', frameCount: 1, fps: 1, loop: false, events: {} }],
      }),
    );
    expect(parsed.terrainAdjacency?.[0]?.tileRole).toBe('floor');
    expect(parsed.animationPoses?.[0]?.clip).toBe('idle');
  });

  it('validates a biome template and a full library composing both', () => {
    const template = baseTemplate();
    const biome = BiomeVisualTemplateSchema.parse({
      biome: 'foundry',
      label: 'Foundry',
      styleVersion: '1.0.0',
      templateIds: [template.id],
      consistencyConstraints: ['actor proportions match every other biome'],
      provenance: template.provenance,
    });
    const library = VisualReferenceLibrarySchema.parse({
      id: 'metroforge-reference-library-v1',
      styleVersion: '1.0.0',
      templates: [template],
      biomes: [biome],
    });
    expect(library.templates).toHaveLength(1);
    expect(library.biomes[0]?.templateIds).toContain(template.id);
  });
});
