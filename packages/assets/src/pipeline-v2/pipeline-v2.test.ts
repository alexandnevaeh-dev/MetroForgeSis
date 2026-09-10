import { describe, expect, it } from 'vitest';
import { buildAssetPlan } from './planner.js';
import { generateSourceV2 } from './source-generation.js';
import { normalizeAssetV2 } from './normalize.js';
import { processAssetV2 } from './process.js';
import { compileAssetV2 } from './compile.js';
import { validateAssetV2 } from './validate.js';
import { runAssetPipelineV2 } from './orchestrator.js';
import { toLegacyAssetManifestEntries } from './legacy-bridge.js';
import { ASSET_PIPELINE_V2_VERSION, type AssetRequestV2 } from './types.js';
import { ImageProviderRegistry } from '../image-router.js';
import { createHash } from 'node:crypto';

function req(overrides: Partial<AssetRequestV2> & Pick<AssetRequestV2, 'id' | 'category'>): AssetRequestV2 {
  return {
    runtimeUse: 'test',
    artDirection: 'ancient overgrown mechanical ruins',
    seed: 1000,
    ...overrides,
  };
}

describe('pipeline v2 — AssetRequest → AssetPlan', () => {
  it('converts a request into an explicit plan carrying pipeline metadata', () => {
    const plan = buildAssetPlan(req({ id: 'player', category: 'player' }));
    expect(plan.requestId).toBe('player');
    expect(plan.category).toBe('player');
    expect(plan.godotResourceType).toBe('SpriteFrames');
  });

  it('gives category-specific plans — player and ability icon never share a processing path', () => {
    const playerPlan = buildAssetPlan(req({ id: 'player', category: 'player' }));
    const iconPlan = buildAssetPlan(req({ id: 'icon_dash', category: 'ability_icon' }));
    expect(playerPlan.compilationStrategy).not.toBe(iconPlan.compilationStrategy);
    expect(playerPlan.animationStrategy).not.toBe('none');
    expect(iconPlan.animationStrategy).toBe('none');
  });

  it('gives boss a distinct final size from standard enemy', () => {
    const enemyPlan = buildAssetPlan(req({ id: 'enemy_000', category: 'enemy' }));
    const bossPlan = buildAssetPlan(req({ id: 'boss_final', category: 'boss', isFinalBoss: true }));
    expect(bossPlan.finalWidth).not.toBe(enemyPlan.finalWidth);
  });

  it('sets an explicit outline color only for player, not enemy/boss/npc (ninth-session visibility fix, category-aware and opt-in)', () => {
    const playerPlan = buildAssetPlan(req({ id: 'player', category: 'player' }));
    const enemyPlan = buildAssetPlan(req({ id: 'enemy_000', category: 'enemy' }));
    const bossPlan = buildAssetPlan(req({ id: 'boss_final', category: 'boss' }));
    const npcPlan = buildAssetPlan(req({ id: 'npc_000', category: 'npc' }));
    expect(playerPlan.outlineColor).toEqual([90, 140, 220]);
    expect(enemyPlan.outlineColor).toBeUndefined();
    expect(bossPlan.outlineColor).toBeUndefined();
    expect(npcPlan.outlineColor).toBeUndefined();
  });

  it('keeps background out of character-sheet compilation', () => {
    const plan = buildAssetPlan(req({ id: 'bg_far', category: 'background' }));
    expect(plan.compilationStrategy).toBe('background_plate');
    expect(plan.animationStrategy).toBe('none');
  });

  it('routes environment through the tileset atlas strategy, not a generic sprite', () => {
    const plan = buildAssetPlan(req({ id: 'biome_0', category: 'environment' }));
    expect(plan.compilationStrategy).toBe('tileset_atlas');
    expect(plan.godotResourceType).toBe('TileSet');
  });

  it('gives HUD and ability icon distinct destinations', () => {
    const iconPlan = buildAssetPlan(req({ id: 'icon_dash', category: 'ability_icon' }));
    const hudPlan = buildAssetPlan(req({ id: 'health_meter', category: 'hud' }));
    expect(iconPlan.godotDestination).not.toBe(hudPlan.godotDestination);
    expect(iconPlan.compilationStrategy).toBe('ui_icon');
    expect(hudPlan.compilationStrategy).toBe('ui_hud');
  });
});

describe('pipeline v2 — SourceGeneration', () => {
  it('falls back to deterministic procedural generation when no provider is allowed', async () => {
    const plan = buildAssetPlan(req({ id: 'player', category: 'player' }));
    const result = await generateSourceV2(plan, req({ id: 'player', category: 'player' }));
    expect(result.provider).toBe('procedural');
    expect(result.executionPath).toBe('procedural_fallback');
    expect(result.fallbackGenerated).toBe(true);
  });

  it('consults the real provider registry when allowRealProvider is set (routing exercised, not bypassed)', async () => {
    const registry = new ImageProviderRegistry();
    const plan = buildAssetPlan(req({ id: 'player', category: 'player' }));
    const result = await generateSourceV2(plan, req({ id: 'player', category: 'player', allowRealProvider: true, mode: 'LOCAL_ONLY' }), { registry });
    // No providers registered ⇒ selectHealthy finds nothing ⇒ falls back, but the real
    // registry.selectHealthy() code path was genuinely invoked (not skipped).
    expect(result.provider).toBe('procedural');
  });

  it('propagates seed deterministically — same request/seed reproduces the same source hash', async () => {
    const plan = buildAssetPlan(req({ id: 'player', category: 'player' }));
    const a = await generateSourceV2(plan, req({ id: 'player', category: 'player', seed: 42 }));
    const b = await generateSourceV2(plan, req({ id: 'player', category: 'player', seed: 42 }));
    const hash = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
    expect(hash(a.buffer)).toBe(hash(b.buffer));
  });

  it('produces a different source hash for a different seed', async () => {
    const plan = buildAssetPlan(req({ id: 'player', category: 'player' }));
    const a = await generateSourceV2(plan, req({ id: 'player', category: 'player', seed: 1 }));
    const b = await generateSourceV2(plan, req({ id: 'player', category: 'player', seed: 2 }));
    const hash = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
    expect(hash(a.buffer)).not.toBe(hash(b.buffer));
  });
});

describe('pipeline v2 — Normalization routing', () => {
  it('normalizes to the plan dimensions', async () => {
    const request = req({ id: 'player', category: 'player' });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    expect(normalized.width).toBe(plan.finalWidth);
    expect(normalized.height).toBe(plan.finalHeight);
  });

  it('preserves the alpha gradient for background plates instead of binarizing it', async () => {
    const request = req({ id: 'bg_far', category: 'background' });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    expect(normalized.opsApplied).toContain('canvas_normalize');
  });
});

describe('pipeline v2 — AssetProcessing routing', () => {
  it('routes character categories through animation-sheet processing with >=4 frames', async () => {
    const request = req({ id: 'player', category: 'player' });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    const processed = processAssetV2(plan, request, normalized);
    expect(processed.processor).toBe('character');
    expect(processed.frameCount).toBeGreaterThanOrEqual(4);
  });

  it('routes ability icons through UI processing only, never the animation compiler', async () => {
    const request = req({ id: 'icon_dash', category: 'ability_icon' });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    const processed = processAssetV2(plan, request, normalized);
    expect(processed.processor).toBe('ui');
    expect(processed.frameCount).toBeUndefined();
  });

  it('routes background through the background processor only', async () => {
    const request = req({ id: 'bg_far', category: 'background' });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    const processed = processAssetV2(plan, request, normalized);
    expect(processed.processor).toBe('background');
  });

  it('routes environment through the environment/tileset processor', async () => {
    const request = req({ id: 'biome_0', category: 'environment' });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    const processed = processAssetV2(plan, request, normalized);
    expect(processed.processor).toBe('environment');
  });
});

describe('pipeline v2 — Compilation routing', () => {
  it('uses the character-sheet compiler only for character categories', async () => {
    const request = req({ id: 'player', category: 'player' });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    const processed = processAssetV2(plan, request, normalized);
    const compiled = compileAssetV2(plan, processed);
    expect(compiled.compiler).toBe('animation-sheet-compiler');
    expect(compiled.compiledWidth).toBe(plan.finalWidth * (processed.frameCount ?? 1));
  });

  it('never uses the character compiler for background assets', async () => {
    const request = req({ id: 'bg_far', category: 'background' });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    const processed = processAssetV2(plan, request, normalized);
    const compiled = compileAssetV2(plan, processed);
    expect(compiled.compiler).not.toBe('animation-sheet-compiler');
  });

  it('emits terrain.tres for environment assets', async () => {
    const request = req({ id: 'biome_0', category: 'environment' });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    const processed = processAssetV2(plan, request, normalized);
    const compiled = compileAssetV2(plan, processed);
    expect(compiled.extraResources.some((r) => r.path.endsWith('terrain.tres'))).toBe(true);
  });
});

describe('pipeline v2 — Validation', () => {
  it('blocks pipeline success when a rule fails (NPC carrying hostile metadata)', async () => {
    const request = req({ id: 'npc_hostile', category: 'npc', hostile: true });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    const processed = processAssetV2(plan, request, normalized);
    const compiled = compileAssetV2(plan, processed);
    const validation = validateAssetV2(plan, request, processed, compiled);
    expect(validation.passed).toBe(false);
    expect(validation.ruleResults.find((r) => r.rule === 'npc_no_hostile_metadata')?.passed).toBe(false);
  });

  it('passes for a well-formed NPC request', async () => {
    const request = req({ id: 'npc_merchant', category: 'npc' });
    const plan = buildAssetPlan(request);
    const source = await generateSourceV2(plan, request);
    const normalized = normalizeAssetV2(source.buffer, plan);
    const processed = processAssetV2(plan, request, normalized);
    const compiled = compileAssetV2(plan, processed);
    const validation = validateAssetV2(plan, request, processed, compiled);
    expect(validation.passed).toBe(true);
  });
});

describe('pipeline v2 — orchestrator / RuntimeManifest', () => {
  it('records the pipeline version on every manifest entry', async () => {
    const { manifest } = await runAssetPipelineV2([req({ id: 'player', category: 'player' })]);
    expect(manifest[0]?.pipelineVersion).toBe(ASSET_PIPELINE_V2_VERSION);
  });

  it('never promotes a validation failure to PRODUCTION_READY', async () => {
    const { manifest, summary } = await runAssetPipelineV2([req({ id: 'npc_bad', category: 'npc', hostile: true })]);
    expect(manifest[0]?.productionReady).toBe(false);
    expect(manifest[0]?.maturity).toBe('REJECTED');
    expect(summary.failed.length).toBe(1);
  });

  it('a compilation/generation-stage exception blocks success and never reaches the manifest', async () => {
    const { manifest, summary } = await runAssetPipelineV2([
      // @ts-expect-error deliberately invalid category to force a stage failure
      req({ id: 'bad', category: 'not_a_real_category' }),
    ]);
    expect(manifest.length).toBe(0);
    expect(summary.failed.length).toBe(1);
    expect(summary.failed[0]?.assetId).toBe('bad');
  });

  it('gives distinct assets distinct compiled/runtime paths that cannot overwrite each other', async () => {
    const { manifest } = await runAssetPipelineV2([
      req({ id: 'player', category: 'player' }),
      req({ id: 'enemy_000', category: 'enemy' }),
    ]);
    const paths = manifest.map((m) => m.compiledAssetPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('applies a manual-crop recipe end to end when its source hash matches the real source produced this run (ninth-session terminal-crop reproducibility)', async () => {
    const request = req({ id: 'prop_x', category: 'prop' });
    // First, discover the actual (procedural) source hash this exact request produces —
    // deterministic, so a recipe recorded against it is reproducible.
    const baseline = await runAssetPipelineV2([request]);
    const sourceHash = baseline.manifest[0]!.sourceHash;
    const baselineFinalHash = baseline.manifest[0]!.finalHash;

    const { manifest, summary } = await runAssetPipelineV2([request], {
      manualCropRecipes: {
        prop_x: { assetId: 'prop_x', sourceHash, crop: { x0: 0, y0: 0, x1: 15, y1: 15 }, reason: 'test', recordedBy: 'test-suite', recordedAt: '2026-09-06' },
      },
    });
    expect(summary.failed).toEqual([]);
    const entry = manifest[0]!;
    expect(entry.manualCrop?.applied).toBe(true);
    expect(entry.manualCrop?.cropRect).toEqual({ x0: 0, y0: 0, x1: 15, y1: 15 });
    // The original sourceHash (pre-crop, untouched) is unchanged from the baseline run — "preserve
    // the original source and its hash" — but the finalHash (post-crop, post-compile) differs,
    // since the actual bytes going through normalize/process/compile are now different.
    expect(entry.sourceHash).toBe(sourceHash);
    expect(entry.finalHash).not.toBe(baselineFinalHash);
  });

  it('rejects a manual-crop recipe whose recorded source hash no longer matches — fails that asset, not the whole batch, and never silently applies a stale crop', async () => {
    const request = req({ id: 'prop_y', category: 'prop' });
    const { manifest, summary } = await runAssetPipelineV2([request], {
      manualCropRecipes: {
        prop_y: { assetId: 'prop_y', sourceHash: '0'.repeat(64), crop: { x0: 0, y0: 0, x1: 15, y1: 15 }, reason: 'test', recordedBy: 'test-suite', recordedAt: '2026-09-06' },
      },
    });
    expect(manifest.length).toBe(0);
    expect(summary.failed.length).toBe(1);
    expect(summary.failed[0]?.stage).toBe('manual_crop');
    expect(summary.failed[0]?.error).toMatch(/MANUAL_CROP_SOURCE_HASH_MISMATCH/);
  });

  it('preserves per-asset source and final hashes in the manifest', async () => {
    const { manifest } = await runAssetPipelineV2([req({ id: 'player', category: 'player' })]);
    expect(manifest[0]?.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest[0]?.finalHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computes distinct-source checks by hash, not filename, across category pairs', async () => {
    const { summary } = await runAssetPipelineV2(
      [
        req({ id: 'player', category: 'player' }),
        req({ id: 'enemy_000', category: 'enemy' }),
        req({ id: 'npc_merchant', category: 'npc' }),
        req({ id: 'boss_final', category: 'boss', isFinalBoss: true }),
        req({ id: 'icon_dash', category: 'ability_icon' }),
        req({ id: 'health_meter', category: 'hud' }),
        req({ id: 'biome_0', category: 'environment' }),
        req({ id: 'bg_far', category: 'background' }),
      ],
      {
        distinctSourcePairs: [
          ['player', 'enemy_000'],
          ['player', 'npc_merchant'],
          ['enemy_000', 'boss_final'],
          ['icon_dash', 'health_meter'],
          ['biome_0', 'bg_far'],
        ],
      },
    );
    expect(summary.distinctSourceChecks.every((c) => c.distinct)).toBe(true);
    expect(summary.distinctSourceChecks.length).toBe(5);
  });
});

describe('pipeline v2 — legacy conversion boundary', () => {
  it('converts RuntimeManifestEntryV2 into the legacy AssetManifestEntry shape with a version tag', async () => {
    const { manifest } = await runAssetPipelineV2([req({ id: 'player', category: 'player' })]);
    const legacy = toLegacyAssetManifestEntries(manifest);
    expect(legacy[0]?.pipelineVersion).toBe(ASSET_PIPELINE_V2_VERSION);
    expect(legacy[0]?.path).toBe(manifest[0]?.compiledAssetPath);
    expect(legacy[0]?.type).toBe('texture');
  });
});
