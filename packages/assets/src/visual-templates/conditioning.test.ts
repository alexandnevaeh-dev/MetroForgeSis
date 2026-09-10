import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVisualReferenceLibrary, resolveVisualReferenceTemplate } from './library.js';
import { resolveConditioning } from './conditioning.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('resolveConditioning', () => {
  const library = loadVisualReferenceLibrary(REPO_ROOT);
  const template = resolveVisualReferenceTemplate(library, { assetRole: 'enemy_flying', biome: 'foundry' })!;

  it('discloses (does not attach conditioning) when no registration is given', () => {
    const result = resolveConditioning(REPO_ROOT, template, undefined);
    expect(result.conditioning).toBeUndefined();
    expect(result.disclosure).toMatch(/no provider selected/);
  });

  it('discloses when the provider does not declare reference-image support', () => {
    const result = resolveConditioning(REPO_ROOT, template, { provider: { id: 'diffusers' }, capabilities: [] });
    expect(result.conditioning).toBeUndefined();
    expect(result.disclosure).toMatch(/does not declare reference-image support/);
  });

  it('attaches real ip_adapter conditioning when supportsReferenceImages is true', () => {
    const result = resolveConditioning(REPO_ROOT, template, {
      provider: { id: 'qwen-image-edit' },
      supportsReferenceImages: true,
    });
    expect(result.disclosure).toBeUndefined();
    expect(result.conditioning?.mode).toBe('ip_adapter');
    expect(result.conditioning?.image.length).toBeGreaterThan(0);
    expect(result.conditioning?.sourceAssetId).toBe(template.id);
  });

  it('attaches conditioning when the capabilities array declares REFERENCE_IMAGE instead of the boolean flag', () => {
    const result = resolveConditioning(REPO_ROOT, template, {
      provider: { id: 'dreamo' },
      capabilities: ['REFERENCE_IMAGE', 'IDENTITY_CONDITIONING'],
    });
    expect(result.conditioning?.mode).toBe('ip_adapter');
  });
});
