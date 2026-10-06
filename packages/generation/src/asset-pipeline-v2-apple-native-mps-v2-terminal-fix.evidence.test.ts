import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  runAssetPipelineV2,
  buildAssetPlan,
  ImageProviderRegistry,
  createAppleNativeMpsProviderV2,
  appleNativeMpsRegistration,
  curatedArtDirectionV2,
  CURATED_NEGATIVE_PROMPT_V2,
  APPLE_NATIVE_MPS_V2_SUBJECTS,
  APPLE_NATIVE_MPS_PROFILE_V2,
  type AssetRequestV2,
} from '@metroforge/assets';

/**
 * Single-asset follow-up to asset-pipeline-v2-apple-native-mps-v2-fixture.evidence.test.ts: that
 * run's power terminal rendered as a repeating grid/tile pattern instead of a single freestanding
 * object. Root cause, confirmed from that run's own provenance
 * (`executionMetadata.effectiveNegativePrompt === ''`): `worldSpritePlan()` (prop/pickup
 * categories) set no negative prompt at all, so `CURATED_NEGATIVE_PROMPT_V2`'s explicit
 * anti-tiling language ("no repeating pattern, no seamless tile, no grid layout") never reached
 * that request.
 *
 * Fix under test: `AssetRequestV2.negativePrompt` (new, optional field) is now honored by
 * `worldSpritePlan()` — see packages/assets/src/pipeline-v2/{types,planner}.ts. This is the
 * minimal, additive change explicitly authorized for this follow-up: it only takes effect when a
 * caller explicitly sets the field, so `pipeline-v2.test.ts` / `modern-cohesion.evidence.test.ts`
 * / every other existing prop/pickup request (which never sets it) is provably unaffected — see
 * that regression run's pass in docs/audit/MODERN_COHESION_TEST_PROJECT.md's seventh session.
 *
 * This spends the 5th real generation request for this milestone (explicitly authorized beyond
 * the originally-stated 4-request ceiling, specifically to validate this fix) — the player asset
 * is NOT regenerated here since its v2 result was already a clear improvement with no defect to
 * fix; only the terminal is re-run, same seed, for direct before/after comparison.
 *
 * Gated behind METROFORGE_APPLE_NATIVE_MPS_V2_TERMINAL_FIX_REAL=1 — a distinct toggle from every
 * other real-mode gate this project uses, so this single-asset follow-up can never silently run
 * with, or be silently skipped by, any of the others.
 */
const RUN_SLUG = 'asset-pipeline-v2-apple-native-mps-v2-terminal-fix-2026-09-06';
const WORLD_THEME = 'futuristic underground metro / industrial sci-fi action game';
const STYLE_BIBLE_VERSION = 'metro-industrial-v1';

const RUN_REAL = process.env.METROFORGE_APPLE_NATIVE_MPS_V2_TERMINAL_FIX_REAL === '1';

function terminalFixRequest(): AssetRequestV2 {
  return {
    id: 'metro_power_terminal_v5',
    category: 'prop',
    artDirection: curatedArtDirectionV2(),
    runtimeUse: APPLE_NATIVE_MPS_V2_SUBJECTS.prop_power_terminal,
    negativePrompt: CURATED_NEGATIVE_PROMPT_V2,
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

describe.skipIf(!RUN_REAL)('pipeline v2 Apple-native MPS v2 profile — terminal tiling-defect fix, single-asset follow-up', () => {
  it('verifies the negativePrompt now reaches the prop request, then regenerates the terminal', async () => {
    const provider = createAppleNativeMpsProviderV2();
    const registry = new ImageProviderRegistry();
    registry.register(appleNativeMpsRegistration(provider));

    const evidenceDir = join(process.cwd(), 'test-artifacts', RUN_SLUG);
    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });

    const request = terminalFixRequest();
    writeFileSync(join(evidenceDir, 'terminal_fix_request.json'), JSON.stringify(request, null, 2));

    // ---- Confirm the fix at the plan level BEFORE spending the real generation request ----
    const plan = buildAssetPlan(request);
    expect(plan.negativePrompt, 'the negativePrompt fix did not reach worldSpritePlan()').toBe(CURATED_NEGATIVE_PROMPT_V2);

    const budget = await provider.checkPromptBudget(plan.providerPrompt, plan.negativePrompt ?? '');
    expect(budget.ok, `prompt budget check failed: ${budget.error}`).toBe(true);
    expect(budget.positive?.overflow).toBe(false);
    expect(budget.negative?.overflow).toBe(false);
    writeFileSync(join(evidenceDir, 'prompt_budget_verification.json'), JSON.stringify({
      composedPrompt: plan.providerPrompt, negativePrompt: plan.negativePrompt, positive: budget.positive, negative: budget.negative,
    }, null, 2));

    // ---- Generate (the 5th real request) ----
    const startedAt = Date.now();
    const run = await runAssetPipelineV2([request], { registry });
    const elapsedMs = Date.now() - startedAt;
    expect(run.summary.failed, `terminal fix generation failed: ${JSON.stringify(run.summary.failed)}`).toEqual([]);
    const entry = run.manifest[0]!;

    expect(entry.provider).toBe('diffusers');
    expect(entry.model).toBe(APPLE_NATIVE_MPS_PROFILE_V2.modelId);
    expect(entry.generationExecutionPath).toBe('apple_native_mps');
    expect(entry.validation.passed).toBe(true);
    expect(entry.maturity).not.toBe('PLACEHOLDER');
    expect(entry.productionReady).toBe(false);
    expect(entry.provenance?.effectiveParameters?.steps).toBe(20);

    const meta = entry.provenance?.executionMetadata as Record<string, unknown> | undefined;
    // Requested == effective conditioning, and specifically: the negative prompt that failed to
    // arrive last time now does.
    expect(meta?.effectivePrompt).toBe(plan.providerPrompt);
    expect(meta?.effectiveNegativePrompt).toBe(CURATED_NEGATIVE_PROMPT_V2);
    expect(meta?.effectiveNegativePrompt).not.toBe('');
    expect(meta?.effectiveSteps).toBe(20);

    mkdirSync(join(evidenceDir, request.id), { recursive: true });
    writeFileSync(join(evidenceDir, request.id, 'source.png'), entry.sourceBuffer);
    writeFileSync(join(evidenceDir, request.id, 'compiled.png'), entry.buffer);
    const record = {
      assetId: entry.assetId, category: entry.category, model: entry.model, seed: entry.seed,
      sourceHash: entry.sourceHash, finalHash: entry.finalHash, requestHash: entry.requestHash,
      dimensions: entry.dimensions, elapsedMs, effectiveParameters: entry.provenance?.effectiveParameters,
      executionMetadata: meta,
    };
    writeFileSync(join(evidenceDir, request.id, 'result.json'), JSON.stringify(record, null, 2));

    // Distinct from the prior (defective) v4 terminal result's bytes.
    expect(entry.sourceHash).not.toBe('50a9a5930cde334cc3a677d32427b9f0d97b8883b03beec2ca059cca93d8652b');

    console.log(`Terminal fix follow-up complete: ${join(evidenceDir, request.id)}`);
  }, 15 * 60 * 1000);
});
