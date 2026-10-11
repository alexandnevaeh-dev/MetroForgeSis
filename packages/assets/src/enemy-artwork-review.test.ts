import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { GameDNASchema } from '@metroforge/schemas';
import { AssetPipeline, type AssetPipelineOptions } from './asset-pipeline.js';
import type { EnemyVisualDefinition } from './enemy-visual-plan.js';

const caster: EnemyVisualDefinition = { id: 'enemy_007', name: 'Ashen Librarian', movement: 'teleport', combat: { type: 'burst', cooldown: 1.5 } };
function options(): AssetPipelineOptions {
  const input = JSON.parse(readFileSync(new URL('./fixtures/canopy-game-dna.json', import.meta.url), 'utf8'));
  input.archetype = 'SIDE_VIEW_METROIDVANIA'; input.identity.title = 'Enemy family review';
  mkdirSync('E:/MetroForgeData/TestArtifacts', { recursive: true });
  return { gameDna: GameDNASchema.parse(input), profile: 'TINY_TEST', seed: 42,
    outputDir: mkdtempSync('E:/MetroForgeData/TestArtifacts/enemy-family-'), visualMode: 'procedural-only', skipVlm: true, enemies: [caster] };
}

describe('named enemy family review and resume', () => {
  it('keeps all generic named clips unapproved and resumes metadata and bytes without regeneration', async () => {
    const request = options(); const pipeline = new AssetPipeline(); const result = await pipeline.generate(request);
    const clips = ['walk', 'run', 'hurt', 'death', 'attack'];
    for (const id of [caster.id, ...clips.map(clip => `${caster.id}_${clip}`)]) {
      const asset = result.assets.find(a => a.id === id)!;
      expect(asset, id).toBeDefined(); expect(asset.fallbackGenerated, id).toBe(true);
      expect(asset.maturity, id).toBe('PLACEHOLDER'); expect(asset.productionReady, id).toBe(false);
      expect(asset.productionAllowed, id).toBe(false); expect(asset.proceduralProduction, id).toBe(false);
    }
    const manifest = { artifacts: result.assets.map(({ buffer, ...asset }) => asset) };
    for (const asset of result.assets) { const path = request.outputDir + '/' + asset.path; mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, asset.buffer); }
    writeFileSync(request.outputDir + '/generation_manifest.json', JSON.stringify(manifest));
    const emitted: string[] = [];
    const resumed = await pipeline.generate({ ...request, resume: true, onArtifact: a => emitted.push(a.id) });
    expect(resumed.warnings.join(' ')).toContain('skipped regeneration');
    expect(emitted).toEqual(result.assets.map(a => a.id)); expect(resumed.degraded).toBe(true);
    for (const asset of result.assets) {
      const copy = resumed.assets.find(a => a.id === asset.id)!;
      expect(copy.buffer.equals(asset.buffer), asset.id).toBe(true);
      expect(copy.executionMetadata, asset.id).toEqual(asset.executionMetadata);
      expect(copy.productionAllowed, asset.id).toBe(asset.productionAllowed);
    }
    const originalManifest = readFileSync(request.outputDir + '/generation_manifest.json');
    for (const changed of [{ ...caster, name: 'Different Scribe' }, { ...caster, movement: 'patrol' as const }, { ...caster, combat: { type: 'beam' as const } }]) {
      emitted.length = 0;
      await expect(pipeline.generate({ ...request, enemies: [changed], resume: true, onArtifact: a => emitted.push(a.id) })).rejects.toThrow('Cached artwork identity does not match');
      expect(emitted).toEqual([]); expect(readFileSync(request.outputDir + '/generation_manifest.json').equals(originalManifest)).toBe(true);
    }
    const root = manifest.artifacts.find(a => a.id === caster.id)!; delete root.executionMetadata;
    writeFileSync(request.outputDir + '/generation_manifest.json', JSON.stringify(manifest)); emitted.length = 0;
    await expect(pipeline.generate({ ...request, resume: true, onArtifact: a => emitted.push(a.id) })).rejects.toThrow('Cached artwork identity does not match');
    expect(emitted).toEqual([]);
    renameSync(request.outputDir + '/assets/enemies/enemy_007_walk.png', request.outputDir + '/assets/enemies/enemy_007_walk.missing.png');
    await expect(pipeline.generate({ ...request, resume: true, onArtifact: a => emitted.push(a.id) })).rejects.toThrow('checkpoint is incomplete');
    expect(emitted).toEqual([]);
    renameSync(request.outputDir + '/generation_manifest.json', request.outputDir + '/generation_manifest.preserved.json');
    await expect(pipeline.generate({ ...request, resume: true })).rejects.toThrow('checkpoint is incomplete');
  }, 60000);

  it.each([undefined, null, 7])('rejects a non-string ID %s before writes', async id => {
    const request = options();
    await expect(new AssetPipeline().generate({ ...request, enemies: [{ ...caster, id } as unknown as EnemyVisualDefinition] })).rejects.toThrow('unique safe');
    expect(existsSync(request.outputDir + '/assets')).toBe(false);
  });
});
