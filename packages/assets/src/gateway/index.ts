import { createAssetFoundry } from '../foundry/foundry.js';
import type { ImageProviderRegistry } from '../image-router.js';
import type { ImageGenerator } from '../types/image-gen.js';
import { LegacyAssetGenerationGateway } from './legacy-gateway.js';
import { FoundryAssetGenerationGateway } from './foundry-gateway.js';
import { CompositeAssetGenerationGateway } from './composite-gateway.js';
import type { AssetGenerationBackend, AssetGenerationGateway } from './types.js';

export * from './types.js';
export { classifyFailure, isFallbackEligible } from './classify-failure.js';
export { LegacyAssetGenerationGateway } from './legacy-gateway.js';
export { FoundryAssetGenerationGateway } from './foundry-gateway.js';
export { CompositeAssetGenerationGateway } from './composite-gateway.js';

/**
 * Resolves the AssetGenerationGateway for a given routing mode. This is the one place
 * AssetPipeline needs to call — it never constructs a gateway class directly, so adding a new
 * backend later never touches asset-pipeline.ts's call sites.
 *
 * - 'legacy' (default everywhere unless explicitly opted into): exactly today's behavior — one
 *   already-resolved ImageGenerator, no retry/circuit-breaker/scoring across providers.
 * - 'foundry': routes through AssetFoundry (capability routing, scoring, retry, circuit breaker,
 *   license classification, provenance). Failures surface honestly — no silent legacy fallback.
 * - 'foundry-with-legacy-fallback': Foundry first, legacy only on a fallback-eligible failure
 *   (see classify-failure.ts), always recorded on the outcome.
 */
export function createAssetGenerationGateway(
  backend: AssetGenerationBackend,
  context: { registry: ImageProviderRegistry; legacyImageGen: ImageGenerator | null },
): AssetGenerationGateway {
  const legacy = new LegacyAssetGenerationGateway(context.legacyImageGen);
  if (backend === 'legacy') return legacy;

  const foundry = new FoundryAssetGenerationGateway(createAssetFoundry({ registry: context.registry }));
  if (backend === 'foundry') return foundry;

  return new CompositeAssetGenerationGateway(foundry, legacy);
}
