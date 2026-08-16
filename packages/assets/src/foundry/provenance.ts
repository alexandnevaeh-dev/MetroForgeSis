import type { AssetRequest, AssetProvenance } from '@metroforge/schemas';
import type { AssetLicenseDecision } from './license.js';
import { hashPrompt } from './prompts.js';

export function buildProvenance(input: {
  request: AssetRequest;
  sourceType: AssetProvenance['sourceType'];
  provider: string;
  model?: string;
  license: AssetLicenseDecision;
  transformations: string[];
  qaScore?: number;
  cacheHit?: boolean;
  originalUrl?: string;
  creator?: string;
}): AssetProvenance {
  return {
    assetId: input.request.id,
    sourceType: input.sourceType,
    provider: input.provider,
    model: input.model,
    generationTimestamp: new Date().toISOString(),
    promptHash: hashPrompt(input.request.prompt, input.request.negativePrompt),
    license: input.license.reason,
    commercialUse: input.license.commercialUse,
    licenseStatus: input.license.status,
    originalUrl: input.originalUrl,
    creator: input.creator,
    attribution: input.license.attribution,
    modified: input.transformations.length > 0,
    transformations: input.transformations,
    qaScore: input.qaScore,
    cacheHit: input.cacheHit,
  };
}
