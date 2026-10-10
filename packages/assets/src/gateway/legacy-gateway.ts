import { throwIfCancelled } from '@metroforge/shared';
import { validateLocalStyleAdapter, localStyleAdapterMatches } from '../local-style-adapter.js';
import type { ImageGenerator } from '../types/image-gen.js';
import type { ImageGenerationProfile } from '../types/vision.js';
import { sanitizeImagePromptText } from '../sanitize-image-prompt.js';
import { classifyFailure, isFallbackEligible } from './classify-failure.js';
import type { AssetGenerationGateway, AssetGenerationOutcome, AssetGenerationRequest } from './types.js';
import type { FoundryAssetType } from '@metroforge/schemas';

const ASSET_TYPE_TO_PROFILE: Partial<Record<FoundryAssetType, ImageGenerationProfile>> = {
  player: 'CHARACTER',
  npc: 'NPC',
  enemy: 'ENEMY',
  boss: 'BOSS',
  portrait: 'PORTRAIT',
  icon: 'ICON',
  background: 'BACKGROUND',
  tileset: 'TILE_SOURCE',
  vfx: 'VFX_TEXTURE',
  ui: 'UI_ART',
};

/**
 * Wraps a single already-resolved ImageGenerator — exactly how AssetPipeline.generate() has
 * always selected a provider (one pick for the whole run, no per-asset routing/retry/circuit
 * breaker). This class exists so that behavior is expressed once, behind the same
 * AssetGenerationGateway contract Foundry implements, instead of living inline inside
 * generateSprite — it is a faithful extraction, not a reimplementation: same request shape
 * (width/height *4 upscale request, same prompt sanitization), same single-attempt-then-fail
 * behavior. This is what 'legacy' routing mode uses, and it is the default everywhere.
 */
export class LegacyAssetGenerationGateway implements AssetGenerationGateway {
  readonly backend = 'legacy' as const;

  constructor(private readonly imageGen: ImageGenerator | null) {}

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationOutcome> {
    if (!this.imageGen) {
      return {
        ok: false,
        backend: this.backend,
        failureClass: 'provider-unavailable',
        message: 'No image provider is available',
        fallbackEligible: false,
      };
    }
    try {
      throwIfCancelled(request.signal);
      if (request.localStyleAdapter !== undefined) {
        validateLocalStyleAdapter(request.localStyleAdapter);
        if (!this.imageGen.supportsLocalStyleAdapters)
          return { ok: false, backend: this.backend, failureClass: 'unsupported-capability', message: 'Selected provider does not support local style adapters', fallbackEligible: false };
      }
      const profile: ImageGenerationProfile = request.imageProfile ?? ASSET_TYPE_TO_PROFILE[request.assetType] ?? 'CONCEPT_ART';
      const result = await this.imageGen.generateImage({
        profile,
        prompt: sanitizeImagePromptText(request.prompt),
        negativePrompt: request.negativePrompt ? sanitizeImagePromptText(request.negativePrompt) : undefined,
        width: request.sourceWidth ?? request.width * 4,
        height: request.sourceHeight ?? request.height * 4,
        seed: request.seed,
        signal: request.signal,
        conditioning: request.conditioning,
        ...(request.localStyleAdapter ? { localStyleAdapter: request.localStyleAdapter } : {}),
      });
      if (result.fallbackGenerated) throw new Error('Image provider returned a procedural placeholder');
      if (request.localStyleAdapter && !localStyleAdapterMatches(request.localStyleAdapter, result.executionMetadata?.localStyleAdapter))
        return { ok: false, backend: this.backend, failureClass: 'unsupported-capability', message: 'Selected provider did not apply the requested local style adapter', fallbackEligible: false };
      return {
        ok: true,
        backend: this.backend,
        buffer: result.image,
        provider: result.provider,
        modelId: result.modelId,
        executionMetadata: result.executionMetadata,
        qaPassed: true,
        qaScore: 70,
        fallbackDepth: 0,
      };
    } catch (err) {
      const failureClass = classifyFailure(err);
      return {
        ok: false,
        backend: this.backend,
        failureClass,
        message: err instanceof Error ? err.message : String(err),
        fallbackEligible: isFallbackEligible(failureClass),
      };
    }
  }
}
