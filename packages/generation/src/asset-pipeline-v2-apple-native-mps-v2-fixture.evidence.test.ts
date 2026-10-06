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
  APPLE_NATIVE_MPS_V2_SUBJECTS,
  APPLE_NATIVE_MPS_PROFILE_V2,
  type AssetRequestV2,
} from '@metroforge/assets';

/**
 * Bounded real-generation validation of the corrected v2 profile (curated, tokenizer-verified
 * prompt composition — see packages/assets/src/providers/apple-native-mps-profile.ts and
 * docs/audit/MODERN_COHESION_TEST_PROJECT.md). At most 4 new real generation requests for this
 * whole milestone; this file uses the first 2 (player, power terminal), both at steps=20, same
 * seeds as every prior attempt for direct comparison. The other 2 are reserved for a follow-up
 * round only if inspection of these results reveals a concrete issue — never spent speculatively.
 *
 * Gated behind METROFORGE_APPLE_NATIVE_MPS_V2_REAL=1 — a third, distinct toggle from
 * METROFORGE_APPLE_NATIVE_MPS_REAL (the v1/baseline fixture) and
 * METROFORGE_APPLE_NATIVE_MPS_QUALITY_EXPERIMENT (the step-count/prompt-revision experiment) so
 * none of the three can be silently run together or silently skip each other.
 */
const RUN_SLUG = 'asset-pipeline-v2-apple-native-mps-v2-fixture-2026-09-06';
const WORLD_THEME = 'futuristic underground metro / industrial sci-fi action game';
const STYLE_BIBLE_VERSION = 'metro-industrial-v1';

const RUN_REAL = process.env.METROFORGE_APPLE_NATIVE_MPS_V2_REAL === '1';

function v2Requests(): AssetRequestV2[] {
  const common = {
    artDirection: curatedArtDirectionV2(), allowRealProvider: true, requireRealProvider: true,
    mode: 'LOCAL_ONLY' as const, targetEngine: 'godot' as const,
    project: { theme: WORLD_THEME }, visualBibleVersion: STYLE_BIBLE_VERSION,
    inferenceSteps: 20,
  };
  return [
    { ...common, id: 'metro_player_idle_v2', category: 'player', runtimeUse: APPLE_NATIVE_MPS_V2_SUBJECTS.player, seed: 940100, hostile: false, animation: { clip: 'idle', frameCount: 8, fps: 8, loop: true } },
    { ...common, id: 'metro_power_terminal_v4', category: 'prop', runtimeUse: APPLE_NATIVE_MPS_V2_SUBJECTS.prop_power_terminal, seed: 940401 },
  ] satisfies AssetRequestV2[];
}

describe.skipIf(!RUN_REAL)('pipeline v2 Apple-native MPS v2 profile — corrected prompt composition, bounded real validation', () => {
  it('verifies composed prompts against the real tokenizer, then generates player and terminal sequentially at steps=20', async () => {
    const provider = createAppleNativeMpsProviderV2();
    const registry = new ImageProviderRegistry();
    registry.register(appleNativeMpsRegistration(provider));

    const evidenceDir = join(process.cwd(), 'test-artifacts', RUN_SLUG);
    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });

    const requests = v2Requests();
    writeFileSync(join(evidenceDir, 'v2_requests.json'), JSON.stringify(requests, null, 2));

    // ---- Verify the FINAL COMPOSED prompt (exactly what planner.ts / the pipeline will send,
    // not the raw style/subject text in isolation) with the real tokenizer, before inference. ----
    // IMPORTANT, found by this exact check on the first real attempt: `planner.ts` (shared,
    // LOCKED, not modified here) only sets a category negativePrompt for character/animated
    // categories (see planner.ts's characterPlan/animatedWorldPlan) — `prop` (worldSpritePlan)
    // sets NONE at all. CURATED_NEGATIVE_PROMPT_V2 therefore never reaches a prop request through
    // the real pipeline; this test verifies the negative prompt the LOCKED planner actually
    // produces (`plan.negativePrompt ?? ''`), not an aspirational constant, matching what
    // `generateSourceV2` actually sends. Extending planner.ts to give prop/environment/background
    // a category negative prompt is real follow-up work, out of scope for this milestone (it
    // would touch shared, locked code) — recorded in docs/audit, not silently patched here.
    const budgetChecks: Array<Record<string, unknown>> = [];
    for (const request of requests) {
      const plan = buildAssetPlan(request);
      const effectiveNegative = plan.negativePrompt ?? '';
      const budget = await provider.checkPromptBudget(plan.providerPrompt, effectiveNegative);
      expect(budget.ok, `prompt budget check itself failed for ${request.id}: ${budget.error}`).toBe(true);
      expect(budget.positive?.overflow, `${request.id} POSITIVE prompt overflows (${budget.positive?.tokenCount}/${budget.positive?.maxTokens}): "${plan.providerPrompt}"`).toBe(false);
      expect(budget.negative?.overflow, `${request.id} NEGATIVE prompt overflows (${budget.negative?.tokenCount}/${budget.negative?.maxTokens})`).toBe(false);
      budgetChecks.push({ assetId: request.id, composedPrompt: plan.providerPrompt, negativePrompt: effectiveNegative, plannerSuppliedNegativePrompt: plan.negativePrompt ?? null, positive: budget.positive, negative: budget.negative, tokenizerClass: budget.tokenizerClass });
    }
    writeFileSync(join(evidenceDir, 'prompt_budget_verification.json'), JSON.stringify(budgetChecks, null, 2));

    // ---- Generate sequentially, one asset at a time ----
    const results: Array<Record<string, unknown>> = [];
    for (const request of requests) {
      const startedAt = Date.now();
      const run = await runAssetPipelineV2([request], { registry });
      const elapsedMs = Date.now() - startedAt;
      expect(run.summary.failed, `${request.id} failed: ${JSON.stringify(run.summary.failed)}`).toEqual([]);
      const entry = run.manifest[0]!;

      expect(entry.provider).toBe('diffusers');
      expect(entry.model).toBe(APPLE_NATIVE_MPS_PROFILE_V2.modelId);
      expect(entry.generationExecutionPath).toBe('apple_native_mps');
      expect(entry.validation.passed).toBe(true);
      expect(entry.maturity).not.toBe('PLACEHOLDER');
      expect(entry.productionReady).toBe(false);
      expect(entry.provenance?.effectiveParameters?.steps).toBe(20);
      // Requested == effective conditioning — reject any silent discrepancy.
      const meta = entry.provenance?.executionMetadata as Record<string, unknown> | undefined;
      const plan = buildAssetPlan(request);
      expect(meta?.effectivePrompt).toBe(plan.providerPrompt);
      expect(meta?.effectiveNegativePrompt).toBe(plan.negativePrompt ?? '');
      expect(meta?.effectiveSteps).toBe(20);
      const budget = meta?.promptBudget as { anyOverflow?: boolean } | undefined;
      expect(budget?.anyOverflow).toBe(false);

      const dir = join(evidenceDir, request.id!);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'source.png'), entry.sourceBuffer);
      writeFileSync(join(dir, 'compiled.png'), entry.buffer);
      const record = {
        assetId: entry.assetId, category: entry.category, model: entry.model, seed: entry.seed,
        sourceHash: entry.sourceHash, finalHash: entry.finalHash, requestHash: entry.requestHash,
        dimensions: entry.dimensions, elapsedMs, effectiveParameters: entry.provenance?.effectiveParameters,
        executionMetadata: meta,
      };
      writeFileSync(join(dir, 'result.json'), JSON.stringify(record, null, 2));
      results.push(record);
    }
    writeFileSync(join(evidenceDir, 'v2_results_summary.json'), JSON.stringify(results, null, 2));

    // Distinct from v1/baseline results (different model id already guarantees a different
    // requestHash — this additionally confirms the source bytes themselves are new).
    const priorHashes = new Set([
      '133c1fb3e4dc3de2c0f1e418c003008cbf7c32f2a83b95cb8d939d73d75a6236', // v1 player steps20
      '1880061fa4c319bcc60223fb331334c068147ce02f956e71e8127af6e97683f8', // baseline terminal steps6
      '794f91c0b05f46ff42bcffe27decd88d6bff083a0c109643ea27be54d6e19bb4', // terminal steps20/v2
    ]);
    for (const r of results) expect(priorHashes.has(r.sourceHash as string), `${r.assetId} unexpectedly reproduced a prior result's bytes`).toBe(false);
  }, 35 * 60 * 1000);
});
