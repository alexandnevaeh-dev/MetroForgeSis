import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inferAssetMaturity } from '@metroforge/shared';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import {
  buildAssetPlan,
  normalizeAssetV2,
  processAssetV2,
  compileAssetV2,
  validateAssetV2,
  toLegacyAssetManifestEntries,
  assembleContactSheet,
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
 * Assembles the IMPROVED scene from the three SELECTED real candidates (no new generation — this
 * step is "run them through the existing pipeline and assemble the existing Godot scene", not
 * another generation round, and it is the 7th distinct asset id, not one of the 6 budgeted new
 * generation requests):
 *   - player:  metro_player_idle_steps20  (winner of the step-count comparison — see
 *              asset-pipeline-v2-apple-native-mps-quality-experiment.evidence.test.ts)
 *   - prop:    metro_power_terminal_v3    (winner of the prompt-revision round — root-caused
 *              CLIP-truncation fix, not the steps=20/30/v2 attempts)
 *   - environment: metro_industrial_tiles (the ORIGINAL steps=6 baseline — retained unchanged,
 *              per "retain the coherent environment tile if it remains compatible")
 *
 * Each candidate's already-generated SOURCE bytes (read from disk, not regenerated) are run
 * through the real, unmodified normalize -> process -> compile -> validate stages so this
 * evidence is produced by the actual pipeline, not hand-assembled. `generateSourceV2` /
 * `runAssetPipelineV2`'s own SourceGeneration stage is deliberately bypassed here ONLY because
 * its job (get source bytes) is already done and verified — regenerating would mean 3 more real
 * MPS calls against a machine-specific backend for a deterministic, already-known result, which
 * would not fit in the "six new generation requests" budget and would add nothing.
 */
const RUN_SLUG = 'asset-pipeline-v2-apple-native-mps-improved-scene-2026-09-05';
const QUALITY_DIR = 'asset-pipeline-v2-apple-native-mps-quality-2026-09-05';
const BASELINE_DIR = 'asset-pipeline-v2-apple-native-mps-fixture-2026-09-05';
const STYLE = `Modern premium 2D side-view industrial sci-fi game asset. Futuristic underground metro. Orthographic side view. Crisp hard-edged silhouette, restrained graphite and gunmetal materials, cool overhead-left lighting, compact shadows, controlled detail, consistent 16px grid density. Semantic accents only: cyan for player and interaction, orange for hostile, amber for hazard. Contemporary clean production art, not retro pixel art. No text, photorealism, painterly scenery, bloom, random neon, noise, watermark, perspective view, or cropped subject.`;
const WORLD_THEME = 'futuristic underground metro / industrial sci-fi action game';
const STYLE_BIBLE_VERSION = 'metro-industrial-v1';

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

describe('pipeline v2 Apple-native MPS improved scene — selected candidates', () => {
  it('runs the three selected real assets through normalize/process/compile/validate/QA_REVIEW and assembles the Godot scene', () => {
    const root = process.cwd();
    const evidenceDir = join(root, 'test-artifacts', RUN_SLUG);
    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });

    const selections: Array<{ request: AssetRequestV2; sourcePath: string; provider: string; model: string; executionPath: RuntimeManifestEntryV2['generationExecutionPath'] }> = [
      {
        request: {
          id: 'metro_player_idle_steps20', category: 'player',
          runtimeUse: 'player character idle animation, isolated full body facing right; preserve exact costume, proportions, equipment, palette and ground anchor across the requested motion',
          artDirection: STYLE, seed: 940100, hostile: false, mode: 'LOCAL_ONLY', targetEngine: 'godot',
          project: { theme: WORLD_THEME }, visualBibleVersion: STYLE_BIBLE_VERSION,
          animation: { clip: 'idle', frameCount: 8, fps: 8, loop: true }, inferenceSteps: 20,
        },
        sourcePath: join(root, 'test-artifacts', QUALITY_DIR, 'metro_player_idle_steps20', 'source.png'),
        provider: 'diffusers', model: 'sd-1.5-apple-mps', executionPath: 'apple_native_mps',
      },
      {
        request: {
          id: 'metro_industrial_tiles', category: 'environment',
          runtimeUse: 'modular 8 by 6 Godot tile source family with floors walls ceilings corners transitions platforms supports panels damage trim hazards background wall and conduit integration',
          artDirection: STYLE, seed: 940301, mode: 'LOCAL_ONLY', targetEngine: 'godot',
          project: { theme: WORLD_THEME }, visualBibleVersion: STYLE_BIBLE_VERSION, inferenceSteps: 6,
        },
        sourcePath: join(root, 'test-artifacts', BASELINE_DIR, 'source/assets/tilesets/metro_industrial_tiles/source.source.png'),
        provider: 'diffusers', model: 'sd-1.5-apple-mps', executionPath: 'apple_native_mps',
      },
      {
        request: {
          id: 'metro_power_terminal_v3', category: 'prop',
          runtimeUse: 'a single isolated power terminal prop, not a repeating pattern, not a tile, not a texture, compact rectangular control panel housing with status lights and cable ports, centered on plain background',
          artDirection: 'Modern 2D industrial sci-fi game asset, orthographic side view, hard-edged silhouette, graphite and gunmetal materials, cool lighting, cyan and orange and amber accents, clean production art, not photorealistic.',
          seed: 940401, mode: 'LOCAL_ONLY', targetEngine: 'godot',
          project: { theme: WORLD_THEME }, visualBibleVersion: STYLE_BIBLE_VERSION, inferenceSteps: 20,
        },
        sourcePath: join(root, 'test-artifacts', QUALITY_DIR, 'metro_power_terminal_v3', 'source.png'),
        provider: 'diffusers', model: 'sd-1.5-apple-mps', executionPath: 'apple_native_mps',
      },
    ];

    const manifest: RuntimeManifestEntryV2[] = selections.map(({ request, sourcePath, provider, model, executionPath }) => {
      const sourceBuffer = readFileSync(sourcePath);
      const plan = buildAssetPlan(request);
      const normalized = normalizeAssetV2(sourceBuffer, plan);
      const processed = processAssetV2(plan, request, normalized);
      const compiled = compileAssetV2(plan, processed);
      const validation = validateAssetV2(plan, request, processed, compiled);
      expect(validation.passed, `${request.id} failed validation: ${JSON.stringify(validation.ruleResults)}`).toBe(true);

      const maturityFields = inferAssetMaturity({ fallbackGenerated: false, provider, critiquePassed: validation.passed, critiqueScore: validation.passed ? 100 : 0 });
      const entry: RuntimeManifestEntryV2 = {
        pipelineVersion: 'asset_pipeline_v2', assetId: request.id, category: plan.category,
        sourceAssetPath: plan.godotDestination.replace(/\.png$/, '.source.png'),
        normalizedAssetPath: plan.godotDestination.replace(/\.png$/, '.normalized.png'),
        compiledAssetPath: plan.godotDestination, runtimeResourcePath: compiled.godotResourcePath,
        dimensions: { width: compiled.compiledWidth, height: compiled.compiledHeight },
        animation: processed.frameCount && processed.frameCount > 1 ? { clip: processed.animationClip?.name ?? request.animation?.clip ?? 'default', frameCount: processed.frameCount, fps: processed.animationClip?.fps ?? processed.fps ?? 8, loop: processed.animationClip?.loop ?? request.animation?.loop ?? true } : undefined,
        godotResourceType: compiled.godotResourceType, seed: request.seed, provider, model,
        generationExecutionPath: executionPath, sourceHash: sha256(sourceBuffer), finalHash: sha256(compiled.compiledBuffer),
        requestHash: undefined, provenance: { backendType: 'local', backendId: provider, device: 'mps', durationMs: 0, timestamp: new Date().toISOString(), visualBibleVersion: STYLE_BIBLE_VERSION, effectiveParameters: { width: plan.finalWidth, height: plan.finalHeight, steps: request.inferenceSteps, scheduler: 'PNDM', guidance: 7.5 } },
        maturity: validation.passed ? maturityFields.maturity : 'REJECTED', sourceType: maturityFields.sourceType,
        productionReady: validation.passed && maturityFields.productionReady, validation,
        timings: { generationMs: 0, normalizationMs: 0, processingMs: 0, compilationMs: 0, totalMs: 0 },
        buffer: compiled.compiledBuffer, sourceBuffer, normalizedBuffer: normalized.buffer, extraResources: compiled.extraResources,
      };
      expect(entry.productionReady).toBe(false); // real generation, but no human review has occurred
      return entry;
    });

    // ---- Save source/generated evidence ----
    for (const entry of manifest) {
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
    writeFileSync(join(evidenceDir, 'master_contact_sheet.png'), assembleContactSheet(manifest.map((e) => ({ label: e.assetId, png: e.buffer }))));

    // ---- QA_REVIEW — human review still pending, never fabricate APPROVE ----
    const targets: QaPromotionTarget[] = manifest.map((entry) => ({ assetId: entry.assetId, category: entry.category, pipelineVersion: entry.pipelineVersion, sourceHash: entry.sourceHash, finalHash: entry.finalHash, runtimePath: entry.runtimeResourcePath, maturity: entry.maturity, productionReady: entry.productionReady }));
    const reviews = manifest.map((entry) => {
      const evaluation = buildAutomatedQaEvaluation({ assetId: entry.assetId, category: entry.category, pipelineVersion: entry.pipelineVersion, sourceHash: entry.sourceHash, finalHash: entry.finalHash, runtimePath: entry.runtimeResourcePath, evidence: { nativeScale: [], inContext: [] }, technicalValidationPassed: entry.validation.passed, currentHashMatchesFile: sha256(entry.buffer) === entry.finalHash, duplicateSource: false, evidenceExists: () => true });
      return createQaReviewRecord(evaluation, { reviewer: 'qa:pending-human-review', decision: 'NEEDS_REWORK', previousMaturity: entry.maturity, notes: 'Improved-scene candidate selected from the step-count/prompt-revision experiment. Automated pipeline evidence only — an explicit human reviewer must still judge silhouette, transparency, palette, and gameplay readability before any promotion.', reasonCodes: ['HUMAN_VISUAL_REVIEW_PENDING'] });
    });
    writeQaReviewHistory(evidenceDir, reviews);
    const promotions = targets.map((target, i) => promoteAssetThroughQa(target, reviews[i]));
    expect(promotions.every((p) => p.ok === false)).toBe(true);
    expect(reviews.every((r) => r.decision !== 'APPROVE')).toBe(true);
    writeFileSync(join(evidenceDir, 'qa_promotion_attempts.json'), JSON.stringify(promotions, null, 2));

    // ---- Project integration ----
    const projectDir = join(evidenceDir, 'godot-project');
    const roomIds = ['room_000'];
    const dna: GameDNA = { version: '0.1.0', archetype: 'SIDE_VIEW_METROIDVANIA', seed: 940000, profile: 'TINY_TEST', identity: { title: 'Apple-Native MPS Improved Scene', genre: 'Metroidvania', tone: 'metro-industrial', visualStyle: STYLE }, technical: { resolution: { width: 1280, height: 720 }, tileSize: 16, targetPlaytimeHours: 1, difficulty: 'normal' }, combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false }, movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 }, abilities: [], world: { biomeCount: 1, roomCount: 1 }, narrative: { premise: 'Fixture room for the improved Apple-native MPS scene.', protagonist: 'Warden', centralConflict: 'None — this is a pipeline validation fixture, not a game.' } };
    const worldGraph: WorldGraph = { version: '0.1.0', seed: dna.seed, nodes: roomIds.map((id) => ({ id, type: 'room' as const, label: id, metadata: {} })), edges: [], regions: [{ id: 'region_0', name: 'Fixture', biomeId: 'biome_0', roomIds }] };
    const progressionGraph: ProgressionGraph = { version: '0.1.0', seed: dna.seed, startNodeId: roomIds[0]!, endNodeId: roomIds[0]!, nodes: [], edges: [], abilities: [], criticalPath: roomIds };
    const textureFiles = new Map<string, Buffer>();
    for (const entry of manifest) {
      textureFiles.set(entry.compiledAssetPath, entry.buffer);
      for (const extra of entry.extraResources) textureFiles.set(extra.path, extra.contents);
    }
    const assembly = new GodotProjectAssembler().assemble({ outputDir: projectDir, gameDna: dna, worldGraph, progressionGraph, roomIds, textureFiles, assetMetadata: toLegacyAssetManifestEntries(manifest), gameContent: { enemies: [], bosses: [], quests: [], items: [], npcs: [], dialogues: [], shops: [] } });
    expect(assembly.success, assembly.errors.join('\n')).toBe(true);

    // ---- Runtime proof scene ----
    const positions: Record<string, [number, number]> = { metro_player_idle_steps20: [200, 400], metro_industrial_tiles: [500, 400], metro_power_terminal_v3: [800, 400] };
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
\tvar destination := ProjectSettings.globalize_path("res://qa/evidence/improved-scene-context.png")
\tDirAccess.make_dir_recursive_absolute(destination.get_base_dir())
\tvar error := image.save_png(destination)
\tprint("IMPROVED_SCENE_CAPTURE:", destination, ":", error)
\tget_tree().quit(0 if error == OK else 1)
`;
    mkdirSync(join(projectDir, 'scripts', 'test'), { recursive: true });
    writeFileSync(join(projectDir, 'scripts', 'test', 'ImprovedSceneCapture.gd'), captureScript);
    const proofScene = `[gd_scene load_steps=${manifest.length + 2} format=3]

[ext_resource type="Script" path="res://scripts/test/ImprovedSceneCapture.gd" id="capture_script"]
${extLines.join('\n')}

[node name="ImprovedSceneProof" type="Node2D"]
script = ExtResource("capture_script")

${nodeLines.join('\n\n')}
`;
    mkdirSync(join(projectDir, 'scenes', 'test'), { recursive: true });
    writeFileSync(join(projectDir, 'scenes', 'test', 'ImprovedSceneProof.tscn'), proofScene);

    const generationManifest = JSON.parse(readFileSync(join(projectDir, 'generation_manifest.json'), 'utf8')) as { artifacts: Array<{ pipelineVersion?: string; id?: string }> };
    const v2Artifacts = generationManifest.artifacts.filter((a) => a.pipelineVersion === 'asset_pipeline_v2');
    expect(v2Artifacts).toHaveLength(3);
    console.log(`Improved scene project assembled at: ${projectDir}`);
  });
});
