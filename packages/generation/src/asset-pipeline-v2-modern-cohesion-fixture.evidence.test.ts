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
  DiffusersProvider,
  type AssetRequestV2,
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
 * Locked modern-cohesion visual bible — copied verbatim from
 * packages/assets/src/pipeline-v2/modern-cohesion.evidence.test.ts, the production batch's
 * source of truth for the "metro-industrial-v1" style. This fixture exercises a minimal 3-asset
 * slice of that exact locked spec (same style text, same seed-numbering rule, same request IDs
 * for the assets it reuses) — it does not define a second, competing bible. If the production
 * bible ever changes, update both copies together.
 */
const STYLE_BIBLE = {
  version: 'metro-industrial-v1', worldTheme: 'futuristic underground metro / industrial sci-fi action game',
  cameraPerspective: 'orthographic side view, no vanishing-point shifts', targetAssetScale: '16 px tile grid; 64 px character frame',
  characterScale: 'player 52–58 px apparent height in a 64 px frame', enemyScale: 'robot 42–56 px apparent height in a 64 px frame', tileDimensions: [16, 16],
  silhouetteRules: ['large readable primary masses', 'cyan player accents', 'orange hostile accents', 'no loose micro-parts'],
  edgeTreatment: 'crisp antialiased hard edges, dark blue-gray separation edge, no pixel-noise halo',
  lightingDirection: 'cool overhead-left key', shadowTreatment: 'compact cool occlusion shadows; no long baked floor shadows',
  materialVocabulary: ['graphite structural steel', 'brushed gunmetal panels', 'matte black polymer', 'cyan emissive transit glass', 'amber hazard ceramic'],
  paletteRoles: { void: '#10151d', structure: '#263441', steel: '#526675', playerAccent: '#39d8df', hostileAccent: '#f28a45', hazard: '#e8b84f', ui: '#b9edf0' },
  accentColorRules: 'cyan means player/interactive; orange means hostile; amber means hazard', saturationLimits: 'high saturation only on semantic accents, under 15% image area',
  contrastHierarchy: ['player and threats', 'interactables and hazards', 'foreground structure', 'background atmosphere'], detailDensityRules: 'detail concentrated at face/tool/interface; broad quiet structural masses elsewhere',
  backgroundVersusGameplayContrast: 'background two value bands lower and lower saturation than collision/gameplay layer',
  animationPrinciples: ['bottom-center anchor', 'preserve equipment and body volume', 'anticipation before attack', '2–3 frame effect decay'],
  vfxPrinciples: ['transparent canvas', 'compact hit origin', 'cyan player energy', 'orange enemy destruction', 'never obscure full character silhouette'],
  forbiddenVisualTraits: ['photorealism', 'painterly concept backgrounds', 'baked text', 'random palette shifts', 'excess glow', 'bloom', 'noise', 'perspective drift', 'fake screenshots'],
} as const;
const STYLE = `Modern premium 2D side-view industrial sci-fi game asset. Futuristic underground metro. Orthographic side view. Crisp hard-edged silhouette, restrained graphite and gunmetal materials, cool overhead-left lighting, compact shadows, controlled detail, consistent 16px grid density. Semantic accents only: cyan for player and interaction, orange for hostile, amber for hazard. Contemporary clean production art, not retro pixel art. No text, photorealism, painterly scenery, bloom, random neon, noise, watermark, perspective view, or cropped subject.`;

/** Unique run slug for this fixture — never reuses or overwrites the production batch's
 *  evidence at test-artifacts/asset-pipeline-v2-modern-cohesion(-offline), the generic 10-asset
 *  Godot proof at test-artifacts/asset-pipeline-v2(-offline), or any prior run of this same
 *  fixture (this exact slug did not exist before this run). */
const RUN_SLUG = 'asset-pipeline-v2-modern-cohesion-fixture-2026-09-04';

/**
 * Smallest meaningful modern-asset fixture set: one player, one environment/tile family, one
 * gameplay prop. IDs, seeds, category, runtimeUse, and artDirection are lifted unmodified from
 * the locked production request list (modern-cohesion.evidence.test.ts's `requests()`) — this is
 * a deterministic subset of the real production spec, not an ad hoc invention. Negative prompts,
 * dimensions, scheduler, guidance, and steps are intentionally NOT set here — they are derived by
 * the unmodified planner (`buildAssetPlan`) / generation spec builder
 * (`buildGenerationSpecification`) exactly as production does, so this fixture cannot silently
 * drift from the locked defaults (steps=6, scheduler=PNDM, guidance=7.5, category-specific
 * negative prompts) by omission.
 */
function fixtureRequests(real: boolean): AssetRequestV2[] {
  const common = {
    artDirection: STYLE,
    allowRealProvider: real,
    requireRealProvider: real,
    mode: 'LOCAL_ONLY' as const,
    targetEngine: 'godot' as const,
    project: { theme: STYLE_BIBLE.worldTheme },
    visualBibleVersion: STYLE_BIBLE.version,
  };
  return [
    {
      ...common,
      id: 'metro_player_idle',
      category: 'player',
      runtimeUse: 'player character idle animation, isolated full body facing right; preserve exact costume, proportions, equipment, palette and ground anchor across the requested motion',
      seed: 940100,
      hostile: false,
      animation: { clip: 'idle', frameCount: 8, fps: 8, loop: true },
    },
    {
      ...common,
      id: 'metro_industrial_tiles',
      category: 'environment',
      runtimeUse: 'modular 8 by 6 Godot tile source family with floors walls ceilings corners transitions platforms supports panels damage trim hazards background wall and conduit integration',
      seed: 940301,
    },
    {
      ...common,
      id: 'metro_power_terminal',
      category: 'prop',
      runtimeUse: 'metro power terminal isolated side-view prop',
      seed: 940401,
    },
  ] satisfies AssetRequestV2[];
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

describe('pipeline v2 modern-cohesion — isolated 3-asset test project', () => {
  it('runs generate→normalize→process→compile→validate→QA_REVIEW→project-integration on a locked minimal fixture set', async () => {
    const real = process.env.METROFORGE_MODERN_COHESION_REAL === '1';
    const provider = real ? new DiffusersProvider({ device: 'openvino_gpu', modelId: 'sd-1.5', generationTimeoutMs: 900_000, warmupTimeoutMs: 900_000 }) : undefined;
    const registry = real ? new ImageProviderRegistry() : undefined;
    if (provider && registry) registry.register({ provider, local: true, priority: 100, costClass: 'local' });

    const requests = fixtureRequests(real);
    const evidenceDir = join(process.cwd(), 'test-artifacts', real ? RUN_SLUG : `${RUN_SLUG}-offline`);
    // RUN_SLUG is unique against every OTHER evidence directory in the repo (the production
    // batch, the generic 10-asset Godot proof, any earlier run of this task) — it is never reused
    // for anything else. Within its own re-runs (e.g. CI re-executing this same test file) it is
    // regenerable scratch output, so it's cleared and rewritten each run rather than accumulating
    // stale files or failing on a second invocation — the same convention
    // asset-pipeline-v2-godot.evidence.test.ts already uses for its own fixed-name output dir.
    rmSync(evidenceDir, { recursive: true, force: true });
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(evidenceDir, 'visual_bible.json'), JSON.stringify(STYLE_BIBLE, null, 2));
    writeFileSync(join(evidenceDir, 'fixture_specifications.json'), JSON.stringify(requests, null, 2));

    const { manifest, summary } = await runAssetPipelineV2(requests, {
      registry,
      distinctSourcePairs: [
        ['metro_player_idle', 'metro_power_terminal'],
        ['metro_industrial_tiles', 'metro_power_terminal'],
      ],
    });

    // ---- Category / model / hash integrity — no silent substitution ----
    expect(summary.failed).toEqual([]);
    expect(manifest).toHaveLength(3);
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i]!;
      const entry = manifest.find((e) => e.assetId === request.id);
      expect(entry, `manifest entry missing for ${request.id}`).toBeDefined();
      expect(entry!.category).toBe(request.category);
      expect(entry!.seed).toBe(request.seed);
      expect(entry!.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(entry!.finalHash).toMatch(/^[0-9a-f]{64}$/);
      expect(entry!.validation.passed).toBe(true);
      if (real) {
        // A real run must actually have used the locked production model — never a substitute.
        expect(entry!.provider).toBe('diffusers');
        expect(entry!.model).toBe('sd-1.5');
        expect(entry!.generationExecutionPath).toBe('direct_openvino_persistent');
      } else {
        // No configured real backend in this environment: honestly procedural, never disguised
        // as a successful generation.
        expect(entry!.provider).toBe('procedural');
        expect(entry!.generationExecutionPath).toBe('procedural_fallback');
        expect(entry!.maturity).toBe('PLACEHOLDER');
        expect(entry!.productionReady).toBe(false);
      }
    }
    expect(summary.distinctSourceChecks.every((c) => c.distinct)).toBe(true);

    // Determinism: re-running the identical request set reproduces identical source bytes.
    const rerun = await runAssetPipelineV2(fixtureRequests(real), { registry });
    for (const entry of manifest) {
      const again = rerun.manifest.find((e) => e.assetId === entry.assetId)!;
      expect(sha256(again.sourceBuffer)).toBe(sha256(entry.sourceBuffer));
    }

    // ---- Write pipeline-stage evidence (generate/normalize/process/compile outputs) ----
    for (const entry of manifest) {
      const files: Array<[string, Buffer]> = [
        [join('generated', entry.compiledAssetPath), entry.buffer],
        [join('source', entry.sourceAssetPath), entry.sourceBuffer],
        [join('normalized', String(entry.normalizedAssetPath)), entry.normalizedBuffer],
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
    mkdirSync(join(evidenceDir, 'manifests'), { recursive: true });
    writeFileSync(join(evidenceDir, 'manifests', 'pipeline_summary.json'), JSON.stringify(summary, null, 2));

    // ---- Cohesion / temporal QA (existing analyzers, reused unmodified) ----
    const player = manifest.find((e) => e.category === 'player')!;
    const tiles = manifest.find((e) => e.category === 'environment')!;
    const animationQa = analyzeAnimationTemporal(player.buffer, player.dimensions.width / (player.animation?.frameCount ?? 1), player.animation?.frameCount ?? 1);
    const tileQa = analyzeTilesetAdjacency(tiles.buffer, 16);
    const cohesion = analyzeFamilyCohesion(manifest.map((e) => ({ id: e.assetId, png: e.buffer })));
    mkdirSync(join(evidenceDir, 'qa'), { recursive: true });
    writeFileSync(join(evidenceDir, 'qa', 'automated_family_qa.json'), JSON.stringify({ animationQa, tileQa, cohesion }, null, 2));
    writeFileSync(join(evidenceDir, 'master_contact_sheet.png'), assembleContactSheet(manifest.map((e) => ({ label: e.assetId, png: e.buffer }))));

    // ---- QA_REVIEW stage (packages/generation/src/asset-qa.ts, reused unmodified) ----
    // Every asset here is PLACEHOLDER maturity (offline run) — QA_REVIEW-only promotion must
    // refuse them, and no reviewer decision here is ever APPROVE. Preserves the hash-bound,
    // human-gated promotion contract; nothing here fabricates approval.
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
        notes: 'Offline fixture run: procedural placeholder source, no real generation occurred. Automated evidence only — an explicit human reviewer must still judge this asset before any promotion.',
        reasonCodes: real ? [] : ['PLACEHOLDER_SOURCE_NOT_ELIGIBLE_FOR_REVIEW'],
      });
    });
    writeQaReviewHistory(evidenceDir, reviews);
    const promotions = targets.map((target, i) => promoteAssetThroughQa(target, reviews[i]));
    // The gate must refuse every one of these — PLACEHOLDER maturity is never QA_REVIEW-eligible,
    // and no review here carries an APPROVE decision.
    expect(promotions.every((p) => p.ok === false)).toBe(true);
    writeFileSync(join(evidenceDir, 'qa', 'qa_promotion_attempts.json'), JSON.stringify(promotions, null, 2));

    // ---- Project integration: assemble a real, isolated Godot project ----
    const projectDir = join(evidenceDir, 'godot-project');
    const roomIds = ['room_000'];
    const dna: GameDNA = {
      version: '0.1.0', archetype: 'SIDE_VIEW_METROIDVANIA', seed: 940000, profile: 'TINY_TEST',
      identity: { title: 'Modern Cohesion Fixture', genre: 'Metroidvania', tone: 'metro-industrial', visualStyle: STYLE },
      technical: { resolution: { width: 1280, height: 720 }, tileSize: 16, targetPlaytimeHours: 1, difficulty: 'normal' },
      combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
      movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
      abilities: [],
      world: { biomeCount: 1, roomCount: 1 },
      narrative: { premise: 'Fixture room for the modern-cohesion asset pipeline test project.', protagonist: 'Warden', centralConflict: 'None — this is a pipeline validation fixture, not a game.' },
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

    // ---- Runtime proof scene: every asset visible as a real node, plus a viewport-capture
    //      script (reused from test-artifacts/asset-pipeline-v2/fresh-godot-project's
    //      AssetQaEvidence.gd pattern) so the runtime smoke test can prove visibility without
    //      depending on OS-level screen-recording permission. Run this scene with a real
    //      (non-headless) Godot instance, e.g. `godot --path <project> --windowed
    //      res://scenes/test/ModernCohesionFixtureProof.tscn --quit-after 60` — `--headless`
    //      leaves get_viewport().get_texture() null (the dummy render driver has no framebuffer
    //      to read back), which aborts the script before it reaches get_tree().quit() and hangs
    //      the process. `--headless --import` (no scene argument) is still the right way to
    //      populate the .godot/imported/ cache first; only the capture run itself needs a real
    //      renderer. ----
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
        // Texture2D (prop), or the environment's TileSet whose runtimeResourcePath is a
        // terrain.tres, not a directly-displayable texture — reference the compiled atlas PNG
        // directly instead, purely so the environment asset is visibly on-screen too.
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
\tvar destination := ProjectSettings.globalize_path("res://qa/evidence/modern-cohesion-fixture-context.png")
\tDirAccess.make_dir_recursive_absolute(destination.get_base_dir())
\tvar error := image.save_png(destination)
\tprint("MODERN_COHESION_FIXTURE_CAPTURE:", destination, ":", error)
\tget_tree().quit(0 if error == OK else 1)
`;
    mkdirSync(join(projectDir, 'scripts', 'test'), { recursive: true });
    writeFileSync(join(projectDir, 'scripts', 'test', 'ModernCohesionFixtureCapture.gd'), captureScript);
    const proofScene = `[gd_scene load_steps=${manifest.length + 2} format=3]

[ext_resource type="Script" path="res://scripts/test/ModernCohesionFixtureCapture.gd" id="capture_script"]
${extLines.join('\n')}

[node name="ModernCohesionFixtureProof" type="Node2D"]
script = ExtResource("capture_script")

${nodeLines.join('\n\n')}
`;
    mkdirSync(join(projectDir, 'scenes', 'test'), { recursive: true });
    writeFileSync(join(projectDir, 'scenes', 'test', 'ModernCohesionFixtureProof.tscn'), proofScene);
    writeFileSync(join(evidenceDir, 'asset_pipeline_v2_runtime_manifest.json'), JSON.stringify(summary, null, 2));

    // ---- Verify project-integration output on disk ----
    const generationManifest = JSON.parse(readFileSync(join(projectDir, 'generation_manifest.json'), 'utf8')) as { artifacts: Array<{ pipelineVersion?: string; id?: string }> };
    const v2Artifacts = generationManifest.artifacts.filter((a) => a.pipelineVersion === 'asset_pipeline_v2');
    expect(v2Artifacts).toHaveLength(3);
    expect(new Set(v2Artifacts.map((a) => a.id))).toEqual(new Set(['metro_player_idle', 'metro_industrial_tiles', 'metro_power_terminal']));
    const sceneText = readFileSync(join(projectDir, 'scenes', 'test', 'ModernCohesionFixtureProof.tscn'), 'utf8');
    for (const entry of manifest) expect(sceneText).toContain(entry.assetId);

    await provider?.unloadOpenVinoRuntime();
  }, process.env.METROFORGE_MODERN_COHESION_REAL === '1' ? 30 * 60 * 1000 : 60_000);
});
