/**
 * The minimal shape LicenseRouter actually needs to classify something — deliberately narrower
 * than the full `ModelEntry` so the same classification logic can be reused for lighter
 * structures like `AIProvider`/`ModelMetadata` (packages/ai/src/types.ts) that only carry a
 * flat `commercialUse`/`license` pair, not a full catalog entry. `ModelEntry` satisfies this
 * structurally, so no adapter/cast is needed at existing call sites.
 */
export interface LicenseSubject {
  commercialUse: 'allowed' | 'restricted' | 'unknown';
  license: string;
  licenseDetail?: {
    revenueLimit?: string;
    distributionRestrictions?: string;
  };
  usageClass?: 'development_prototyping' | 'production';
}

/**
 * Five-state license classification for a model, richer than the coarse `commercialUse` field
 * (`allowed`|`restricted`|`unknown`) alone can express.
 *
 * - COMMERCIAL_SAFE — genuinely clear to use commercially, no known conditions attached.
 * - COMMERCIAL_CONDITIONAL — commercial use is allowed but subject to a real, specifically
 *   known condition (e.g. a revenue threshold) — only assigned when that condition is actually
 *   recorded in `ModelEntry.licenseDetail`, never inferred/guessed.
 * - NON_COMMERCIAL — the license explicitly restricts commercial use.
 * - RESEARCH_ONLY — a specific case of NON_COMMERCIAL where the license text itself signals a
 *   research/academic-only restriction.
 * - UNKNOWN — commercial status was never verified. Per the hard rule below, this NEVER
 *   qualifies as COMMERCIAL_SAFE — an unverified license is not the same thing as a safe one.
 */
export type LicenseStatus =
  | 'COMMERCIAL_SAFE'
  | 'COMMERCIAL_CONDITIONAL'
  | 'NON_COMMERCIAL'
  | 'RESEARCH_ONLY'
  | 'UNKNOWN';

export interface LicenseClassification {
  status: LicenseStatus;
  reason: string;
  /** Passed through for callers that want to additionally distinguish a free
   *  development/prototyping API tier from production-grade infrastructure — this is a
   *  separate axis from license/commercial-use legality (a model can be genuinely
   *  COMMERCIAL_SAFE by license while only being reachable via a rate-limited dev tier, e.g.
   *  NVIDIA NIM's free developer API) and is deliberately NOT folded into `status` itself, so
   *  it can't silently downgrade or upgrade the license classification. */
  usageClass?: 'development_prototyping' | 'production';
}

/**
 * Classifies and filters models by license/commercial-use safety. Does not replace or
 * duplicate `ModelCatalogService`'s existing `commercialAllowed` filter (packages/ai/src/
 * model-catalog.ts) — that filter only ever excludes `commercialUse === 'restricted'` and, per
 * the audit that motivated this class (docs/METROFORGE_CURRENT_BUILD.md §9), is never actually
 * invoked with an enforcing value by any real caller. LicenseRouter is the real enforcement
 * point wired into COMMERCIAL_SAFE generation-mode routing (packages/ai/src/registry.ts).
 */
export class LicenseRouter {
  classify(entry: LicenseSubject): LicenseClassification {
    const detail = entry.licenseDetail;

    if (entry.commercialUse === 'unknown') {
      return {
        status: 'UNKNOWN',
        reason: 'commercialUse was never verified for this model — never treated as commercial-safe',
        usageClass: entry.usageClass,
      };
    }

    if (entry.commercialUse === 'restricted') {
      const isResearchOnly = /research|academic|non[- ]?commercial/i.test(
        `${entry.license} ${detail?.distributionRestrictions ?? ''}`,
      );
      return {
        status: isResearchOnly ? 'RESEARCH_ONLY' : 'NON_COMMERCIAL',
        reason: `commercialUse=restricted (license: ${entry.license})`,
        usageClass: entry.usageClass,
      };
    }

    // commercialUse === 'allowed' from here on.
    if (detail?.revenueLimit) {
      return {
        status: 'COMMERCIAL_CONDITIONAL',
        reason: `commercialUse=allowed but subject to a recorded condition: ${detail.revenueLimit}`,
        usageClass: entry.usageClass,
      };
    }

    return {
      status: 'COMMERCIAL_SAFE',
      reason: `commercialUse=allowed, no recorded conditions (license: ${entry.license})`,
      usageClass: entry.usageClass,
    };
  }

  /** The strict check COMMERCIAL_SAFE generation mode enforces — only a genuine
   *  COMMERCIAL_SAFE classification passes. COMMERCIAL_CONDITIONAL, NON_COMMERCIAL,
   *  RESEARCH_ONLY, and UNKNOWN are all rejected; there is no "evaluate the condition and
   *  allow it anyway" path today, since nothing in this codebase has real enough per-condition
   *  data (e.g. actual current usage against a revenue limit) to safely auto-approve one — an
   *  unevaluable condition is rejected in strict mode, per spec. */
  isCommercialSafe(entry: LicenseSubject): boolean {
    return this.classify(entry).status === 'COMMERCIAL_SAFE';
  }

  filterCommercialSafe<T extends LicenseSubject>(entries: T[]): T[] {
    return entries.filter((e) => this.isCommercialSafe(e));
  }
}
