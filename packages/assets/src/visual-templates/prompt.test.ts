import { describe, expect, it } from 'vitest';
import type { VisualReferenceTemplate } from '@metroforge/schemas';
import { resolveSubjectTemplate, buildTemplatePrompt, checkTemplateTokenBudget } from './prompt.js';

function template(overrides: Partial<VisualReferenceTemplate> = {}): VisualReferenceTemplate {
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
    palette: ['#b95d3e', '#e39b58'],
    materials: [],
    requiredSilhouetteCues: [],
    requiredGameplayCues: [],
    allowedVariation: [],
    forbiddenChanges: ['wing placement'],
    promptRecipe: {
      promptPrefix: 'industrial sci-fi metroidvania pixel art',
      subjectTemplate: 'hovering enemy drone, {{biome}} biome dressing, {{role}} silhouette',
      negativePrompt: 'text, letters, watermark',
      estimatedTokenBudget: 40,
    },
    validationRules: [],
    provenance: { reviewer: 'test', qaStatus: 'QA_REVIEW', generatedAt: new Date().toISOString() },
    ...overrides,
  } as VisualReferenceTemplate;
}

describe('resolveSubjectTemplate', () => {
  it('substitutes {{biome}} and {{role}} placeholders', () => {
    const subject = resolveSubjectTemplate(template());
    expect(subject).toBe('hovering enemy drone, foundry biome dressing, enemy_flying silhouette');
  });

  it('leaves an unrecognized placeholder untouched rather than dropping it silently', () => {
    const subject = resolveSubjectTemplate(
      template({ promptRecipe: { ...template().promptRecipe, subjectTemplate: 'a {{typo}} thing' } }),
    );
    expect(subject).toBe('a {{typo}} thing');
  });
});

describe('buildTemplatePrompt', () => {
  it('composes prefix + subject into a single sanitized prompt, with the negative prompt separate', () => {
    const { prompt, negativePrompt } = buildTemplatePrompt(template());
    expect(prompt).toContain('industrial sci-fi metroidvania pixel art');
    expect(prompt).toContain('hovering enemy drone');
    expect(prompt).toContain('foundry');
    expect(negativePrompt).toContain('text, letters, watermark');
  });

  it('folds in a StyleBible when provided', () => {
    const styleBible = {
      styleId: 's1',
      renderingStyle: 'manually authored articulated pixel geometry',
      pixelResolution: 128,
      palette: [],
      outlineRules: '1px dark contour',
      lighting: 'upper-left cool key light',
      materials: 'beveled steel',
      characterScale: '3-head',
      spritePerspective: 'side-view',
      environmentDensity: 'modular',
      VFXStyle: 'flat',
      UIStyle: 'flat',
      promptPrefixes: {},
      negativePrompts: ['copyrighted character'],
    };
    const { prompt, negativePrompt } = buildTemplatePrompt(template(), { styleBible });
    expect(prompt).toContain('manually authored articulated pixel geometry');
    expect(prompt).toContain('upper-left cool key light');
    expect(negativePrompt).toContain('copyrighted character');
  });
});

describe('checkTemplateTokenBudget', () => {
  it('marks a short prompt within budget using the heuristic estimator when no real tokenizer is passed', async () => {
    const result = await checkTemplateTokenBudget('a short prompt', 'negative');
    expect(result.estimated).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.overflow).toBe(false);
  });

  it('flags overflow on a very long prompt via the heuristic estimator', async () => {
    const longPrompt = 'word '.repeat(200);
    const result = await checkTemplateTokenBudget(longPrompt, '');
    expect(result.estimated).toBe(true);
    expect(result.overflow).toBe(true);
    expect(result.overflowBy).toBeGreaterThan(0);
  });

  it('uses the real checker when one is provided, and reports estimated: false', async () => {
    const checker = {
      checkPromptBudget: async () => ({
        positive: { tokenCount: 30, maxTokens: 77, overflow: false, overflowBy: 0 },
        anyOverflow: false,
      }),
    };
    const result = await checkTemplateTokenBudget('anything', '', checker);
    expect(result.estimated).toBe(false);
    expect(result.tokenCount).toBe(30);
    expect(result.ok).toBe(true);
  });
});
