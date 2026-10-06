/**
 * Visual asset replacement — planner/execution types.
 *
 * This is the orchestration layer the codebase didn't have yet: `NvidiaImageEditProvider`
 * (providers/nvidia-image-edit.ts), the candidate/approval state machine (asset-versioning.ts),
 * VisualDNA/BiomeVisualDNA/CharacterVisualDNA (schemas/visual-dna.ts, visual-slice.ts) and the
 * prompt compiler (procedural/visual/prompt-compiler.ts) already existed, fully built and unit
 * tested, but nothing in the actual generation pipeline ever called them — `AssetPipeline`'s
 * per-asset "try AI, else procedural" loop only ever calls `ImageGenerator.generateImage`, never
 * `ImageEditor.editImage`, and `createEditAssetVersion`/`acceptAssetVersion` had zero callers
 * outside their own tests. This module is the missing "generate baseline, then optionally
 * enhance selected assets" pass described as the product's target architecture.
 */

/** Asset families eligible for NIM-driven visual replacement. P0 families are implemented in
 *  this pass (see `PRIORITY_P0_FAMILIES` in planner.ts); P1/P2 are typed but not yet planned. */
export type VisualAssetFamily =
  | 'player'
  | 'enemy'
  | 'boss'
  | 'background'
  | 'macro-architecture'
  | 'prop'
  | 'pickup'
  | 'checkpoint'
  | 'gate'
  | 'tileset-material'
  | 'ui-icon'
  | 'portrait'
  | 'vfx-texture';

export type ReplacementStrategy =
  | 'generate-from-spec'
  | 'edit-from-procedural-base'
  | 'multi-reference-edit';

export type ReplacementPriority = 'P0' | 'P1' | 'P2';

/** Machine-checkable output properties required by a runtime visual asset. */
export type VisualOutputCapability =
  | 'full_frame_image'
  | 'transparent_sprite'
  | 'sprite_sheet'
  | 'tileset'
  | 'seamless_texture'
  | 'alpha_output'
  | 'fixed_dimensions';

export interface AssetReplacementPlan {
  projectSlug: string;
  generationId: string;
  assetId: string;
  family: VisualAssetFamily;

  /** Procedural baseline this plan may enhance. Absent for generate-from-spec families that
   *  have no baseline PNG today (checkpoint/pickup/gate render as untextured ColorRect nodes —
   *  see the "Interactive objects" honest gap in the pass report). */
  sourceAssetPath?: string;
  sourceAssetKind: 'procedural-production' | 'none';

  biomeId?: string;
  entityId?: string;
  animationState?: string;

  dimensions: { width: number; height: number };
  transparentBackground: boolean;

  preserveSilhouette: boolean;
  preservePose: boolean;
  preserveScale: boolean;
  preserveOrientation: boolean;

  priority: ReplacementPriority;
  replacementStrategy: ReplacementStrategy;

  /** The route may only invoke a provider that declares every required capability. */
  requiredCapabilities?: VisualOutputCapability[];

  /** Absolute paths to reference images (baseline + any style/master references). */
  references: string[];

  /** Free-text role used by the prompt builder (e.g. "player", "flying enemy", "final boss"). */
  role: string;
}

export type AssetOrigin =
  | 'PROCEDURAL_PRODUCTION'
  | 'AI_GENERATED_NVIDIA_NIM'
  | 'USER_PROVIDED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ACTIVE'
  | 'FALLBACK_ACTIVE';

export interface AssetReplacementOutcome {
  plan: AssetReplacementPlan;
  /** Honest, never-faked status. FALLBACK_ACTIVE means NIM was attempted and failed (or was
   *  skipped) and the procedural baseline remains the active, shipped asset. */
  origin: AssetOrigin;
  attempted: boolean;
  succeeded: boolean;
  /** Present only when `succeeded` — the candidate's asset-versioning id and path. */
  candidateAssetId?: string;
  candidatePath?: string;
  activatedPath?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  /** Present on failure/skip — never swallowed, always surfaced to the caller. */
  reason?: string;
  errorCode?: string;
  validation?: AssetValidationResult;
  /** Every provider attempted for this plan, in order, success or failure — the raw material for
   *  ProviderRunReport / the "actual enhancement manifest" the report format calls for. */
  attempts?: ProviderAttemptRecord[];
}

export interface AssetValidationResult {
  passed: boolean;
  issues: string[];
  width?: number;
  height?: number;
}

export interface VisualEnhancementSummary {
  visualMode: 'procedural-only' | 'nvidia-enhanced' | 'auto';
  attempted: number;
  enhanced: number;
  fallenBack: number;
  skipped: number;
  outcomes: AssetReplacementOutcome[];
  /** Per-provider attempt/success/failure counts for this run — the manifest §27 of the report
   *  format asks for ("asset, requested provider, requested model, result, active origin"). */
  providerReport?: ProviderRunReport[];
}

/** Multi-provider routing. One VisualAssetReplacementPipeline, many provider adapters — the
 * planner/prompt-builder/validator never see provider-specific HTTP details; only replace.ts's
 * provider-chain executor does. */
export type VisualFailureCategory =
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'BAD_RESPONSE'
  | 'INVALID_IMAGE'
  | 'UNSUPPORTED_CAPABILITY'
  | 'MODEL_UNAVAILABLE'
  | 'NETWORK'
  | 'VALIDATION_REJECTED'
  | 'UNKNOWN';

export interface VisualProviderExecutionPolicy {
  /** Hard wall-clock budget for one provider attempt on one asset — enforced by the router via
   *  Promise.race, independent of whatever internal timeout/retry the provider itself uses. This
   *  is what actually bounds a hung provider (see the Candidate 06 report: NvidiaImageProvider's
   *  own internal 180s-per-attempt x maxRetries could otherwise stall a single asset for 5-10+
   *  minutes with zero visibility). */
  requestTimeoutMs: number;
  /** Total budget across every provider attempted for one plan, including retries/fallthrough. */
  totalProviderBudgetMs: number;
  /** Attempts against a single provider before moving to the next one in the chain. */
  maxAttemptsPerProvider: number;
}

export const DEFAULT_VISUAL_PROVIDER_EXECUTION_POLICY: VisualProviderExecutionPolicy = {
  requestTimeoutMs: 45_000,
  totalProviderBudgetMs: 120_000,
  maxAttemptsPerProvider: 1,
};

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Consecutive failures before the circuit opens for this provider for the rest of the run. */
  failureThreshold: number;
  /** After this many ms in OPEN, allow one HALF_OPEN probe attempt. */
  resetAfterMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 2,
  resetAfterMs: 5 * 60_000,
};

export interface VisualProviderCandidate {
  providerId: string;
  modelId?: string;
  capability: 'IMAGE_GENERATION' | 'IMAGE_EDIT';
  editor?: import('../types/image-edit.js').ImageEditor;
  generator?: import('../types/image-gen.js').ImageGenerator;
  /** Lower runs first. NVIDIA stays first choice by default (see register order in replace.ts). */
  priority: number;
  /** Explicit provider output contract; prevents unsuitable endpoints from being invoked. */
  outputCapabilities?: VisualOutputCapability[];
}

export interface ProviderAttemptRecord {
  providerId: string;
  modelId?: string;
  succeeded: boolean;
  failureCategory?: VisualFailureCategory;
  reason?: string;
  durationMs: number;
}

export interface ProviderRunReport {
  assetId: string;
  family: VisualAssetFamily;
  attempts: ProviderAttemptRecord[];
  /** The provider that actually won activation, or undefined when everything fell back. */
  activatedProvider?: string;
  activatedModel?: string;
  origin: AssetOrigin;
}
