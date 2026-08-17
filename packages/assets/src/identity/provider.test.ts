import { describe, expect, it } from 'vitest';
import {
  NVIDIA_KONTEXT_CUSTOM_REFERENCE_SUPPORTED,
  capabilitiesFromRegistration,
  selectAnimationTier,
  wrapIdentityProvider,
  IdentityProviderUnavailableError,
} from './provider.js';
import { encodePng } from '../png.js';
import { buildSilhouettePng, extractPaletteJson } from './pack.js';

describe('identity-preserving image provider', () => {
  it('does not claim NVIDIA Kontext can edit custom sprites', () => {
    expect(NVIDIA_KONTEXT_CUSTOM_REFERENCE_SUPPORTED).toBe(false);
    const caps = capabilitiesFromRegistration({
      provider: { id: 'nvidia-image', checkHealth: async () => true, generateImage: async () => {
        throw new Error('unused');
      } },
      local: false,
      priority: 1,
      family: 'nvidia',
      supportsReferenceImages: true,
      capabilities: ['image-generation', 'image-editing', 'image-consistency'],
    });
    expect(caps.supportsCustomReferenceImage).toBe(false);
    expect(caps.supportsCharacterConsistency).toBe(false);
  });

  it('fails cleanly when custom reference is unsupported', async () => {
    const identity = wrapIdentityProvider(null, capabilitiesFromRegistration());
    expect(identity.supportsReferenceImage()).toBe(false);
    await expect(
      identity.generatePose({
        prompt: 'x',
        width: 64,
        height: 64,
        seed: 1,
        referenceImage: Buffer.alloc(8),
        poseName: 'idle',
        posePrompt: 'idle',
      }),
    ).rejects.toBeInstanceOf(IdentityProviderUnavailableError);
  });

  it('selects deterministic derived poses when identity AI is unavailable', () => {
    expect(selectAnimationTier({ hasSource: true, identityProviderAvailable: false })).toBe('DETERMINISTIC_DERIVED');
    expect(selectAnimationTier({ hasSource: false, identityProviderAvailable: false })).toBe('PROCEDURAL_FALLBACK');
  });

  it('builds a silhouette from source alpha', () => {
    const rgba = new Uint8Array(4 * 4);
    rgba[0] = 200;
    rgba[1] = 40;
    rgba[2] = 40;
    rgba[3] = 255;
    const png = encodePng(2, 2, rgba);
    const sil = buildSilhouettePng(png);
    expect(sil.length).toBeGreaterThan(20);
    const pal = extractPaletteJson(png, ['#ffffff']);
    expect(pal.hex.length).toBeGreaterThan(0);
  });
});
