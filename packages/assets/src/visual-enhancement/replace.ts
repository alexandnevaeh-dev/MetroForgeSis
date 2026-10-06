import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ImageEditor, ImageEditPurpose, ImageEditResult } from '../types/image-edit.js';
import type { ImageGenerator, ImageGenResult } from '../types/image-gen.js';
import type { ImageGenerationProfile } from '../types/vision.js';
import { decodePngRgba } from '../png.js';
import { NvidiaInvalidImagePayloadError } from '../providers/nvidia-image.js';
import {
  acceptAssetVersion,
  createEditAssetVersion,
  registerInitialAssetVersion,
} from '../asset-versioning.js';
import { buildReplacementPrompt, type PromptBuilderContext } from './prompt-builder.js';
import { reconcileAlpha } from './alpha-reconciliation.js';
import { VisualProviderCircuitBreaker } from './circuit-breaker.js';
import { classifyVisualFailure, isTerminalForProvider } from './failure-classifier.js';
import type {
  AssetReplacementOutcome,
  AssetReplacementPlan,
  AssetValidationResult,
  CircuitBreakerConfig,
  ProviderAttemptRecord,
  ProviderRunReport,
  VisualAssetFamily,
  VisualEnhancementSummary,
  VisualProviderCandidate,
  VisualProviderExecutionPolicy,
} from './types.js';
import { DEFAULT_VISUAL_PROVIDER_EXECUTION_POLICY } from './types.js';

export interface RunVisualEnhancementInput {
  visualMode: 'procedural-only' | 'nvidia-enhanced' | 'auto';
  plans: AssetReplacementPlan[];
  storageRoot: string;
  /** Legacy single-provider fields — still supported, wrapped into a 1-item chain when the
   *  richer editorChain/generatorChain aren't supplied. Existing callers/tests keep working
   *  unchanged. */
  editor?: ImageEditor;
  generator?: ImageGenerator;
  /** Ordered provider chains (lower priority number tried first). When present, these win over
   *  the legacy single editor/generator fields. NVIDIA stays first choice by convention — see
   *  asset-pipeline.ts's runVisualEnhancement, which builds NVIDIA before any alternate provider. */
  editorChain?: VisualProviderCandidate[];
  generatorChain?: VisualProviderCandidate[];
  executionPolicy?: VisualProviderExecutionPolicy;
  circuitBreakerConfig?: CircuitBreakerConfig;
  promptContext?: PromptBuilderContext;
  /** auto mode: skip the whole pass (not a per-plan failure) when the caller already knows every
   *  configured provider is unhealthy — avoids one health probe per plan. procedural-only never
   *  reaches this function at all (see asset-pipeline.ts's call site). */
  providerHealthy?: boolean;
  onOutcome?: (outcome: AssetReplacementOutcome) => void;
}

const FAMILY_PROFILE: Record<VisualAssetFamily, ImageGenerationProfile> = {
  player: 'CHARACTER',
  enemy: 'ENEMY',
  boss: 'BOSS',
  background: 'ENVIRONMENT',
  'macro-architecture': 'ENVIRONMENT',
  prop: 'ITEM',
  pickup: 'ITEM',
  checkpoint: 'ITEM',
  gate: 'ITEM',
  'tileset-material': 'ENVIRONMENT',
  'ui-icon': 'ICON',
  portrait: 'PORTRAIT',
  'vfx-texture': 'ITEM',
};

const FAMILY_EDIT_PURPOSE: Partial<Record<VisualAssetFamily, ImageEditPurpose>> = {
  player: 'CHARACTER_REVISION',
  enemy: 'ENEMY_VARIATION',
  boss: 'CHARACTER_REVISION',
  background: 'BACKGROUND_REVISION',
};

/** Lightweight, local class-specific validation — dimension tolerance + non-trivial pixel
 *  variance (rejects blank/near-solid output). The provider already ran its own byte-size/magic
 *  sanity check (assertValidNvidiaImageBytes in nvidia-image.ts, calibrated for raw hosted-API
 *  response sanity — a 5000-byte floor that's wrong to reapply here, since a legitimately small,
 *  well-compressed 32x32 icon can compress well under that). This is the pipeline-side visual
 *  sanity check the spec asks for ("no major artifact corruption", "correct dimensions or
 *  resizable within policy") — decode-and-inspect, not a byte-count heuristic. */
function validateCandidate(png: Buffer, plan: AssetReplacementPlan): AssetValidationResult {
  const issues: string[] = [];
  let width: number | undefined;
  let height: number | undefined;
  if (png.length === 0) {
    return { passed: false, issues: ['empty image buffer'] };
  }
  try {
    const decoded = decodePngRgba(png);
    width = decoded.width;
    height = decoded.height;
    const target = plan.dimensions;
    const widthRatio = decoded.width / target.width;
    const heightRatio = decoded.height / target.height;
    if (widthRatio < 0.25 || widthRatio > 4 || heightRatio < 0.25 || heightRatio > 4) {
      issues.push(
        `dimensions ${decoded.width}x${decoded.height} outside policy tolerance of target ${target.width}x${target.height}`,
      );
    }
    let opaque = 0;
    let minLuma = 255;
    let maxLuma = 0;
    const { rgba } = decoded;
    for (let i = 0; i < rgba.length; i += 4) {
      const a = rgba[i + 3]!;
      if (a > 8) {
        opaque++;
        const luma = 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
        if (luma < minLuma) minLuma = luma;
        if (luma > maxLuma) maxLuma = luma;
      }
    }
    const totalPixels = decoded.width * decoded.height;
    const opaqueRatio = totalPixels > 0 ? opaque / totalPixels : 0;
    if (plan.transparentBackground && opaqueRatio > 0.98) {
      issues.push('expected transparent background but candidate is fully opaque');
    }
    if (!plan.transparentBackground && opaqueRatio < 0.5) {
      issues.push(`opaque coverage too low (${(opaqueRatio * 100).toFixed(1)}%) for a background asset`);
    }
    if (opaque > 0 && maxLuma - minLuma < 6) {
      issues.push('near-solid color, no visible subject detail (likely blank/corrupt output)');
    }
  } catch (err) {
    issues.push(`PNG undecodable: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { passed: issues.length === 0, issues, width, height };
}

function resolveAbsolute(storageRoot: string, relOrAbs: string): string {
  return existsSync(relOrAbs) ? relOrAbs : join(storageRoot, ...relOrAbs.split('/'));
}

function fallbackOutcome(
  plan: AssetReplacementPlan,
  reason: string,
  attempted: boolean,
  errorCode?: string,
  attempts: ProviderAttemptRecord[] = [],
): AssetReplacementOutcome {
  return { plan, origin: 'FALLBACK_ACTIVE', attempted, succeeded: false, reason, errorCode, attempts };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function legacyChain(
  editor: ImageEditor | undefined,
  generator: ImageGenerator | undefined,
  capability: 'IMAGE_EDIT' | 'IMAGE_GENERATION',
): VisualProviderCandidate[] {
  if (capability === 'IMAGE_EDIT' && editor) {
    return [{ providerId: editor.id, capability, editor, priority: 0 }];
  }
  if (capability === 'IMAGE_GENERATION' && generator) {
    return [{ providerId: generator.id, capability, generator, priority: 0 }];
  }
  return [];
}

function resolveChain(
  input: RunVisualEnhancementInput,
  capability: 'IMAGE_EDIT' | 'IMAGE_GENERATION',
  plan: AssetReplacementPlan,
): VisualProviderCandidate[] {
  const explicit = capability === 'IMAGE_EDIT' ? input.editorChain : input.generatorChain;
  const chain = explicit && explicit.length > 0 ? explicit : legacyChain(input.editor, input.generator, capability);
  return [...chain]
    .filter((candidate) => !candidate.outputCapabilities || (plan.requiredCapabilities ?? []).every((required) => candidate.outputCapabilities!.includes(required)))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Tries each candidate in priority order, bounded by executionPolicy and gated by the shared
 * circuit breaker. Returns as soon as one candidate produces a validated, non-fallback result.
 * Every attempt (success or failure) is recorded — this is what the "actual enhancement manifest"
 * (provider, model, result, active origin, fallback reason) is built from.
 */
async function attemptChain<TResult>(
  chain: VisualProviderCandidate[],
  breaker: VisualProviderCircuitBreaker,
  policy: VisualProviderExecutionPolicy,
  invoke: (candidate: VisualProviderCandidate) => Promise<TResult>,
): Promise<{ result?: TResult; winner?: VisualProviderCandidate; attempts: ProviderAttemptRecord[] }> {
  const attempts: ProviderAttemptRecord[] = [];
  const budgetDeadline = Date.now() + policy.totalProviderBudgetMs;

  for (const candidate of chain) {
    if (Date.now() >= budgetDeadline) break;
    if (!breaker.isAvailable(candidate.providerId)) {
      attempts.push({
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        succeeded: false,
        failureCategory: 'UNKNOWN',
        reason: 'circuit open (provider failed repeatedly earlier in this run)',
        durationMs: 0,
      });
      continue;
    }

    for (let attempt = 0; attempt < policy.maxAttemptsPerProvider; attempt++) {
      if (Date.now() >= budgetDeadline) break;
      const started = Date.now();
      try {
        const result = await withTimeout(
          invoke(candidate),
          Math.min(policy.requestTimeoutMs, Math.max(1000, budgetDeadline - Date.now())),
          `${candidate.providerId} request`,
        );
        const durationMs = Date.now() - started;
        attempts.push({ providerId: candidate.providerId, modelId: candidate.modelId, succeeded: true, durationMs });
        breaker.recordSuccess(candidate.providerId);
        return { result, winner: candidate, attempts };
      } catch (err) {
        const durationMs = Date.now() - started;
        const category = classifyVisualFailure(err);
        attempts.push({
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          succeeded: false,
          failureCategory: category,
          reason: err instanceof Error ? err.message : String(err),
          durationMs,
        });
        if (isTerminalForProvider(category)) {
          // AUTH/UNSUPPORTED/MODEL_UNAVAILABLE won't succeed on retry — open the circuit
          // immediately rather than waiting for the failure-count threshold.
          breaker.recordFailure(candidate.providerId);
          breaker.recordFailure(candidate.providerId);
          break;
        }
        breaker.recordFailure(candidate.providerId);
      }
    }
  }

  return { attempts };
}

async function executeOnePlan(
  plan: AssetReplacementPlan,
  input: RunVisualEnhancementInput,
  breaker: VisualProviderCircuitBreaker,
  policy: VisualProviderExecutionPolicy,
): Promise<AssetReplacementOutcome> {
  const instruction = buildReplacementPrompt(plan, input.promptContext);

  if (plan.replacementStrategy === 'generate-from-spec') {
    const chain = resolveChain(input, 'IMAGE_GENERATION', plan);
    if (chain.length === 0) return fallbackOutcome(plan, 'No image generator configured for generate-from-spec', false);

    const { result, winner, attempts } = await attemptChain<ImageGenResult>(chain, breaker, policy, (candidate) =>
      candidate.generator!.generateImage({
        profile: FAMILY_PROFILE[plan.family],
        prompt: instruction,
        width: plan.dimensions.width,
        height: plan.dimensions.height,
      }),
    );
    if (!result || !winner) {
      const lastReason = attempts.at(-1)?.reason ?? 'every configured provider failed';
      return fallbackOutcome(plan, lastReason, attempts.length > 0, undefined, attempts);
    }
    if (result.fallbackGenerated) {
      return fallbackOutcome(
        plan,
        result.fallbackReason ?? 'provider returned a procedural fallback image',
        true,
        undefined,
        attempts,
      );
    }
    const validation = validateCandidate(result.image, plan);
    if (!validation.passed) {
      return {
        ...fallbackOutcome(plan, `validation failed: ${validation.issues.join('; ')}`, true, undefined, attempts),
        validation,
      };
    }

    const started = Date.now();
    // Candidate history always lives at its own path (non-destructive, never overwrites nothing
    // since there's no prior version of a truly-novel asset). When the plan HAS a canonical
    // baseline path (backgrounds — generate-from-spec because a background is compositional, not
    // because there's nothing to replace), activation copies the accepted bytes onto that
    // canonical Godot-referenced path too, same as the edit strategy — otherwise a successful
    // background candidate would sit at assets/generated/... with nothing ever pointing at it.
    // Truly-novel families with no baseline (checkpoint/pickup/gate) only get the candidate path.
    const outputRel = `assets/generated/${plan.family}/${plan.assetId}.png`;
    const record = registerInitialAssetVersion({
      storageRoot: input.storageRoot,
      assetId: plan.assetId,
      path: outputRel,
      operationType: 'IMAGE_GENERATION',
      provider: result.provider,
      model: result.modelId,
      seed: result.seed,
      mimeType: 'image/png',
      fileSize: result.image.length,
      nativeWidth: validation.width,
      nativeHeight: validation.height,
      status: 'PENDING',
      provenance: { instruction, family: plan.family, strategy: plan.replacementStrategy },
    });
    const outputPath = join(input.storageRoot, ...outputRel.split('/'));
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, result.image);
    const accepted = acceptAssetVersion(input.storageRoot, record.assetId);
    let activatedPath: string | undefined;
    if (accepted) {
      activatedPath = outputRel;
      if (plan.sourceAssetPath) {
        const canonicalAbsolute = join(input.storageRoot, ...plan.sourceAssetPath.split('/'));
        mkdirSync(dirname(canonicalAbsolute), { recursive: true });
        writeFileSync(canonicalAbsolute, result.image);
        activatedPath = plan.sourceAssetPath;
      }
    }

    return {
      plan,
      origin: 'AI_GENERATED_NVIDIA_NIM',
      attempted: true,
      succeeded: true,
      candidateAssetId: record.assetId,
      candidatePath: outputRel,
      activatedPath,
      provider: result.provider,
      model: result.modelId,
      durationMs: Date.now() - started,
      validation,
      attempts,
    };
  }

  // edit-from-procedural-base / multi-reference-edit
  const chain = resolveChain(input, 'IMAGE_EDIT', plan);
  if (chain.length === 0) return fallbackOutcome(plan, 'No image editor configured for edit strategy', false);
  if (!plan.sourceAssetPath || plan.references.length === 0) {
    return fallbackOutcome(plan, 'No baseline reference asset available to edit', false);
  }
  const sourceAbsolute = resolveAbsolute(input.storageRoot, plan.references[0]!);
  if (!existsSync(sourceAbsolute)) {
    return fallbackOutcome(plan, `Baseline reference asset missing on disk: ${sourceAbsolute}`, false);
  }
  const sourceBytes = readFileSync(sourceAbsolute);

  const { result, winner, attempts } = await attemptChain<ImageEditResult>(chain, breaker, policy, (candidate) =>
    candidate.editor!.editImage({
      sourceAssets: [{ assetId: plan.assetId, bytes: sourceBytes, mimeType: 'image/png' }],
      instruction,
      width: plan.dimensions.width,
      height: plan.dimensions.height,
      purpose: FAMILY_EDIT_PURPOSE[plan.family] ?? 'GENERAL_EDIT',
      metadata: { requestedChangeScope: 'style-polish', family: plan.family },
    }),
  );
  if (!result || !winner) {
    const lastReason = attempts.at(-1)?.reason ?? 'every configured provider failed';
    return fallbackOutcome(plan, lastReason, attempts.length > 0, undefined, attempts);
  }

  const image = result.images[0];
  if (!image) return fallbackOutcome(plan, 'Editor returned no image', true, undefined, attempts);

  // Alpha reconciliation: most live edit providers don't reliably honor "transparent background"
  // even when explicitly asked (see the Candidate 06B/06C reports). Rather than rejecting every
  // such candidate outright, composite the AI's RGB onto the procedural source's already-correct
  // silhouette/alpha when the plan requires transparency and the AI didn't provide real
  // transparency of its own. reconcileAlpha() is a no-op passthrough when the AI output already
  // has genuine alpha variance, so this never degrades an already-good result.
  let editedBuffer = image.buffer;
  if (plan.transparentBackground) {
    try {
      const reconciled = reconcileAlpha(image.buffer, sourceBytes);
      editedBuffer = reconciled.buffer;
    } catch {
      /* source or AI output undecodable as PNG — fall through to raw validation, which will
         correctly reject an undecodable buffer anyway */
    }
  }

  const validation = validateCandidate(editedBuffer, plan);
  if (!validation.passed) {
    return {
      ...fallbackOutcome(plan, `validation failed: ${validation.issues.join('; ')}`, true, undefined, attempts),
      validation,
    };
  }

  let stored: ReturnType<typeof createEditAssetVersion>;
  try {
    stored = createEditAssetVersion({
      storageRoot: input.storageRoot,
      sourceAssetId: plan.assetId,
      sourcePath: plan.sourceAssetPath,
      outputBuffer: editedBuffer,
      provider: result.provider,
      model: result.model,
      instruction,
      seed: result.seed,
      durationMs: result.durationMs,
      mimeType: image.mimeType,
      nativeWidth: validation.width ?? image.width,
      nativeHeight: validation.height ?? image.height,
      provenance: result.provenance as unknown as Record<string, unknown>,
    });
  } catch (err) {
    return fallbackOutcome(
      plan,
      `candidate storage failed: ${err instanceof Error ? err.message : String(err)}`,
      true,
      undefined,
      attempts,
    );
  }

  const accepted = acceptAssetVersion(input.storageRoot, stored.version.assetId);
  let activatedPath: string | undefined;
  if (accepted) {
    // Non-destructive candidate history stays at its own versioned path; the *canonical* path
    // Godot's room-assembler already references (plan.sourceAssetPath) is what actually needs to
    // change for the enhancement to show up in-game with zero .tscn/template changes.
    const canonicalAbsolute = join(input.storageRoot, ...plan.sourceAssetPath.split('/'));
    mkdirSync(dirname(canonicalAbsolute), { recursive: true });
    writeFileSync(canonicalAbsolute, editedBuffer);
    activatedPath = plan.sourceAssetPath;
  }

  return {
    plan,
    origin: 'AI_GENERATED_NVIDIA_NIM',
    attempted: true,
    succeeded: true,
    candidateAssetId: stored.version.assetId,
    candidatePath: stored.version.path,
    activatedPath,
    provider: result.provider,
    model: result.model,
    durationMs: result.durationMs,
    validation,
    attempts,
  };
}

/**
 * Runs the enhancement pass over every plan, never throwing — every plan resolves to an
 * AssetReplacementOutcome, success or FALLBACK_ACTIVE, so the caller can always continue
 * generation. procedural-only mode must never call this function (enforced at the call site in
 * asset-pipeline.ts, not here, so a bug here can't silently start making network calls in
 * procedural-only mode). One VisualProviderCircuitBreaker is shared across every plan in this run
 * — a provider that fails on the first asset won't be retried on every subsequent one.
 */
export async function runVisualEnhancementPass(input: RunVisualEnhancementInput): Promise<VisualEnhancementSummary> {
  const outcomes: AssetReplacementOutcome[] = [];
  const providerReport: ProviderRunReport[] = [];
  const breaker = new VisualProviderCircuitBreaker(input.circuitBreakerConfig);
  const policy = input.executionPolicy ?? DEFAULT_VISUAL_PROVIDER_EXECUTION_POLICY;

  if (input.visualMode === 'auto' && input.providerHealthy === false) {
    for (const plan of input.plans) {
      const outcome = fallbackOutcome(plan, 'auto mode: no configured provider is healthy, procedural baseline kept', false);
      outcomes.push(outcome);
      input.onOutcome?.(outcome);
    }
    return summarize(input.visualMode, outcomes, providerReport);
  }

  for (const plan of input.plans) {
    const outcome = await executeOnePlan(plan, input, breaker, policy).catch((err) =>
      fallbackOutcome(plan, `unexpected enhancement error: ${err instanceof Error ? err.message : String(err)}`, true),
    );
    const attempts = outcome.attempts ?? [];
    providerReport.push({
      assetId: plan.assetId,
      family: plan.family,
      attempts,
      activatedProvider: outcome.succeeded ? outcome.provider : undefined,
      activatedModel: outcome.succeeded ? outcome.model : undefined,
      origin: outcome.origin,
    });
    outcomes.push(outcome);
    input.onOutcome?.(outcome);
  }
  return summarize(input.visualMode, outcomes, providerReport);
}

function summarize(
  visualMode: RunVisualEnhancementInput['visualMode'],
  outcomes: AssetReplacementOutcome[],
  providerReport: ProviderRunReport[],
): VisualEnhancementSummary {
  return {
    visualMode,
    attempted: outcomes.filter((o) => o.attempted).length,
    enhanced: outcomes.filter((o) => o.succeeded).length,
    fallenBack: outcomes.filter((o) => o.attempted && !o.succeeded).length,
    skipped: outcomes.filter((o) => !o.attempted).length,
    outcomes,
    providerReport,
  };
}

export { NvidiaInvalidImagePayloadError };
