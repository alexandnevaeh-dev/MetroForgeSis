import { createHash } from 'node:crypto';
import { inferAssetMaturity } from '@metroforge/shared';
import { buildAssetPlan } from './planner.js';
import { generateSourceV2, type SourceGenerationContextV2 } from './source-generation.js';
import { isolateForegroundV2, type ForegroundIsolationProvider } from './isolate.js';
import { applyManualCropRecipe, type ManualCropRecipe } from './manual-crop.js';
import { normalizeAssetV2 } from './normalize.js';
import { processAssetV2 } from './process.js';
import { compileAssetV2 } from './compile.js';
import { validateAssetV2 } from './validate.js';
import { buildGenerationSpecification, generationRequestHash } from './production-capacity.js';
import {
  ASSET_PIPELINE_V2_VERSION,
  toPipelineSummaryEntry,
  type AssetRequestV2,
  type DistinctSourceCheckV2,
  type FailedAssetV2,
  type PipelineSummaryV2,
  type RuntimeManifestEntryV2,
} from './types.js';

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export interface RunAssetPipelineV2Options extends SourceGenerationContextV2 {
  /** Pairs of asset IDs to prove used genuinely distinct source bytes (see spec §Distinct-source
   *  proof). Compared by sha256 of the SourceGeneration output, not filename inequality. */
  distinctSourcePairs?: Array<[string, string]>;
  /** In-memory completed entries from a prior partial run. Entries are reused only when their
   * immutable request, source bytes, final bytes, validation and visual-bible binding still match. */
  resumeManifest?: RuntimeManifestEntryV2[];
  productionModel?: string;
  /** Real local ML capability that turns a fully-opaque source into one with a real alpha matte
   *  (see isolate.ts). Optional and off by default — omitting it reproduces every prior run's
   *  behavior exactly (including every offline/procedural test in this repo, none of which pass
   *  one). Pass `createForegroundIsolationProvider()` (apple-native-mps-profile.ts) to actually
   *  fix subject isolation for real-provider character/prop sources. */
  foregroundIsolationProvider?: ForegroundIsolationProvider;
  /** Recorded human-selected crop recipes, keyed by assetId (see manual-crop.ts). Optional and
   *  off by default — omitting it reproduces prior behavior exactly for every asset. A recipe
   *  present for an assetId is hash-bound to one exact source and throws (failing that asset,
   *  same as any other stage error) rather than silently skipping or reinterpreting on mismatch. */
  manualCropRecipes?: Record<string, ManualCropRecipe>;
}

export interface RunAssetPipelineV2Result {
  manifest: RuntimeManifestEntryV2[];
  summary: PipelineSummaryV2;
}

/** Orchestrates AssetRequest → AssetPlan → SourceGeneration → Normalization → AssetProcessing →
 *  Compilation → Validation → maturity → RuntimeManifest for a batch of requests. A stage
 *  failure produces a FailedAssetV2 entry and that asset never reaches the manifest — it can
 *  never be promoted to any maturity, successful or otherwise. */
export async function runAssetPipelineV2(
  requests: AssetRequestV2[],
  options: RunAssetPipelineV2Options = {},
): Promise<RunAssetPipelineV2Result> {
  const manifest: RuntimeManifestEntryV2[] = [];
  const failed: FailedAssetV2[] = [];
  const sourceHashById = new Map<string, string>();

  for (const request of requests) {
    const start = Date.now();
    let stage: FailedAssetV2['stage'] = 'plan';
    let provider: string | undefined;
    let model: string | undefined;
    let generationExecutionPath: RuntimeManifestEntryV2['generationExecutionPath'] | undefined;
    let compiler: string | undefined;
    try {
      const plan = buildAssetPlan(request);

      const resumable = options.resumeManifest?.find((entry) => entry.assetId === request.id);
      if (resumable && request.allowRealProvider && request.requireRealProvider) {
        const spec = buildGenerationSpecification(request, { model: options.productionModel ?? 'sd-1.5', prompt: plan.providerPrompt, negativePrompt: plan.negativePrompt, width: plan.sourceWidth, height: plan.sourceHeight });
        const validResume = resumable.requestHash === generationRequestHash(spec)
          && resumable.sourceHash === sha256(resumable.sourceBuffer)
          && resumable.finalHash === sha256(resumable.buffer)
          && resumable.validation.passed
          && resumable.provenance?.visualBibleHash === spec.visualBibleHash
          && resumable.provenance?.visualBibleVersion === spec.visualBibleVersion;
        if (validResume) {
          manifest.push(resumable);
          sourceHashById.set(request.id, resumable.sourceHash);
          continue;
        }
      }

      stage = 'generation';
      const genStart = Date.now();
      const source = await generateSourceV2(plan, request, options);
      provider = source.provider;
      model = source.model;
      generationExecutionPath = source.executionPath;
      const genMs = Date.now() - genStart;
      sourceHashById.set(request.id, sha256(source.buffer));

      stage = 'manual_crop';
      const manualCrop = applyManualCropRecipe(source.buffer, options.manualCropRecipes?.[request.id]);

      stage = 'isolation';
      const isolation = await isolateForegroundV2(manualCrop.buffer, plan, options.foregroundIsolationProvider);

      stage = 'normalization';
      const normStart = Date.now();
      const normalized = normalizeAssetV2(isolation.buffer, plan);
      const normMs = Date.now() - normStart;

      stage = 'processing';
      const procStart = Date.now();
      const processing = processAssetV2(plan, request, normalized);
      const procMs = Date.now() - procStart;

      stage = 'compilation';
      const compStart = Date.now();
      const compilation = compileAssetV2(plan, processing);
      compiler = compilation.compiler;
      const compMs = Date.now() - compStart;

      stage = 'validation';
      const validation = validateAssetV2(plan, request, processing, compilation);

      const maturityFields = inferAssetMaturity({
        fallbackGenerated: source.fallbackGenerated,
        provider: source.provider,
        critiquePassed: validation.passed,
        critiqueScore: validation.passed ? 100 : 0,
      });

      const entry: RuntimeManifestEntryV2 = {
        pipelineVersion: ASSET_PIPELINE_V2_VERSION,
        assetId: request.id,
        category: plan.category,
        sourceAssetPath: plan.godotDestination.replace(/\.png$/, '.source.png'),
        normalizedAssetPath: plan.godotDestination.replace(/\.png$/, '.normalized.png'),
        compiledAssetPath: plan.godotDestination,
        runtimeResourcePath: compilation.godotResourcePath,
        dimensions: { width: compilation.compiledWidth, height: compilation.compiledHeight },
        animation: processing.frameCount && processing.frameCount > 1 ? {
          clip: processing.animationClip?.name ?? request.animation?.clip ?? 'default',
          frameCount: processing.frameCount,
          fps: processing.animationClip?.fps ?? processing.fps ?? 8,
          loop: processing.animationClip?.loop ?? request.animation?.loop ?? true,
        } : undefined,
        godotResourceType: compilation.godotResourceType,
        seed: request.seed,
        provider: source.provider,
        model: source.model,
        generationExecutionPath: source.executionPath,
        sourceHash: sha256(source.buffer),
        finalHash: sha256(compilation.compiledBuffer),
        requestHash: source.requestHash,
        provenance: source.provenance,
        maturity: validation.passed ? maturityFields.maturity : 'REJECTED',
        sourceType: maturityFields.sourceType,
        productionReady: validation.passed && maturityFields.productionReady,
        validation,
        timings: { generationMs: genMs, normalizationMs: normMs, processingMs: procMs, compilationMs: compMs, totalMs: Date.now() - start },
        buffer: compilation.compiledBuffer,
        sourceBuffer: source.buffer,
        normalizedBuffer: normalized.buffer,
        extraResources: compilation.extraResources,
        foregroundIsolation: { applied: isolation.applied, matteSource: isolation.matteSource, model: isolation.model, modelVersion: isolation.modelVersion, error: isolation.error },
        manualCrop: { applied: manualCrop.applied, actualSourceHash: manualCrop.actualSourceHash, recipeSourceHash: manualCrop.recipeSourceHash, cropRect: manualCrop.cropRect, recordedBy: manualCrop.recordedBy, reason: manualCrop.reason },
      };

      if (!validation.passed) {
        failed.push({
          assetId: request.id,
          category: plan.category,
          stage: 'validation',
          error: validation.ruleResults.filter((r) => !r.passed).map((r) => `${r.rule}: ${r.message ?? 'failed'}`).join('; '),
        });
        // Preserved for diagnostics, but a failed validation must never promote maturity or be
        // treated as a successful pipeline result — it still appears in `manifest` with
        // maturity REJECTED/productionReady=false so callers can tell success from failure.
      }

      manifest.push(entry);
    } catch (err) {
      failed.push({
        assetId: request.id,
        category: request.category,
        stage,
        error: err instanceof Error ? err.message : String(err),
        provider,
        model,
        generationExecutionPath,
        compiler,
      });
    }
  }

  const distinctSourceChecks: DistinctSourceCheckV2[] = (options.distinctSourcePairs ?? []).map(([a, b]) => ({
    a,
    b,
    distinct: sourceHashById.has(a) && sourceHashById.has(b) ? sourceHashById.get(a) !== sourceHashById.get(b) : false,
  }));

  const summary: PipelineSummaryV2 = {
    pipelineVersion: ASSET_PIPELINE_V2_VERSION,
    generatedAt: new Date().toISOString(),
    assets: manifest.map(toPipelineSummaryEntry),
    failed,
    distinctSourceChecks,
  };

  return { manifest, summary };
}
