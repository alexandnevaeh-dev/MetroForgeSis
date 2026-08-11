import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AssetPipeline } from '../src/asset-pipeline.js';
import type { GameDNA } from '@metroforge/schemas';

const minimalDna: GameDNA = {
  version: '0.1.0',
  identity: {
    title: 'Test Game',
    genre: 'Metroidvania',
    tone: 'dark',
    visualStyle: 'dark pixel art',
  },
  technical: {
    resolution: { width: 1280, height: 720 },
    tileSize: 16,
    targetPlaytimeHours: 2,
    difficulty: 'normal',
  },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 8 },
  narrative: {
    premise: 'A forgotten machine civilization',
    protagonist: 'forged knight',
    centralConflict: 'restore the core',
  },
  seed: 42,
  profile: 'TINY_TEST',
};

describe('AssetPipeline procedural path', () => {
  it('generates sprites and tilesets without ComfyUI/VLM', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'TINY_TEST',
      seed: 42,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
    });

    expect(result.assets.length).toBeGreaterThan(0);
    expect(result.assets.every((a) => a.buffer.length > 67)).toBe(true);
    expect(result.assets.some((a) => a.path.includes('player.png'))).toBe(true);
    expect(result.assets.some((a) => a.path.includes('tilesets/biome_0'))).toBe(true);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('writes sprite checkpoints to disk and reuses them on resume', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-resume-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const pipeline = new AssetPipeline();
    const first = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'TINY_TEST',
      seed: 42,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
    });

    const player = first.assets.find((a) => a.id === 'player')!;
    expect(player.provider).toBe('procedural');
    expect(existsSync(join(outputDir, 'assets/characters/player.png'))).toBe(true);

    const second = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'TINY_TEST',
      seed: 42,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      resume: true,
    });

    const resumedPlayer = second.assets.find((a) => a.id === 'player')!;
    expect(resumedPlayer.provider).toBe('checkpoint');
    expect(resumedPlayer.buffer.equals(player.buffer)).toBe(true);

    const resumedBoss = second.assets.find((a) => a.id === 'boss_final')!;
    expect(resumedBoss.provider).toBe('checkpoint');

    const tileset = first.assets.find((a) => a.id === 'tileset_biome_0')!;
    expect(tileset.provider).toBe('procedural');
    const resumedTileset = second.assets.find((a) => a.id === 'tileset_biome_0')!;
    expect(resumedTileset.provider).toBe('checkpoint');
    expect(resumedTileset.buffer.equals(tileset.buffer)).toBe(true);

    // Individual tile slices must still be produced correctly from the checkpointed source.
    const resumedTiles = second.assets.filter((a) => a.id.startsWith('biome_0_tile_'));
    const originalTiles = first.assets.filter((a) => a.id.startsWith('biome_0_tile_'));
    expect(resumedTiles.length).toBe(originalTiles.length);
    expect(resumedTiles.length).toBeGreaterThan(0);
    for (const tile of resumedTiles) {
      const original = originalTiles.find((t) => t.id === tile.id)!;
      expect(tile.buffer.equals(original.buffer)).toBe(true);
    }

    rmSync(outputDir, { recursive: true, force: true });
  });
});
