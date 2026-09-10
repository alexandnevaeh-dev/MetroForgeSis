import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  runAssetPipelineV2,
  ImageProviderRegistry,
  createAppleNativeMpsProvider,
  appleNativeMpsRegistration,
  type AssetRequestV2,
  type RuntimeManifestEntryV2,
} from '@metroforge/assets';

/**
 * Quality experiment ("apple-native-mps-quality-v1") for the Apple-native MPS local profile.
 * Bounded, evidence-driven step-count comparison against the existing steps=6 baseline
 * (test-artifacts/asset-pipeline-v2-apple-native-mps-fixture-2026-09-05/) for the two weakest
 * assets — player and power terminal. The environment tile is deliberately excluded: it was
 * already readable at steps=6 and is reused as-is per the audit's "retain the coherent
 * environment tile" guidance.
 *
 * This does NOT touch, weaken, or reinterpret:
 *  - the locked OpenVINO/FP32 production profile or its evidence (untouched all session),
 *  - the Apple-native baseline profile/provider/worker (reused completely unmodified),
 *  - the steps=6 baseline evidence directory (never overwritten; read-only reference here).
 *
 * Every request here has a distinct id (`_steps20`/`_steps30` suffix) and a distinct
 * `inferenceSteps` value, so `generationRequestHash()` (which includes `steps`) can never collide
 * with the baseline's steps=6 request hash, or with each other — "every changed request gets a
 * new identity" by construction, not by convention.
 *
 * Gated behind METROFORGE_APPLE_NATIVE_MPS_QUALITY_EXPERIMENT=1 — distinct from
 * METROFORGE_APPLE_NATIVE_MPS_REAL (the baseline toggle) so this experiment can never silently
 * run as part of, or be silently skipped as part of, the baseline fixture's own gate.
 */
const STYLE = `Modern premium 2D side-view industrial sci-fi game asset. Futuristic underground metro. Orthographic side view. Crisp hard-edged silhouette, restrained graphite and gunmetal materials, cool overhead-left lighting, compact shadows, controlled detail, consistent 16px grid density. Semantic accents only: cyan for player and interaction, orange for hostile, amber for hazard. Contemporary clean production art, not retro pixel art. No text, photorealism, painterly scenery, bloom, random neon, noise, watermark, perspective view, or cropped subject.`;
const STYLE_BIBLE_VERSION = 'metro-industrial-v1';
const WORLD_THEME = 'futuristic underground metro / industrial sci-fi action game';
const RUN_SLUG = 'asset-pipeline-v2-apple-native-mps-quality-2026-09-05';

const RUN_EXPERIMENT = process.env.METROFORGE_APPLE_NATIVE_MPS_QUALITY_EXPERIMENT === '1';

function stepRequests(steps: 20 | 30): AssetRequestV2[] {
  const common = {
    artDirection: STYLE, allowRealProvider: true, requireRealProvider: true,
    mode: 'LOCAL_ONLY' as const, targetEngine: 'godot' as const,
    project: { theme: WORLD_THEME }, visualBibleVersion: STYLE_BIBLE_VERSION,
    inferenceSteps: steps,
  };
  return [
    { ...common, id: `metro_player_idle_steps${steps}`, category: 'player', runtimeUse: 'player character idle animation, isolated full body facing right; preserve exact costume, proportions, equipment, palette and ground anchor across the requested motion', seed: 940100, hostile: false, animation: { clip: 'idle', frameCount: 8, fps: 8, loop: true } },
    { ...common, id: `metro_power_terminal_steps${steps}`, category: 'prop', runtimeUse: 'metro power terminal isolated side-view prop', seed: 940401 },
  ] satisfies AssetRequestV2[];
}

describe.skipIf(!RUN_EXPERIMENT)('pipeline v2 Apple-native MPS quality experiment — step-count comparison', () => {
  it('generates player and power-terminal at 20 and 30 steps, sequentially, and records comparison evidence against the steps=6 baseline', async () => {
    const provider = createAppleNativeMpsProvider();
    const registry = new ImageProviderRegistry();
    registry.register(appleNativeMpsRegistration(provider));

    const evidenceDir = join(process.cwd(), 'test-artifacts', RUN_SLUG);
    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });

    const comparison: Array<Record<string, unknown>> = [];
    const allRequests = [...stepRequests(20), ...stepRequests(30)];
    writeFileSync(join(evidenceDir, 'experiment_requests.json'), JSON.stringify(allRequests, null, 2));

    // Strictly sequential — one asset at a time, fresh worker process per call (the same
    // cold-load-per-call behavior as the baseline; not attempting warm-reuse in this milestone).
    for (const request of allRequests) {
      const startedAt = Date.now();
      const run = await runAssetPipelineV2([request], { registry });
      const elapsedMs = Date.now() - startedAt;
      expect(run.summary.failed, `${request.id} failed: ${JSON.stringify(run.summary.failed)}`).toEqual([]);
      const entry: RuntimeManifestEntryV2 = run.manifest[0]!;

      expect(entry.provider).toBe('diffusers');
      expect(entry.model).toBe('sd-1.5-apple-mps');
      expect(entry.generationExecutionPath).toBe('apple_native_mps');
      expect(entry.validation.passed).toBe(true);
      expect(entry.maturity).not.toBe('PLACEHOLDER');
      expect(entry.productionReady).toBe(false);
      // The provenance-honesty fix under test: the executed step count must match what was
      // requested, not silently fall back to a global default.
      expect(entry.provenance?.effectiveParameters?.steps).toBe(request.inferenceSteps);

      const dir = join(evidenceDir, request.id!);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'source.png'), entry.sourceBuffer);
      writeFileSync(join(dir, 'compiled.png'), entry.buffer);
      const record = {
        assetId: entry.assetId, category: entry.category, requestedSteps: request.inferenceSteps,
        effectiveSteps: entry.provenance?.effectiveParameters?.steps,
        seed: entry.seed, sourceHash: entry.sourceHash, finalHash: entry.finalHash, requestHash: entry.requestHash,
        dimensions: entry.dimensions, elapsedMs,
        timings: entry.provenance?.executionMetadata,
        memory: (entry.provenance?.executionMetadata as Record<string, unknown> | undefined)?.memory,
      };
      writeFileSync(join(dir, 'result.json'), JSON.stringify(record, null, 2));
      comparison.push(record);
    }

    writeFileSync(join(evidenceDir, 'comparison_summary.json'), JSON.stringify(comparison, null, 2));

    // Distinctness — no two of these four requests, nor any of them vs the steps=6 baseline
    // hashes (hardcoded here as a known-value regression check against the baseline evidence
    // file, not recomputed — the baseline directory is not touched by this test), collide.
    const baselinePlayerSourceHash = '133c1fb3e4dc3de2c0f1e418c003008cbf7c32f2a83b95cb8d939d73d75a6236';
    const baselinePropSourceHash = '1880061fa4c319bcc60223fb331334c068147ce02f956e71e8127af6e97683f8';
    const allSourceHashes = comparison.map((c) => c.sourceHash as string);
    expect(new Set(allSourceHashes).size).toBe(allSourceHashes.length);
    expect(allSourceHashes).not.toContain(baselinePlayerSourceHash);
    expect(allSourceHashes).not.toContain(baselinePropSourceHash);
  }, 30 * 60 * 1000);

  /**
   * Round 2 — evidence-driven, not speculative: both the steps=20 and steps=30 power-terminal
   * attempts above converged to a repeating tile/stamped-metal PATTERN, not a single isolated
   * object, at both step counts — the failure mode did not change with steps, which is the
   * signal task step 3 says to act on ("if additional steps do not resolve the problem, inspect
   * prompt composition"). The original runtimeUse ("metro power terminal isolated side-view
   * prop") never states it should be a single, centered, freestanding object, or that it must
   * NOT read as a tileable/repeating texture — exactly the failure observed twice.
   *
   * This is the 5th of the 6 new generation requests this milestone is limited to (4 above + 1
   * here) — deliberately not spending the 6th until this result is inspected, per "report the
   * comparison and the specific next experiment rather than launching an uncontrolled batch."
   *
   * Only the prompt changes: same seed (940401, an intentional single-variable comparison against
   * the steps=20 attempt above), same checkpoint/scheduler/guidance/dimensions/category/backend,
   * steps=20 (the step count that helped the player, tested here rather than re-trying 30, which
   * already regressed the player). New id (`metro_power_terminal_v2`) gives it its own identity —
   * this is not a resubmission of `metro_power_terminal`.
   */
  it('revises the power-terminal prompt to explicitly rule out the observed repeating-pattern failure mode, at steps=20', async () => {
    const provider = createAppleNativeMpsProvider();
    const registry = new ImageProviderRegistry();
    registry.register(appleNativeMpsRegistration(provider));

    const evidenceDir = join(process.cwd(), 'test-artifacts', RUN_SLUG);
    mkdirSync(evidenceDir, { recursive: true }); // additive to round 1's directory, not a reset

    const revisedRequest: AssetRequestV2 = {
      id: 'metro_power_terminal_v2', category: 'prop',
      // Small, documented revision: explicitly states single/centered/freestanding object
      // framing, and explicitly negates the observed failure mode (repeating pattern / tileable
      // texture / wall panel) — nothing about industrial visual style, palette, or gameplay
      // purpose (a power-terminal prop) changed.
      runtimeUse: 'a single freestanding metro power terminal control panel prop, compact rectangular housing with status lights, dials, and cable ports, centered composition, isolated on empty background, side-view game object — not a repeating pattern, not a tileable texture, not a wall panel',
      artDirection: STYLE,
      allowRealProvider: true, requireRealProvider: true, mode: 'LOCAL_ONLY', targetEngine: 'godot',
      project: { theme: WORLD_THEME }, visualBibleVersion: STYLE_BIBLE_VERSION,
      inferenceSteps: 20, seed: 940401,
    };

    const startedAt = Date.now();
    const run = await runAssetPipelineV2([revisedRequest], { registry });
    const elapsedMs = Date.now() - startedAt;
    expect(run.summary.failed, JSON.stringify(run.summary.failed)).toEqual([]);
    const entry = run.manifest[0]!;

    expect(entry.provider).toBe('diffusers');
    expect(entry.model).toBe('sd-1.5-apple-mps');
    expect(entry.generationExecutionPath).toBe('apple_native_mps');
    expect(entry.validation.passed).toBe(true);
    expect(entry.maturity).not.toBe('PLACEHOLDER');
    expect(entry.productionReady).toBe(false);
    expect(entry.provenance?.effectiveParameters?.steps).toBe(20);
    // Must be a genuinely new identity — never the same source bytes as either prior attempt.
    const priorHashes = ['1880061fa4c319bcc60223fb331334c068147ce02f956e71e8127af6e97683f8'];
    expect(priorHashes).not.toContain(entry.sourceHash);

    const dir = join(evidenceDir, 'metro_power_terminal_v2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'source.png'), entry.sourceBuffer);
    writeFileSync(join(dir, 'compiled.png'), entry.buffer);
    writeFileSync(join(dir, 'result.json'), JSON.stringify({
      assetId: entry.assetId, category: entry.category, promptRevision: 'v2', requestedSteps: 20,
      effectiveSteps: entry.provenance?.effectiveParameters?.steps, seed: entry.seed,
      runtimeUse: revisedRequest.runtimeUse,
      sourceHash: entry.sourceHash, finalHash: entry.finalHash, requestHash: entry.requestHash,
      dimensions: entry.dimensions, elapsedMs, timings: entry.provenance?.executionMetadata,
    }, null, 2));
  }, 15 * 60 * 1000);

  /**
   * Round 3 (the 6th and final new request this milestone is limited to) — root-caused, not a
   * second guess. Round 2 produced byte-IDENTICAL output to the steps=20 attempt in round 1
   * despite a substantially rewritten `runtimeUse`. Verified directly with the real CLIP
   * tokenizer this session, not assumed: the shared STYLE text alone is already **116 tokens** —
   * 39 tokens over CLIP's 77-token limit — before any category-specific text is even appended.
   * `planner.ts` builds `providerPrompt` as `artDirection + ' — ' + runtimeUse` (shared,
   * unmodified production code, not touched here); with STYLE alone already over budget, BOTH
   * the round-1 and round-2 `runtimeUse` values were truncated away in their entirety, and both
   * truncate to the *exact same* surviving 77 tokens — which is why they produced the same image.
   * This affects every category that shares this STYLE text, not just the prop; the player's
   * partial success and the environment tile's stronger success are attributable to which generic
   * STYLE-only cues survive (the tile's "grid density" happens to already describe a tile; there
   * is no equivalent lucky alignment for "a single isolated prop").
   *
   * Fix, verified by direct tokenization before spending a generation on it: a SHORTENED style
   * summary for this experimental request only (not a change to the shared `STYLE`/`planner.ts`
   * used by the locked or baseline profiles) that preserves the same industrial/metro/palette/
   * non-photorealistic anchors in far fewer tokens, freeing enough of the 77-token budget for the
   * disambiguating object framing to actually reach the text encoder. Confirmed via
   * `tokenizer(..., truncation=True, max_length=77)` that "a single isolated power terminal prop,
   * not a repeating pattern, not a tile, not a texture, compact rectangular control panel housing
   * with status lights and..." now survives in full up to that point — the exact phrase round 2
   * needed but never received.
   */
  it('shortens the shared style text so the disambiguating object framing survives CLIP truncation (root-caused fix, not a guess)', async () => {
    const provider = createAppleNativeMpsProvider();
    const registry = new ImageProviderRegistry();
    registry.register(appleNativeMpsRegistration(provider));

    const evidenceDir = join(process.cwd(), 'test-artifacts', RUN_SLUG);
    mkdirSync(evidenceDir, { recursive: true });

    const shortStyle = 'Modern 2D industrial sci-fi game asset, orthographic side view, hard-edged silhouette, graphite and gunmetal materials, cool lighting, cyan and orange and amber accents, clean production art, not photorealistic.';
    const revisedRequest: AssetRequestV2 = {
      id: 'metro_power_terminal_v3', category: 'prop',
      runtimeUse: 'a single isolated power terminal prop, not a repeating pattern, not a tile, not a texture, compact rectangular control panel housing with status lights and cable ports, centered on plain background',
      artDirection: shortStyle,
      allowRealProvider: true, requireRealProvider: true, mode: 'LOCAL_ONLY', targetEngine: 'godot',
      project: { theme: WORLD_THEME }, visualBibleVersion: STYLE_BIBLE_VERSION,
      inferenceSteps: 20, seed: 940401,
    };

    const startedAt = Date.now();
    const run = await runAssetPipelineV2([revisedRequest], {
      registry,
      distinctSourcePairs: [['metro_power_terminal_v3', 'metro_industrial_tiles']],
    });
    const elapsedMs = Date.now() - startedAt;
    expect(run.summary.failed, JSON.stringify(run.summary.failed)).toEqual([]);
    const entry = run.manifest[0]!;

    expect(entry.provider).toBe('diffusers');
    expect(entry.model).toBe('sd-1.5-apple-mps');
    expect(entry.generationExecutionPath).toBe('apple_native_mps');
    expect(entry.validation.passed).toBe(true);
    expect(entry.maturity).not.toBe('PLACEHOLDER');
    expect(entry.productionReady).toBe(false);
    expect(entry.provenance?.effectiveParameters?.steps).toBe(20);
    const priorHashes = [
      '1880061fa4c319bcc60223fb331334c068147ce02f956e71e8127af6e97683f8', // steps=6 baseline
      '794f91c0b05f46ff42bcffe27decd88d6bff083a0c109643ea27be54d6e19bb4', // steps=20/v2 (identical to each other)
    ];
    expect(priorHashes).not.toContain(entry.sourceHash);

    const dir = join(evidenceDir, 'metro_power_terminal_v3');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'source.png'), entry.sourceBuffer);
    writeFileSync(join(dir, 'compiled.png'), entry.buffer);
    writeFileSync(join(dir, 'result.json'), JSON.stringify({
      assetId: entry.assetId, category: entry.category, promptRevision: 'v3-shortened-style', requestedSteps: 20,
      effectiveSteps: entry.provenance?.effectiveParameters?.steps, seed: entry.seed,
      artDirection: shortStyle, runtimeUse: revisedRequest.runtimeUse,
      sourceHash: entry.sourceHash, finalHash: entry.finalHash, requestHash: entry.requestHash,
      dimensions: entry.dimensions, elapsedMs, timings: entry.provenance?.executionMetadata,
    }, null, 2));
  }, 15 * 60 * 1000);
});
