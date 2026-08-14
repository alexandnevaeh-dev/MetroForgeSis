/**
 * Explicit visual-asset maturity ladder used by generation provenance + production gates.
 * PROCESSED is reserved for a future finer-grained sprite workflow (background removal / frame
 * normalization / atlas packing as distinct tracked steps) — nothing currently assigns it; do
 * not treat its presence here as evidence that step exists yet.
 */
export const ASSET_MATURITY_LEVELS = [
  'PLACEHOLDER',
  'BLOCKOUT',
  'GENERATED_SOURCE',
  'PROCESSED',
  'COMPILED',
  'QA_REVIEW',
  'PRODUCTION_READY',
  'REJECTED',
] as const;

export type AssetMaturity = (typeof ASSET_MATURITY_LEVELS)[number];

export const ASSET_SOURCE_TYPES = [
  'ai_generated',
  'procedural',
  'checkpoint',
  'manual',
  'compiled',
  'unknown',
] as const;

export type AssetSourceType = (typeof ASSET_SOURCE_TYPES)[number];

export interface AssetMaturityFields {
  maturity: AssetMaturity;
  productionReady: boolean;
  sourceType: AssetSourceType;
}

/** Maturity levels that must never silently count as production-ready art. */
export const NON_PRODUCTION_MATURITIES: ReadonlySet<AssetMaturity> = new Set([
  'PLACEHOLDER',
  'BLOCKOUT',
  'REJECTED',
]);

export function isNonProductionMaturity(maturity: AssetMaturity | string | undefined | null): boolean {
  if (!maturity) return false;
  return NON_PRODUCTION_MATURITIES.has(maturity as AssetMaturity);
}

/**
 * Strict VLMs often return passed:false with a still-usable score (e.g. 80). Soft-pass so
 * successful remote generations land QA_REVIEW / GENERATED_SOURCE instead of REJECTED.
 * Hard reject only when score is missing/low or the image failed deterministic checks upstream.
 */
export const CRITIQUE_SOFT_PASS_SCORE = 70;

/**
 * A critique score at or above this bar is high enough confidence to promote past QA_REVIEW to
 * PRODUCTION_READY outright, rather than waiting on a human look. Deliberately well above the
 * soft-pass bar (70) — QA_REVIEW is for "usable but unconfirmed," PRODUCTION_READY is for
 * "the critic is confident this doesn't need a human to check."
 */
export const PRODUCTION_READY_SCORE = 85;

/** True when critique explicitly passed, or score meets the soft-pass threshold. */
export function critiqueEffectivelyPassed(
  passed: boolean | undefined,
  score?: number,
): boolean {
  if (passed === true) return true;
  if (typeof score === 'number' && score >= CRITIQUE_SOFT_PASS_SCORE) return true;
  return false;
}

/**
 * Infer maturity from how an asset was produced. Procedural / test / fallback art is always
 * PLACEHOLDER (never PRODUCTION_READY). Real image-provider output starts as GENERATED_SOURCE
 * and promotes to QA_REVIEW when critique passes or soft-passes on score, or all the way to
 * PRODUCTION_READY when critique passes with high confidence (score >= PRODUCTION_READY_SCORE).
 */
export function inferAssetMaturity(input: {
  fallbackGenerated?: boolean;
  provider?: string | null;
  critiquePassed?: boolean;
  critiqueScore?: number;
  sourceType?: AssetSourceType;
}): AssetMaturityFields {
  const provider = (input.provider ?? '').toLowerCase();
  const fallback = input.fallbackGenerated === true || provider === 'procedural';

  const sourceType: AssetSourceType =
    input.sourceType ??
    (fallback
      ? 'procedural'
      : provider === 'checkpoint'
        ? 'checkpoint'
        : provider === 'pixel-art-processor' || provider === 'compiled'
          ? 'compiled'
          : provider
            ? 'ai_generated'
            : 'unknown');

  if (fallback || sourceType === 'procedural') {
    return { maturity: 'PLACEHOLDER', productionReady: false, sourceType: 'procedural' };
  }

  if (input.critiquePassed === false) {
    // Soft fail: usable score → QA_REVIEW (not REJECTED). Hard fail / blank / corrupt → REJECTED.
    if (critiqueEffectivelyPassed(false, input.critiqueScore)) {
      return { maturity: 'QA_REVIEW', productionReady: false, sourceType };
    }
    return { maturity: 'REJECTED', productionReady: false, sourceType };
  }

  if (input.critiquePassed === true) {
    if (typeof input.critiqueScore === 'number' && input.critiqueScore >= PRODUCTION_READY_SCORE) {
      return { maturity: 'PRODUCTION_READY', productionReady: true, sourceType };
    }
    return { maturity: 'QA_REVIEW', productionReady: false, sourceType };
  }

  if (sourceType === 'compiled' || provider === 'checkpoint') {
    return {
      maturity: sourceType === 'compiled' ? 'COMPILED' : 'GENERATED_SOURCE',
      productionReady: false,
      sourceType,
    };
  }

  return { maturity: 'GENERATED_SOURCE', productionReady: false, sourceType };
}

/** Project may explicitly allow PLACEHOLDER/BLOCKOUT assets past the production gate. */
export function projectAllowsPlaceholders(meta: Record<string, unknown> | undefined | null): boolean {
  if (!meta) return false;
  if (meta.allowPlaceholders === true) return true;
  if (meta.placeholdersAllowed === true) return true;
  if (meta.productionAllowed === true) return true;
  const settings = meta.settings;
  if (settings && typeof settings === 'object') {
    const s = settings as Record<string, unknown>;
    if (s.allowPlaceholders === true || s.placeholdersAllowed === true) return true;
  }
  return false;
}
