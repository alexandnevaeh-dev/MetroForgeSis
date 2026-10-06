import type { AssetGenerationGateway, AssetGenerationOutcome, AssetGenerationRequest } from './types.js';

/**
 * `foundry-with-legacy-fallback` routing mode: attempts Foundry first; on a fallback-eligible
 * failure (see classify-failure.ts's isFallbackEligible — never cancellation, invalid requests,
 * or policy/license rejection), retries once against the legacy gateway. Fallback is always
 * recorded on the returned outcome, never silent — a caller can tell whether an asset that
 * "succeeded" actually came from Foundry or from the legacy fallback.
 */
export class CompositeAssetGenerationGateway implements AssetGenerationGateway {
  readonly backend = 'foundry' as const;

  constructor(
    private readonly primary: AssetGenerationGateway,
    private readonly fallback: AssetGenerationGateway,
  ) {}

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationOutcome> {
    const primaryOutcome = await this.primary.generate(request);
    if (primaryOutcome.ok) return primaryOutcome;
    if (!primaryOutcome.fallbackEligible) return primaryOutcome;

    const fallbackOutcome = await this.fallback.generate(request);
    if (!fallbackOutcome.ok) {
      // Neither backend produced an asset — surface the *primary* (Foundry) failure, since that
      // is the backend this routing mode actually prefers; the legacy attempt was a courtesy.
      return primaryOutcome;
    }
    return {
      ...fallbackOutcome,
      fallbackReason: `foundry failed (${primaryOutcome.failureClass}: ${primaryOutcome.message}) — used legacy fallback`,
    };
  }
}
