import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import {
  runAssetPipelineV2,
  toLegacyAssetManifestEntries,
  analyzeFamilyCohesion,
  analyzeTilesetAdjacency,
  analyzeAnimationTemporal,
  assembleContactSheet,
  ImageProviderRegistry,
  createAppleNativeMpsProvider,
  appleNativeMpsRegistration,
  type AssetRequestV2,
  type RuntimeManifestEntryV2,
} from '@metroforge/assets';
import { GodotProjectAssembler } from '@metroforge/godot';
import {
  buildAutomatedQaEvaluation,
  createQaReviewRecord,
  promoteAssetThroughQa,
  writeQaReviewHistory,
  type QaPromotionTarget,
} from './asset-qa.js';

/**
 * Apple-native (PyTorch MPS) local profile — a genuinely different backend from the locked
 * OpenVINO/FP32 production profile, added because that profile is architecturally unreachable on
 * Apple Silicon (see docs/audit/MODERN_COHESION_TEST_PROJECT.md). Same locked visual bible, same
 * three fixture IDs/seeds/prompts/negative-prompts/dimensions as the offline fixture — only the
 * backend, model identity (`sd-1.5-apple-mps`, never `sd-1.5`), and precision differ.
 *
 * Gated behind METROFORGE_APPLE_NATIVE_MPS_REAL=1 (a distinct toggle from
 * METROFORGE_MODERN_COHESION_REAL — this must never silently run, or be silently skipped, as part
 * of the OpenVINO profile's own real-mode toggle) because it requires the dedicated
 * .venv-diffusers-mps environment and a ~5 GB local model download that are not present by
 * default. Not run by the standard `pnpm test` regression suite for the same reason the OpenVINO
 * real path isn't: it needs machine-specific setup this repo cannot assume.
 */
const STYLE_BIBLE_VERSION = 'metro-industrial-v1';
const STYLE = `Modern premium 2D side-view industrial sci-fi game asset. Futuristic underground metro. Orthographic side view. Crisp hard-edged silhouette, restrained graphite and gunmetal materials, cool overhead-left lighting, compact shadows, controlled detail, consistent 16px grid density. Semantic accents only: cyan for player and interaction, orange for hostile, amber for hazard. Contemporary clean production art, not retro pixel art. No text, photorealism, painterly scenery, bloom, random neon, noise, watermark, perspective view, or cropped subject.`;
const WORLD_THEME = 'futuristic underground metro / industrial sci-fi action game';
const RUN_SLUG = 'asset-pipeline-v2-apple-native-mps-fixture-2026-09-05';

function fixtureRequests(): AssetRequestV2[] {
  const common = {
    artDirection: STYLE, allowRealProvider: true, requireRealProvider: true,
    mode: 'LOCAL_ONLY' as const, targetEngine: 'godot' as const,
    project: { theme: WORLD_THEME }, visualBibleVersion: STYLE_BIBLE_VERSION,
  };
  return [
    { ...common, id: 'metro_player_idle', category: 'player', runtimeUse: 'player character idle animation, isolated full body facing right; preserve exact costume, proportions, equipment, palette and ground anchor across the requested motion', seed: 940100, hostile: false, animation: { clip: 'idle', frameCount: 8, fps: 8, loop: true } },
    { ...common, id: 'metro_industrial_tiles', category: 'environment', runtimeUse: 'modular 8 by 6 Godot tile source family with floors walls ceilings corners transitions platforms supports panels damage trim hazards background wall and conduit integration', seed: 940301 },
    { ...common, id: 'metro_power_terminal', category: 'prop', runtimeUse: 'metro power terminal isolated side-view prop', seed: 940401 },
  ] satisfies AssetRequestV2[];
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

const RUN_REAL = process.env.METROFORGE_APPLE_NATIVE_MPS_REAL === '1';

describe.skipIf(!RUN_REAL)('pipeline v2 Apple-native MPS local profile — authentic 3-asset fixture', () => {
  it('generates the player asset first, verifies it, then the tile and prop, through the real pipeline', async () => {
    const provider = createAppleNativeMpsProvider();
    const registry = new ImageProviderRegistry();
    registry.register(appleNativeMpsRegistration(provider));

    const evidenceDir = join(process.cwd(), 'test-artifacts', RUN_SLUG);
    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });

    const [playerRequest, tileRequest, propRequest] = fixtureRequests();
    writeFileSync(join(evidenceDir, 'fixture_specifications.json'), JSON.stringify(fixtureRequests(), null, 2));

    // ---- Stage 1: player asset alone, verified in full before anything else runs ----
    const playerStart = Date.now();
    const playerRun = await runAssetPipelineV2([playerRequest!], { registry });
    const playerElapsedMs = Date.now() - playerStart;
    expect(playerRun.summary.failed, JSON.stringify(playerRun.summary.failed)).toEqual([]);
    const player = playerRun.manifest[0]!;

    expect(player.category).toBe('player');
    expect(player.seed).toBe(940100);
    expect(player.provider).toBe('diffusers');
    expect(player.model).toBe('sd-1.5-apple-mps');
    expect(player.generationExecutionPath).toBe('apple_native_mps');
    expect(player.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(player.finalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(player.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(player.provenance?.backendType).toBe('local');
    expect(player.validation.passed).toBe(true);
    // Never PLACEHOLDER/procedural — this is a real, distinct request identity from the locked
    // sd-1.5/openvino_gpu profile, and must never be reported as, or confused with, that result.
    expect(player.maturity).not.toBe('PLACEHOLDER');
    expect(player.productionReady).toBe(false); // QA_REVIEW only — no fabricated approval, ever.
    expect(player.dimensions.width).toBeGreaterThan(0);
    expect(player.dimensions.height).toBeGreaterThan(0);

    mkdirSync(join(evidenceDir, 'source'), { recursive: true });
    mkdirSync(join(evidenceDir, 'generated'), { recursive: true });
    writeFileSync(join(evidenceDir, 'source', 'metro_player_idle.source.png'), player.sourceBuffer);
    writeFileSync(join(evidenceDir, 'generated', 'metro_player_idle.png'), player.buffer);
    writeFileSync(join(evidenceDir, 'player_result.json'), JSON.stringify({
      assetId: player.assetId, category: player.category, seed: player.seed, provider: player.provider,
      model: player.model, generationExecutionPath: player.generationExecutionPath,
      sourceHash: player.sourceHash, finalHash: player.finalHash, requestHash: player.requestHash,
      provenance: player.provenance, maturity: player.maturity, productionReady: player.productionReady,
      dimensions: player.dimensions, validation: player.validation, elapsedMs: playerElapsedMs,
    }, null, 2));

    // ---- Stage 2: only after the player succeeded — tile + prop ----
    const restStart = Date.now();
    const restRun = await runAssetPipelineV2([tileRequest!, propRequest!], {
      registry,
      distinctSourcePairs: [['metro_industrial_tiles', 'metro_power_terminal']],
    });
    const restElapsedMs = Date.now() - restStart;
    expect(restRun.summary.failed, JSON.stringify(restRun.summary.failed)).toEqual([]);
    const manifest: RuntimeManifestEntryV2[] = [player, ...restRun.manifest];
    expect(manifest).toHaveLength(3);
    expect(restRun.summary.distinctSourceChecks.every((c) => c.distinct)).toBe(true);

    for (const entry of restRun.manifest) {
      expect(entry.provider).toBe('diffusers');
      expect(entry.model).toBe('sd-1.5-apple-mps');
      expect(entry.generationExecutionPath).toBe('apple_native_mps');
      expect(entry.maturity).not.toBe('PLACEHOLDER');
      expect(entry.productionReady).toBe(false);
      expect(entry.validation.passed).toBe(true);
      const files: Array<[string, Buffer]> = [
        [join('generated', entry.compiledAssetPath), entry.buffer],
        [join('source', entry.sourceAssetPath), entry.sourceBuffer],
      ];
      for (const [rel, data] of files) {
        const path = join(evidenceDir, rel);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, data);
      }
      for (const extra of entry.extraResources) {
        const path = join(evidenceDir, 'generated', extra.path);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, extra.contents);
      }
    }
    writeFileSync(join(evidenceDir, 'timings.json'), JSON.stringify({ playerElapsedMs, tileAndPropElapsedMs: restElapsedMs }, null, 2));

    // ---- Cohesion / temporal QA (existing analyzers, reused unmodified) ----
    const tiles = manifest.find((e) => e.category === 'environment')!;
    const animationQa = analyzeAnimationTemporal(player.buffer, player.dimensions.width / (player.animation?.frameCount ?? 1), player.animation?.frameCount ?? 1);
    const tileQa = analyzeTilesetAdjacency(tiles.buffer, 16);
    const cohesion = analyzeFamilyCohesion(manifest.map((e) => ({ id: e.assetId, png: e.buffer })));
    mkdirSync(join(evidenceDir, 'qa'), { recursive: true });
    writeFileSync(join(evidenceDir, 'qa', 'automated_family_qa.json'), JSON.stringify({ animationQa, tileQa, cohesion }, null, 2));
    writeFileSync(join(evidenceDir, 'master_contact_sheet.png'), assembleContactSheet(manifest.map((e) => ({ label: e.assetId, png: e.buffer }))));

    // ---- QA_REVIEW stage — never fabricate approval ----
    const targets: QaPromotionTarget[] = manifest.map((entry) => ({
      assetId: entry.assetId, category: entry.category, pipelineVersion: entry.pipelineVersion,
      sourceHash: entry.sourceHash, finalHash: entry.finalHash, runtimePath: entry.runtimeResourcePath,
      maturity: entry.maturity, productionReady: entry.productionReady,
    }));
    const reviews = manifest.map((entry) => {
      const evaluation = buildAutomatedQaEvaluation({
        assetId: entry.assetId, category: entry.category, pipelineVersion: entry.pipelineVersion,
        sourceHash: entry.sourceHash, finalHash: entry.finalHash, runtimePath: entry.runtimeResourcePath,
        evidence: { nativeScale: [], inContext: [] },
        technicalValidationPassed: entry.validation.passed,
        currentHashMatchesFile: sha256(entry.buffer) === entry.finalHash,
        duplicateSource: false,
        evidenceExists: () => true,
      });
      return createQaReviewRecord(evaluation, {
        reviewer: 'qa:pending-human-review', decision: 'NEEDS_REWORK', previousMaturity: entry.maturity,
        notes: 'Real Apple-native MPS generation: automated pipeline/technical evidence only. An explicit human reviewer must still judge visual-bible adherence, silhouette, and gameplay readability before any promotion — nothing here is a substitute for that.',
        reasonCodes: ['HUMAN_VISUAL_REVIEW_PENDING'],
      });
    });
    writeQaReviewHistory(evidenceDir, reviews);
    const promotions = targets.map((target, i) => promoteAssetThroughQa(target, reviews[i]));
    // QA_REVIEW-eligible now (real generation, not PLACEHOLDER) — but still refused, because no
    // review here ever carries an APPROVE decision. This is the load-bearing assertion for
    // "never fabricate human approval."
    expect(promotions.every((p) => p.ok === false)).toBe(true);
    expect(reviews.every((r) => r.decision !== 'APPROVE')).toBe(true);
    writeFileSync(join(evidenceDir, 'qa', 'qa_promotion_attempts.json'), JSON.stringify(promotions, null, 2));

    // ---- Project integration: assemble a real, isolated Godot project ----
    const projectDir = join(evidenceDir, 'godot-project');
    const roomIds = ['room_000'];
    const dna: GameDNA = {
      version: '0.1.0', archetype: 'SIDE_VIEW_METROIDVANIA', seed: 940000, profile: 'TINY_TEST',
      identity: { title: 'Apple-Native MPS Fixture', genre: 'Metroidvania', tone: 'metro-industrial', visualStyle: STYLE },
      technical: { resolution: { width: 1280, height: 720 }, tileSize: 16, targetPlaytimeHours: 1, difficulty: 'normal' },
      combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
      movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
      abilities: [],
      world: { biomeCount: 1, roomCount: 1 },
      narrative: { premise: 'Fixture room for the Apple-native MPS asset pipeline test project.', protagonist: 'Warden', centralConflict: 'None — this is a pipeline validation fixture, not a game.' },
    };
    const worldGraph: WorldGraph = {
      version: '0.1.0', seed: dna.seed,
      nodes: roomIds.map((id) => ({ id, type: 'room' as const, label: id, metadata: {} })),
      edges: [],
      regions: [{ id: 'region_0', name: 'Fixture', biomeId: 'biome_0', roomIds }],
    };
    const progressionGraph: ProgressionGraph = { version: '0.1.0', seed: dna.seed, startNodeId: roomIds[0]!, endNodeId: roomIds[0]!, nodes: [], edges: [], abilities: [], criticalPath: roomIds };
    const textureFiles = new Map<string, Buffer>();
    for (const entry of manifest) {
      textureFiles.set(entry.compiledAssetPath, entry.buffer);
      for (const extra of entry.extraResources) textureFiles.set(extra.path, extra.contents);
    }
    const assembly = new GodotProjectAssembler().assemble({
      outputDir: projectDir, gameDna: dna, worldGraph, progressionGraph, roomIds, textureFiles,
      assetMetadata: toLegacyAssetManifestEntries(manifest),
      gameContent: { enemies: [], bosses: [], quests: [], items: [], npcs: [], dialogues: [], shops: [] },
    });
    expect(assembly.success, assembly.errors.join('\n')).toBe(true);

    // ---- Runtime proof scene (same pattern as the offline fixture) ----
    const positions: Record<string, [number, number]> = {
      metro_player_idle: [200, 400], metro_industrial_tiles: [500, 400], metro_power_terminal: [800, 400],
    };
    let loadStep = 1;
    const extLines: string[] = [];
    const nodeLines: string[] = [];
    for (const entry of manifest) {
      const [x, y] = positions[entry.assetId] ?? [400, 400];
      if (entry.godotResourceType === 'SpriteFrames') {
        extLines.push(`[ext_resource type="SpriteFrames" path="res://${entry.runtimeResourcePath}" id="${loadStep}"]`);
        nodeLines.push(`[node name="${entry.assetId}" type="AnimatedSprite2D" parent="."]\nposition = Vector2(${x}, ${y})\nsprite_frames = ExtResource("${loadStep}")\nanimation = &"${entry.animation?.clip ?? 'default'}"\nautoplay = "${entry.animation?.clip ?? 'default'}"`);
        loadStep++;
      } else {
        const texturePath = entry.category === 'environment' ? entry.compiledAssetPath : entry.runtimeResourcePath;
        extLines.push(`[ext_resource type="Texture2D" path="res://${texturePath}" id="${loadStep}"]`);
        nodeLines.push(`[node name="${entry.assetId}" type="Sprite2D" parent="."]\nposition = Vector2(${x}, ${y})\ntexture = ExtResource("${loadStep}")`);
        loadStep++;
      }
    }
    const captureScript = `extends Node2D

func _ready() -> void:
\tawait get_tree().process_frame
\tawait get_tree().process_frame
\tvar image := get_viewport().get_texture().get_image()
\tvar destination := ProjectSettings.globalize_path("res://qa/evidence/apple-native-mps-fixture-context.png")
\tDirAccess.make_dir_recursive_absolute(destination.get_base_dir())
\tvar error := image.save_png(destination)
\tprint("APPLE_NATIVE_MPS_FIXTURE_CAPTURE:", destination, ":", error)
\tget_tree().quit(0 if error == OK else 1)
`;
    mkdirSync(join(projectDir, 'scripts', 'test'), { recursive: true });
    writeFileSync(join(projectDir, 'scripts', 'test', 'AppleNativeMpsFixtureCapture.gd'), captureScript);
    const proofScene = `[gd_scene load_steps=${manifest.length + 2} format=3]

[ext_resource type="Script" path="res://scripts/test/AppleNativeMpsFixtureCapture.gd" id="capture_script"]
${extLines.join('\n')}

[node name="AppleNativeMpsFixtureProof" type="Node2D"]
script = ExtResource("capture_script")

${nodeLines.join('\n\n')}
`;
    mkdirSync(join(projectDir, 'scenes', 'test'), { recursive: true });
    writeFileSync(join(projectDir, 'scenes', 'test', 'AppleNativeMpsFixtureProof.tscn'), proofScene);

    const generationManifest = JSON.parse(readFileSync(join(projectDir, 'generation_manifest.json'), 'utf8')) as { artifacts: Array<{ pipelineVersion?: string; id?: string }> };
    const v2Artifacts = generationManifest.artifacts.filter((a) => a.pipelineVersion === 'asset_pipeline_v2');
    expect(v2Artifacts).toHaveLength(3);
    const sceneText = readFileSync(join(projectDir, 'scenes', 'test', 'AppleNativeMpsFixtureProof.tscn'), 'utf8');
    for (const entry of manifest) expect(sceneText).toContain(entry.assetId);

    console.log(`Apple-native MPS fixture project assembled at: ${projectDir}`);
  }, 20 * 60 * 1000);
});
