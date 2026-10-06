import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import { runAssetPipelineV2, toLegacyAssetManifestEntries, type AssetRequestV2, type RuntimeManifestEntryV2, type PipelineSummaryV2 } from '@metroforge/assets';
import { GodotProjectAssembler } from '@metroforge/godot';

const ART = 'ancient overgrown mechanical ruins, ruined dark stone, oxidized machinery, moss, hanging vines, subtle teal energy, strong silhouettes, stylized 2D HD side-view Metroidvania, no text';

describe('asset pipeline v2 — fresh Godot project evidence', () => {
  it('feeds all ten runtime-manifest assets through the Metroforge assembler', async () => {
    const requests: AssetRequestV2[] = [
      ['player', 'player', 'playable animated character'], ['enemy_rust_sentinel', 'enemy', 'standard patrol enemy'],
      ['boss_overgrown_core', 'boss', 'final boss'], ['npc_relic_keeper', 'npc', 'friendly NPC'],
      ['biome_overgrown_ruins', 'environment', 'terrain tiles'], ['bg_ruins_far', 'background', 'far parallax'],
      ['pickup_energy_cell', 'pickup', 'Area2D collectible'], ['icon_dash', 'ability_icon', 'ability icon'],
      ['hud_health', 'hud', 'HUD element'], ['prop_gantry', 'prop', 'world decoration'],
    ].map(([id, category, runtimeUse], index) => ({
      id: id!, category: category as AssetRequestV2['category'], runtimeUse: runtimeUse!, artDirection: ART,
      seed: 910001 + index, isFinalBoss: category === 'boss',
    }));
    const evidenceDir = join(process.cwd(), 'test-artifacts', 'asset-pipeline-v2');
    let manifest: RuntimeManifestEntryV2[];
    let summary: PipelineSummaryV2;
    if (process.env.METROFORGE_PIPELINE_V2_USE_EVIDENCE === '1') {
      summary = JSON.parse(readFileSync(join(evidenceDir, 'pipeline_summary.json'), 'utf8')) as PipelineSummaryV2;
      manifest = summary.assets.map((asset) => {
        const flat = (path: string) => join(evidenceDir, 'generated', path.replace(/[\\/]/g, '__'));
        const extraPaths = asset.category === 'environment'
          ? [asset.compiledPath.replace(/source\.png$/, 'terrain.tres')]
          : ['player', 'enemy', 'boss', 'npc'].includes(asset.category)
            ? [asset.compiledPath.replace(/\.png$/, '.tres')]
            : [];
        const extras = extraPaths.filter((path) => existsSync(flat(path))).map((path) => ({ path, contents: readFileSync(flat(path)) }));
        return {
          pipelineVersion: asset.pipelineVersion, assetId: asset.id, category: asset.category,
          sourceAssetPath: asset.sourcePath, normalizedAssetPath: asset.normalizedPath,
          compiledAssetPath: asset.compiledPath, runtimeResourcePath: asset.runtimeResourcePath,
          dimensions: asset.dimensions, godotResourceType: extras.some((e) => e.path.endsWith('.tres')) && asset.category !== 'environment' ? 'SpriteFrames' : asset.category === 'environment' ? 'TileSet' : 'Texture2D',
          seed: asset.seed, provider: asset.provider, model: asset.model,
          generationExecutionPath: asset.generationExecutionPath, sourceHash: asset.sourceHash, finalHash: asset.finalHash,
          maturity: asset.maturity, sourceType: 'ai_generated', productionReady: false,
          validation: { passed: asset.validationPassed, ruleResults: [] },
          timings: { generationMs: asset.generationTimeMs, normalizationMs: asset.normalizationTimeMs, processingMs: asset.processingTimeMs, compilationMs: asset.compilationTimeMs, totalMs: asset.totalTimeMs },
          buffer: readFileSync(flat(asset.compiledPath)), sourceBuffer: readFileSync(join(evidenceDir, 'raw', `${asset.id}.png`)), normalizedBuffer: readFileSync(join(evidenceDir, 'normalized', `${asset.id}.png`)), extraResources: extras,
        } satisfies RuntimeManifestEntryV2;
      });
    } else {
      ({ manifest, summary } = await runAssetPipelineV2(requests));
    }
    expect(summary.failed).toEqual([]);

    const outputDir = join(process.cwd(), 'test-artifacts', process.env.METROFORGE_PIPELINE_V2_USE_EVIDENCE === '1' ? 'asset-pipeline-v2' : 'asset-pipeline-v2-offline', 'fresh-godot-project');
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });
    const roomIds = ['room_000', 'room_001', 'room_002'];
    const dna: GameDNA = {
      version: '0.1.0', archetype: 'SIDE_VIEW_METROIDVANIA', seed: 910000, profile: 'TINY_TEST',
      identity: { title: 'Overgrown Machine Ruins V2', genre: 'Metroidvania', tone: 'ancient mechanical', visualStyle: ART },
      technical: { resolution: { width: 1280, height: 720 }, tileSize: 16, targetPlaytimeHours: 1, difficulty: 'normal' },
      combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
      movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
      abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
      world: { biomeCount: 1, roomCount: 3 },
      narrative: { premise: 'Restore the ruin core.', protagonist: 'Warden', centralConflict: 'The ruin is awakening.' },
    };
    const worldGraph: WorldGraph = {
      version: '0.1.0', seed: dna.seed,
      nodes: roomIds.map((id) => ({ id, type: 'room' as const, label: id, metadata: {} })),
      edges: [{ id: 'e0', from: roomIds[0]!, to: roomIds[1]!, requirements: [], optional: false, bidirectional: true }, { id: 'e1', from: roomIds[1]!, to: roomIds[2]!, requirements: [], optional: false, bidirectional: true }],
      regions: [{ id: 'region_0', name: 'Ruins', biomeId: 'biome_0', roomIds }],
    };
    const progressionGraph: ProgressionGraph = { version: '0.1.0', seed: dna.seed, startNodeId: roomIds[0]!, endNodeId: roomIds[2]!, nodes: [], edges: [], abilities: ['dash'], criticalPath: roomIds };
    const textureFiles = new Map<string, Buffer>();
    for (const entry of manifest) {
      textureFiles.set(entry.compiledAssetPath, entry.buffer);
      // Existing terrain.tres syntax is intentionally retained and addresses biome_0. Keep this
      // single compatibility alias at the assembler boundary until project generation consumes
      // arbitrary v2 environment IDs directly.
      if (entry.category === 'environment') {
        textureFiles.set('assets/tilesets/biome_0/source.png', entry.buffer);
      }
      for (const extra of entry.extraResources) textureFiles.set(extra.path, extra.contents);
    }
    const result = new GodotProjectAssembler().assemble({
      outputDir, gameDna: dna, worldGraph, progressionGraph, roomIds, textureFiles,
      assetMetadata: toLegacyAssetManifestEntries(manifest),
      gameContent: { enemies: [], bosses: [], quests: [], items: [], npcs: [], dialogues: [], shops: [] },
    });
    expect(result.success, result.errors.join('\n')).toBe(true);

    const ext = manifest.map((entry, index) => `[ext_resource type="${entry.godotResourceType}" path="res://${entry.runtimeResourcePath}" id="${index + 1}_${entry.assetId}"]`).join('\n');
    const nodes = manifest.map((entry, index) => entry.godotResourceType === 'SpriteFrames'
      ? `[node name="${entry.assetId}" type="AnimatedSprite2D" parent="."]\nsprite_frames = ExtResource("${index + 1}_${entry.assetId}")`
      : entry.godotResourceType === 'Texture2D'
        ? `[node name="${entry.assetId}" type="Sprite2D" parent="."]\ntexture = ExtResource("${index + 1}_${entry.assetId}")`
        : '').filter(Boolean).join('\n\n');
    const proofScene = `[gd_scene load_steps=${manifest.length + 1} format=3]\n\n${ext}\n\n[node name="AssetPipelineV2Proof" type="Node2D"]\n\n${nodes}\n`;
    mkdirSync(join(outputDir, 'scenes', 'test'), { recursive: true });
    writeFileSync(join(outputDir, 'scenes', 'test', 'AssetPipelineV2Proof.tscn'), proofScene);
    writeFileSync(join(outputDir, 'asset_pipeline_v2_runtime_manifest.json'), JSON.stringify(summary, null, 2));

    const generationManifest = JSON.parse(readFileSync(join(outputDir, 'generation_manifest.json'), 'utf8')) as { artifacts: Array<{ pipelineVersion?: string }> };
    expect(generationManifest.artifacts.filter((a) => a.pipelineVersion === 'asset_pipeline_v2')).toHaveLength(10);
    expect(readFileSync(join(outputDir, 'scenes', 'test', 'AssetPipelineV2Proof.tscn'), 'utf8')).toContain(manifest.find((entry) => entry.category === 'boss')!.assetId);
  });
});
