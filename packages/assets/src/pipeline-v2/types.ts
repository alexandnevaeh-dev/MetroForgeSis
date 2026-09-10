import type { AssetMaturity, AssetSourceType, GenerationMode } from '@metroforge/shared';

/** Identifies this architecture's output in metadata/manifests so v1 and v2 artifacts never
 *  get silently reinterpreted as the same thing. */
export const ASSET_PIPELINE_V2_VERSION = 'asset_pipeline_v2';

export const ASSET_CATEGORIES_V2 = [
  'player',
  'enemy',
  'boss',
  'npc',
  'environment',
  'background',
  'pickup',
  'ability_icon',
  'hud',
  'prop',
  'animated_environment',
  'vfx',
  'ui_panel',
] as const;
export type AssetCategoryV2 = (typeof ASSET_CATEGORIES_V2)[number];

/** Caller-facing request — describes WHAT is needed, not provider-specific rendering
 *  instructions. A caller asks for `player`, not for a Stable Diffusion prompt. */
export interface AssetRequestV2 {
  id: string;
  category: AssetCategoryV2;
  /** Intended runtime use, e.g. "playable character key-art + walk cycle". */
  runtimeUse: string;
  /** Free-text art direction / subject, independent of provider prompt syntax. */
  artDirection: string;
  /** Optional caller-supplied negative prompt override. Currently only honored by
   *  `worldSpritePlan()` (prop/pickup categories), which otherwise sets no negative prompt at all
   *  — see docs/audit/MODERN_COHESION_TEST_PROJECT.md's seventh session for why. Every other
   *  category still uses its own fixed negative prompt regardless of this field. */
  negativePrompt?: string;
  dimensions?: { width: number; height: number };
  animationRequired?: boolean;
  animation?: { clip: string; frameCount: 4 | 8 | 12; fps: number; loop: boolean };
  inferenceSteps?: number;
  scheduler?: string;
  guidance?: number;
  visualBibleVersion?: string;
  visualBibleHash?: string;
  transparencyRequired?: boolean;
  seed: number;
  variant?: string;
  context?: string;
  targetEngine?: 'godot';
  project?: { biome?: string; theme?: string };
  mode?: GenerationMode;
  /** Category-disambiguating flags — an NPC must never accidentally carry these. */
  hostile?: boolean;
  isFinalBoss?: boolean;
  attacks?: string[];
  /** Set true to actually consult the real provider registry for SourceGeneration instead of
   *  going straight to the deterministic procedural generator. Off by default so unit tests and
   *  environments without configured providers stay fast and offline. */
  allowRealProvider?: boolean;
  /** Fail the generation stage instead of degrading to procedural output when the selected
   * provider is unavailable or errors. Used by controlled production evidence runs. */
  requireRealProvider?: boolean;
}

export type NormalizationOpId =
  | 'format_normalize'
  | 'alpha_cleanup'
  | 'deterministic_resize'
  | 'padding'
  | 'cropping'
  | 'sprite_alignment'
  | 'canvas_normalize'
  | 'tile_grid_align'
  | 'icon_framing';

export type CompilationStrategyV2 =
  | 'character_sheet'
  | 'ui_icon'
  | 'ui_hud'
  | 'background_plate'
  | 'tileset_atlas'
  | 'world_sprite';
  

export type GodotResourceTypeV2 = 'Texture2D' | 'SpriteFrames' | 'TileSet';

/** The explicit plan/contract converting an AssetRequest into concrete pipeline behavior.
 *  Category-specific decisions belong here, not scattered through later stages. */
export interface AssetPlanV2 {
  requestId: string;
  category: AssetCategoryV2;
  generationMode: 'procedural' | 'provider';
  sourceWidth: number;
  sourceHeight: number;
  finalWidth: number;
  finalHeight: number;
  providerPrompt: string;
  negativePrompt?: string;
  /** Explicit, category-aware silhouette outline color (see pixel-art-processor.ts's
   *  `addSilhouetteOutline`). Undefined for every category except where a plan function sets it
   *  explicitly — no default outline is ever applied silently. */
  outlineColor?: [number, number, number];
  transparency: 'required' | 'opaque' | 'gradient_preserve';
  normalizationOps: NormalizationOpId[];
  animationStrategy: 'none' | 'sheet_4' | 'sheet_8' | 'sheet_12';
  compilationStrategy: CompilationStrategyV2;
  godotDestination: string;
  godotResourceType: GodotResourceTypeV2;
  metadataContract: string[];
  validationRuleIds: string[];
}

export type GenerationExecutionPath = 'direct_openvino_persistent' | 'apple_native_mps' | 'provider_remote' | 'procedural_fallback';

export interface SourceGenerationResultV2 {
  buffer: Buffer;
  provider: string;
  model?: string;
  fallbackGenerated: boolean;
  executionPath: GenerationExecutionPath;
  requestHash?: string;
  provenance?: { backendType: 'local'|'remote'; backendId: string; device?: string; durationMs: number; timestamp: string; visualBibleVersion?: string; visualBibleHash?: string; effectiveParameters: Record<string,unknown>; executionMetadata?: Record<string,unknown> };
}

export interface ManualCropInfoV2 {
  applied: boolean;
  actualSourceHash: string;
  recipeSourceHash?: string;
  cropRect?: { x0: number; y0: number; x1: number; y1: number };
  recordedBy?: string;
  reason?: string;
}

export interface ForegroundIsolationInfoV2 {
  applied: boolean;
  matteSource: 'skipped_category' | 'existing_alpha' | 'segmentation_model' | 'unavailable_fallback';
  model?: string;
  modelVersion?: string;
  error?: string;
}

export interface NormalizationResultV2 {
  buffer: Buffer;
  width: number;
  height: number;
  opsApplied: NormalizationOpId[];
}

export interface ProcessingResultV2 {
  buffer: Buffer;
  frames?: Array<{ label: string; buffer: Buffer }>;
  frameCount?: number;
  fps?: number;
  processor: 'character' | 'ui' | 'background' | 'environment' | 'prop_pickup' | 'animated_environment' | 'vfx';
  animationClip?: { name: string; frameCount: number; fps: number; loop: boolean };
}

export interface ExtraResourceV2 {
  path: string;
  contents: Buffer;
}

export interface CompilationResultV2 {
  compiledBuffer: Buffer;
  compiledWidth: number;
  compiledHeight: number;
  godotResourcePath: string;
  godotResourceType: GodotResourceTypeV2;
  extraResources: ExtraResourceV2[];
  compiler: string;
}

export interface ValidationRuleResultV2 {
  rule: string;
  passed: boolean;
  message?: string;
}

export interface ValidationResultV2 {
  passed: boolean;
  ruleResults: ValidationRuleResultV2[];
}

export interface StageTimingsV2 {
  generationMs: number;
  normalizationMs: number;
  processingMs: number;
  compilationMs: number;
  totalMs: number;
}

/** Final per-asset record — enough for project generation to consume the asset without knowing
 *  how it was produced. `buffer`/`extraResources` are not JSON-safe and are stripped before the
 *  artifact summary is written to disk (see toPipelineSummary). */
export interface RuntimeManifestEntryV2 {
  pipelineVersion: string;
  assetId: string;
  category: AssetCategoryV2;
  sourceAssetPath: string;
  normalizedAssetPath?: string;
  compiledAssetPath: string;
  runtimeResourcePath: string;
  dimensions: { width: number; height: number };
  animation?: { clip: string; frameCount: number; fps: number; loop: boolean };
  godotResourceType: GodotResourceTypeV2;
  seed: number;
  provider: string;
  model?: string;
  generationExecutionPath: GenerationExecutionPath;
  sourceHash: string;
  finalHash: string;
  requestHash?: string;
  provenance?: SourceGenerationResultV2['provenance'];
  maturity: AssetMaturity;
  sourceType: AssetSourceType;
  productionReady: boolean;
  validation: ValidationResultV2;
  timings: StageTimingsV2;
  buffer: Buffer;
  sourceBuffer: Buffer;
  normalizedBuffer: Buffer;
  extraResources: ExtraResourceV2[];
  foregroundIsolation?: ForegroundIsolationInfoV2;
  manualCrop?: ManualCropInfoV2;
}

export interface FailedAssetV2 {
  assetId: string;
  category: AssetCategoryV2;
  stage: 'plan' | 'generation' | 'manual_crop' | 'isolation' | 'normalization' | 'processing' | 'compilation' | 'validation';
  error: string;
  provider?: string;
  model?: string;
  generationExecutionPath?: GenerationExecutionPath;
  compiler?: string;
}

export interface PipelineSummaryEntryV2 {
  id: string;
  category: AssetCategoryV2;
  pipelineVersion: string;
  seed: number;
  provider: string;
  model?: string;
  generationExecutionPath: GenerationExecutionPath;
  sourcePath: string;
  normalizedPath?: string;
  compiledPath: string;
  runtimeResourcePath: string;
  sourceHash: string;
  finalHash: string;
  requestHash?: string;
  provenance?: SourceGenerationResultV2['provenance'];
  dimensions: { width: number; height: number };
  animation?: { clip: string; frameCount: number; fps: number; loop: boolean };
  maturity: AssetMaturity;
  validationPassed: boolean;
  foregroundIsolation?: ForegroundIsolationInfoV2;
  manualCrop?: ManualCropInfoV2;
  generationTimeMs: number;
  normalizationTimeMs: number;
  processingTimeMs: number;
  compilationTimeMs: number;
  totalTimeMs: number;
}

export interface DistinctSourceCheckV2 {
  a: string;
  b: string;
  distinct: boolean;
}

export interface PipelineSummaryV2 {
  pipelineVersion: string;
  generatedAt: string;
  assets: PipelineSummaryEntryV2[];
  failed: FailedAssetV2[];
  distinctSourceChecks: DistinctSourceCheckV2[];
}

export function toPipelineSummaryEntry(entry: RuntimeManifestEntryV2): PipelineSummaryEntryV2 {
  return {
    id: entry.assetId,
    category: entry.category,
    pipelineVersion: entry.pipelineVersion,
    seed: entry.seed,
    provider: entry.provider,
    model: entry.model,
    generationExecutionPath: entry.generationExecutionPath,
    sourcePath: entry.sourceAssetPath,
    normalizedPath: entry.normalizedAssetPath,
    compiledPath: entry.compiledAssetPath,
    runtimeResourcePath: entry.runtimeResourcePath,
    sourceHash: entry.sourceHash,
    finalHash: entry.finalHash,
    requestHash: entry.requestHash,
    provenance: entry.provenance,
    dimensions: entry.dimensions,
    animation: entry.animation,
    maturity: entry.maturity,
    validationPassed: entry.validation.passed,
    foregroundIsolation: entry.foregroundIsolation,
    manualCrop: entry.manualCrop,
    generationTimeMs: entry.timings.generationMs,
    normalizationTimeMs: entry.timings.normalizationMs,
    processingTimeMs: entry.timings.processingMs,
    compilationTimeMs: entry.timings.compilationMs,
    totalTimeMs: entry.timings.totalMs,
  };
}
