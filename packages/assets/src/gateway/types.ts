import type { FoundryAssetType } from '@metroforge/schemas';
import type { ImageConditioning, LocalStyleAdapter } from '../types/image-gen.js';
import type { ImageGenerationProfile } from '../types/vision.js';

/** Which generation backend actually produced (or attempted to produce) an asset. */
export type AssetGenerationBackendId = 'legacy' | 'foundry';

/** Production-safe migration modes for the AssetPipeline → AssetFoundry integration seam. See
 *  packages/assets/src/gateway/README semantics documented on createAssetGenerationGateway(). */
export type AssetGenerationBackend = 'legacy' | 'foundry' | 'foundry-with-legacy-fallback';

/**
 * Canonical, backend-agnostic request. AssetPipeline builds this once from its own domain state
 * (GameDNA, StyleBible, per-call SpriteSpec/prompt) and never constructs a Foundry AssetRequest
 * or calls an ImageGenerator directly — that translation lives entirely inside each gateway
 * implementation (see foundry-gateway.ts / legacy-gateway.ts).
 */
export interface AssetGenerationRequest {
  localStyleAdapter?: LocalStyleAdapter;
  id: string;
  assetType: FoundryAssetType;
  path: string;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed: number;
  visualStyle: string;
  pixelArt: boolean;
  transparentBackground: boolean;
  palette?: string[];
  /** Project/export policy — must reach provider selection, not just be recorded afterward. */
  commercialUseRequired: boolean;
  freeOnly: boolean;
  localOnly: boolean;
  maxRetries?: number;
  signal?: AbortSignal;
  /** Reference-image conditioning (e.g. identity-preserving pose edits) — legacy-only today;
   *  no Foundry AssetRequest field carries this yet, so the Foundry gateway does not use it.
   *  Preserved on the canonical request so LegacyAssetGenerationGateway stays behaviorally
   *  identical to the pre-migration inline call for every existing caller that sets it. */
  conditioning?: ImageConditioning;
  /** Explicit manual-art role and bounded inference canvas. Other callers retain legacy defaults. */
  imageProfile?: ImageGenerationProfile;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface AssetGenerationLicense {
  commercialUse: boolean;
  status: string;
  reason: string;
}

export interface AssetGenerationSuccess {
  ok: true;
  backend: AssetGenerationBackendId;
  buffer: Buffer;
  provider: string;
  modelId?: string;
  executionMetadata?: Record<string, unknown>;
  /** Foundry's own QA verdict — captured for observability/provenance. Does NOT replace
   *  AssetPipeline's existing deterministic-checks + VLM critique, which still run downstream
   *  on whatever bytes a gateway returns, exactly as they did before this integration existed. */
  qaPassed: boolean;
  qaScore: number;
  license?: AssetGenerationLicense;
  provenance?: Record<string, unknown>;
  transformations?: string[];
  fallbackDepth: number;
  fallbackReason?: string;
  cacheHit?: boolean;
}

/** Failure classes a gateway must distinguish — fallback eligibility depends on this, not on
 *  string-matching an error message (see classify-failure.ts and composite-gateway.ts). */
export type AssetGenerationFailureClass =
  | 'transient'
  | 'rate-limited'
  | 'timeout'
  | 'provider-unavailable'
  | 'circuit-open'
  | 'authentication'
  | 'authorization'
  | 'quota'
  | 'unsupported-capability'
  | 'invalid-request'
  | 'policy-rejection'
  | 'license-rejection'
  | 'generation-quality-failure'
  | 'qa-failure'
  | 'post-processing-failure'
  | 'cancelled'
  | 'unknown';

export interface AssetGenerationFailure {
  ok: false;
  backend: AssetGenerationBackendId;
  failureClass: AssetGenerationFailureClass;
  message: string;
  /** Whether a foundry-with-legacy-fallback gateway may retry this request against the legacy
   *  backend. False for cancellation, policy/license rejection, and invalid requests — falling
   *  back on those would silently violate the very constraint that caused the rejection. */
  fallbackEligible: boolean;
}

export type AssetGenerationOutcome = AssetGenerationSuccess | AssetGenerationFailure;

/** Structured diagnostics for one generation attempt (production standard §11 — observability).
 *  Never includes secrets; provider ids/scores/reasons only. */
export interface AssetGenerationDiagnostics {
  assetId: string;
  assetType: FoundryAssetType;
  backend: AssetGenerationBackendId;
  candidateProviders: string[];
  selectedProvider?: string;
  selectedModel?: string;
  fallbackOccurred: boolean;
  fallbackReason?: string;
  fallbackToLegacy?: boolean;
  fallbackToLegacyReason?: string;
  qaPassed?: boolean;
  qaScore?: number;
  commercialUse?: boolean;
  licenseStatus?: string;
  durationMs: number;
  outcome: 'success' | 'failure';
  failureClass?: AssetGenerationFailureClass;
}

export interface AssetGenerationGateway {
  readonly backend: AssetGenerationBackendId;
  generate(request: AssetGenerationRequest): Promise<AssetGenerationOutcome>;
}
