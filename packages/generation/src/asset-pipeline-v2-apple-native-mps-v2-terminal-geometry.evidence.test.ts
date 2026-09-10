import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  runAssetPipelineV2,
  buildAssetPlan,
  ImageProviderRegistry,
  createAppleNativeMpsProviderV2,
  createForegroundIsolationProvider,
  appleNativeMpsRegistration,
  curatedArtDirectionV2,
  CURATED_NEGATIVE_PROMPT_V2_NO_SCENERY,
  APPLE_NATIVE_MPS_V2_SUBJECTS,
  APPLE_NATIVE_MPS_PROFILE_V2,
  type AssetRequestV2,
} from '@metroforge/assets';

/**
 * Terminal geometry follow-up (this milestone's real-generation budget: at most 2 new requests,
 * failed/interrupted attempts count). This is request #1 of 2. See docs/audit's eighth session:
 * direct segmentation-model inspection of the prior (tiling-fixed) terminal result found no
 * coherent single-object silhouette at all -- the loose composition is a generation defect, not a
 * processing one. This spends a real generation on a geometry-anchored prompt
 * (`prop_power_terminal_v2`) designed to fix that, then runs it straight through the real
 * pipeline INCLUDING the new foreground-isolation stage (so both fixes are validated together,
 * not just the prompt).
 *
 * Gated behind METROFORGE_APPLE_NATIVE_MPS_V2_TERMINAL_GEOMETRY_REAL=1 -- distinct from every
 * other real-mode toggle so it can never silently run with, or be silently skipped by, another.
 */
const RUN_SLUG = 'asset-pipeline-v2-apple-native-mps-v2-terminal-geometry-2026-09-06';
const WORLD_THEME = 'futuristic underground metro / industrial sci-fi action game';
const STYLE_BIBLE_VERSION = 'metro-industrial-v1';

const RUN_REAL = process.env.METROFORGE_APPLE_NATIVE_MPS_V2_TERMINAL_GEOMETRY_REAL === '1';

function terminalGeometryRequest(): AssetRequestV2 {
  return {
    id: 'metro_power_terminal_v6',
    category: 'prop',
    artDirection: curatedArtDirectionV2(),
    runtimeUse: APPLE_NATIVE_MPS_V2_SUBJECTS.prop_power_terminal_v2,
    negativePrompt: CURATED_NEGATIVE_PROMPT_V2_NO_SCENERY,
    allowRealProvider: true,
    requireRealProvider: true,
    mode: 'LOCAL_ONLY',
    targetEngine: 'godot',
    project: { theme: WORLD_THEME },
    visualBibleVersion: STYLE_BIBLE_VERSION,
    inferenceSteps: 20,
    seed: 940401,
  };
}

describe.skipIf(!RUN_REAL)('pipeline v2 Apple-native MPS v2 profile — terminal geometry follow-up (real-generation budget request 1/2)', () => {
  it('verifies the geometry-anchored prompt against the real tokenizer, generates, and runs it through the real foreground-isolation stage', async () => {
    const provider = createAppleNativeMpsProviderV2();
    const isolationProvider = createForegroundIsolationProvider();
    const registry = new ImageProviderRegistry();
    registry.register(appleNativeMpsRegistration(provider));

    const evidenceDir = join(process.cwd(), 'test-artifacts', RUN_SLUG);
    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });

    const request = terminalGeometryRequest();
    writeFileSync(join(evidenceDir, 'terminal_geometry_request.json'), JSON.stringify(request, null, 2));

    const plan = buildAssetPlan(request);
    expect(plan.negativePrompt).toBe(CURATED_NEGATIVE_PROMPT_V2_NO_SCENERY);
    const budget = await provider.checkPromptBudget(plan.providerPrompt, plan.negativePrompt ?? '');
    expect(budget.ok, `prompt budget check failed: ${budget.error}`).toBe(true);
    expect(budget.positive?.overflow).toBe(false);
    expect(budget.negative?.overflow).toBe(false);
    writeFileSync(join(evidenceDir, 'prompt_budget_verification.json'), JSON.stringify({
      composedPrompt: plan.providerPrompt, negativePrompt: plan.negativePrompt, positive: budget.positive, negative: budget.negative,
    }, null, 2));

    const startedAt = Date.now();
    const run = await runAssetPipelineV2([request], { registry, foregroundIsolationProvider: isolationProvider });
    const elapsedMs = Date.now() - startedAt;
    expect(run.summary.failed, `terminal geometry generation failed: ${JSON.stringify(run.summary.failed)}`).toEqual([]);
    const entry = run.manifest[0]!;

    expect(entry.provider).toBe('diffusers');
    expect(entry.model).toBe(APPLE_NATIVE_MPS_PROFILE_V2.modelId);
    expect(entry.generationExecutionPath).toBe('apple_native_mps');
    expect(entry.validation.passed).toBe(true);
    expect(entry.maturity).not.toBe('PLACEHOLDER');
    expect(entry.productionReady).toBe(false);
    expect(entry.provenance?.effectiveParameters?.steps).toBe(20);

    const meta = entry.provenance?.executionMetadata as Record<string, unknown> | undefined;
    expect(meta?.effectivePrompt).toBe(plan.providerPrompt);
    expect(meta?.effectiveNegativePrompt).toBe(CURATED_NEGATIVE_PROMPT_V2_NO_SCENERY);
    expect(meta?.effectiveSteps).toBe(20);

    // The isolation stage ran for real this time (registry + foregroundIsolationProvider both
    // supplied) -- record what it actually found, whatever that turns out to be. This is
    // diagnostic evidence, not an assertion of success: a low-occupancy/unavailable result here
    // is itself the answer to "did the geometry fix work."
    expect(entry.foregroundIsolation).toBeDefined();

    mkdirSync(join(evidenceDir, request.id), { recursive: true });
    writeFileSync(join(evidenceDir, request.id, 'source.png'), entry.sourceBuffer);
    writeFileSync(join(evidenceDir, request.id, 'normalized.png'), entry.normalizedBuffer);
    writeFileSync(join(evidenceDir, request.id, 'compiled.png'), entry.buffer);
    const record = {
      assetId: entry.assetId, category: entry.category, model: entry.model, seed: entry.seed,
      sourceHash: entry.sourceHash, finalHash: entry.finalHash, requestHash: entry.requestHash,
      dimensions: entry.dimensions, elapsedMs, effectiveParameters: entry.provenance?.effectiveParameters,
      executionMetadata: meta, foregroundIsolation: entry.foregroundIsolation,
    };
    writeFileSync(join(evidenceDir, request.id, 'result.json'), JSON.stringify(record, null, 2));

    // Distinct from every prior terminal attempt's bytes.
    const priorHashes = new Set([
      '1880061fa4c319bcc60223fb331334c068147ce02f956e71e8127af6e97683f8',
      '794f91c0b05f46ff42bcffe27decd88d6bff083a0c109643ea27be54d6e19bb4',
      '50a9a5930cde334cc3a677d32427b9f0d97b8883b03beec2ca059cca93d8652b',
    ]);
    expect(priorHashes.has(entry.sourceHash)).toBe(false);

    console.log(`Terminal geometry follow-up complete: ${join(evidenceDir, request.id)}`);
    console.log(`foregroundIsolation: ${JSON.stringify(entry.foregroundIsolation)}`);
  }, 15 * 60 * 1000);
});
