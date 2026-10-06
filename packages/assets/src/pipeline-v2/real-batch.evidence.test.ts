import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAssetPipelineV2 } from './orchestrator.js';
import { assembleContactSheet } from '../sprite-qa.js';
import type { AssetRequestV2 } from './types.js';
import { ImageProviderRegistry } from '../image-router.js';
import { DiffusersProvider } from '../providers/diffusers.js';

/**
 * Real 10-category asset-matrix batch run through pipeline v2 (request → plan → generation →
 * normalization → processing → compilation → validation → manifest — no shortcuts, no direct
 * provider calls). Produces the milestone's required evidence directory. Runs through the
 * deterministic procedural SourceGeneration fallback because this environment has no configured/
 * reachable real image provider (see /memories/repo/LOCAL_DIFFUSION_CONSTRAINT.md) — the code
 * path that would consult a real provider (ImageProviderRegistry.selectHealthy) is still the same
 * one `allowRealProvider: true` exercises in pipeline-v2.test.ts.
 */
describe('pipeline v2 — real 10-category asset matrix batch', () => {
  it('generates all 10 required categories, writes evidence artifacts, and produces a contact sheet', async () => {
    const useRealProvider = process.env.METROFORGE_PIPELINE_V2_REAL === '1';
    const provider = useRealProvider ? new DiffusersProvider({ device: 'openvino_gpu', modelId: 'sd-1.5' }) : undefined;
    const registry = useRealProvider ? new ImageProviderRegistry() : undefined;
    if (provider && registry) registry.register({ provider, local: true, priority: 100, costClass: 'local' });
    const artDirection = 'ancient overgrown mechanical ruins: ruined dark stone, oxidized machinery, moss, hanging vines, subtle teal energy, strong gameplay silhouettes, stylized 2D HD, side-view Metroidvania';
    const seedBase = 900000;

    const requests: AssetRequestV2[] = [
      { id: 'player', category: 'player', runtimeUse: 'playable character key-art + walk cycle', artDirection, seed: seedBase + 1, allowRealProvider: useRealProvider, mode: 'LOCAL_ONLY' },
      { id: 'enemy_rust_sentinel', category: 'enemy', runtimeUse: 'standard patrol enemy', artDirection, seed: seedBase + 2 },
      { id: 'boss_the_overgrown_core', category: 'boss', runtimeUse: 'area boss encounter', artDirection, seed: seedBase + 3, isFinalBoss: true },
      { id: 'npc_relic_keeper', category: 'npc', runtimeUse: 'friendly quest-giver NPC', artDirection, seed: seedBase + 4 },
      { id: 'biome_overgrown_ruins', category: 'environment', runtimeUse: 'ground/wall tileset', artDirection, seed: seedBase + 5 },
      { id: 'bg_ruins_far', category: 'background', runtimeUse: 'far parallax plate', artDirection, seed: seedBase + 6 },
      { id: 'pickup_energy_cell', category: 'pickup', runtimeUse: 'world pickup for Area2D', artDirection, seed: seedBase + 7 },
      { id: 'icon_dash_ability', category: 'ability_icon', runtimeUse: 'HUD ability slot icon', artDirection, seed: seedBase + 8 },
      { id: 'hud_health_meter', category: 'hud', runtimeUse: 'HUD health meter element', artDirection, seed: seedBase + 9 },
      { id: 'prop_broken_gantry', category: 'prop', runtimeUse: 'world decoration prop', artDirection, seed: seedBase + 10 },
    ];
    for (const request of requests) {
      request.allowRealProvider = useRealProvider;
      request.requireRealProvider = useRealProvider;
      request.mode = 'LOCAL_ONLY';
    }

    const { manifest, summary } = await runAssetPipelineV2(requests, {
      registry,
      distinctSourcePairs: [
        ['player', 'enemy_rust_sentinel'],
        ['player', 'npc_relic_keeper'],
        ['enemy_rust_sentinel', 'boss_the_overgrown_core'],
        ['pickup_energy_cell', 'icon_dash_ability'],
        ['biome_overgrown_ruins', 'bg_ruins_far'],
        ['hud_health_meter', 'icon_dash_ability'],
      ],
    });

    expect(summary.failed.length).toBe(0);
    expect(manifest.length).toBe(10);
    expect(new Set(manifest.map((m) => m.category)).size).toBe(10);
    expect(summary.distinctSourceChecks.every((c) => c.distinct)).toBe(true);
    const artifactDir = join(process.cwd(), 'test-artifacts', useRealProvider ? 'asset-pipeline-v2' : 'asset-pipeline-v2-offline');
    const rawDir = join(artifactDir, 'raw');
    const normalizedDir = join(artifactDir, 'normalized');
    const generatedDir = join(artifactDir, 'generated');
    mkdirSync(rawDir, { recursive: true });
    mkdirSync(normalizedDir, { recursive: true });
    mkdirSync(generatedDir, { recursive: true });
    if (useRealProvider) {
      writeFileSync(join(artifactDir, 'real_provider_diagnostics.json'), JSON.stringify(manifest.map((entry) => ({ id: entry.assetId, provider: entry.provider, model: entry.model, executionPath: entry.generationExecutionPath })), null, 2));
    }

    for (const entry of manifest) {
      const fileName = entry.compiledAssetPath.replace(/[\\/]/g, '__');
      writeFileSync(join(rawDir, `${entry.assetId}.png`), entry.sourceBuffer);
      writeFileSync(join(normalizedDir, `${entry.assetId}.png`), entry.normalizedBuffer);
      writeFileSync(join(generatedDir, fileName), entry.buffer);
      for (const extra of entry.extraResources) {
        writeFileSync(join(generatedDir, extra.path.replace(/[\\/]/g, '__')), extra.contents);
      }
    }

    writeFileSync(join(artifactDir, 'pipeline_summary.json'), JSON.stringify(summary, null, 2));

    // Contact sheet: single representative frame per category (first frame of any sheet).
    const contactFrames = manifest.map((entry) => ({
      label: entry.assetId,
      png: entry.category === 'player' || entry.category === 'enemy' || entry.category === 'boss' || entry.category === 'npc'
        ? entry.buffer.subarray(0) // sheets are horizontal strips; full sheet is still a valid representative frame for review
        : entry.buffer,
    }));
    // assembleContactSheet requires uniform-decodable PNGs; character sheets (multi-frame strips)
    // are wider than single-frame assets, which is fine — assembleContactSheet sizes cells to the
    // widest/tallest input automatically.
    const contactSheet = assembleContactSheet(contactFrames);
    writeFileSync(join(artifactDir, 'asset_pipeline_v2_contact_sheet.png'), contactSheet);

    expect(manifest.every((m) => m.pipelineVersion === 'asset_pipeline_v2')).toBe(true);
    if (useRealProvider) {
      const diagnostics = JSON.stringify(manifest.map((entry) => ({ id: entry.assetId, provider: entry.provider, path: entry.generationExecutionPath })));
      expect(manifest.every((entry) => entry.generationExecutionPath === 'direct_openvino_persistent'), diagnostics).toBe(true);
      expect(manifest.every((entry) => entry.provider === 'diffusers'), diagnostics).toBe(true);
    }
    await provider?.unloadOpenVinoRuntime();
  }, process.env.METROFORGE_PIPELINE_V2_REAL === '1' ? 3_600_000 : 30_000);
});
