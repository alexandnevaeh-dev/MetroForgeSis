import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { GameDNA } from '@metroforge/schemas';
import { AssetPipeline } from './asset-pipeline.js';
import { buildCanopyActorFamily } from './topdown-canopy-art.js';

const fake = vi.hoisted(() => ({ requests: [] as string[] }));
vi.mock('./foundry/register.js', () => ({
  registerFoundryImageProviders(registry: { register: (entry: unknown) => void }) {
    registry.register({ local: false, priority: 100, costClass: 'free', provider: {
      id: 'healthy-test-image-provider',
      checkHealth: async () => true,
      async generateImage(request: { prompt: string; width: number; height: number }) {
        fake.requests.push(request.prompt);
        const { generateProceduralSprite } = await import('./png.js');
        return { image: generateProceduralSprite({ id: 'provider-test', width: request.width,
          height: request.height, fill: [66, 130, 118, 255], accent: [238, 184, 102, 255], shape: 'humanoid' }),
          provider: 'healthy-test-image-provider', modelId: 'test-only', seed: 42,
          fallbackGenerated: false };
      },
    } });
  },
}));

describe('woodland animation cohesion with an available image provider', () => {
  it('keeps complete original posed families and terrain while using the provider for other artwork', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'metroforge-canopy-provider-'));
    const dna = JSON.parse(readFileSync(new URL('./fixtures/canopy-game-dna.json', import.meta.url), 'utf8')) as GameDNA;
    try {
      const result = await new AssetPipeline().generate({ gameDna: dna, profile: 'TINY_TEST',
        seed: 42, outputDir, skipVlm: true, mode: 'HYBRID_FREE' });
      expect(fake.requests.length).toBeGreaterThan(0);
      for (const [id, kind, folder] of [
        ['player', 'hero', 'characters'], ['melee', 'melee', 'enemies'],
        ['ranged', 'ranged', 'enemies'], ['boss_final', 'boss', 'bosses'],
      ] as const) {
        const expected = buildCanopyActorFamily(kind, kind === 'hero');
        for (const clip of ['idle', 'walk', 'run', 'attack', 'hurt', 'death']) {
          expect(readFileSync(join(outputDir, `assets/${folder}/${id}_${clip}.png`))
            .equals(expected.sheets.get(clip)!)).toBe(true);
        }
        const actor = result.assets.find(asset => asset.id === id)!;
        expect(actor.productionReady).toBe(false);
        expect(actor.maturity).toBe('QA_REVIEW');
      }
      expect(result.assets.find(asset => asset.id === 'tileset_biome_0')?.provider)
        .toBe('metroforge-canopy-procedural-v2');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 60_000);
});
