import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GenerationCancelledError } from '@metroforge/shared';
import { AssetPipeline } from '../src/asset-pipeline.js';
import type { GameDNA } from '@metroforge/schemas';

const minimalDna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
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
    expect(result.assets.some((a) => a.path === 'assets/vfx/hit_spark.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/dash_trail.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/ability_unlock.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/boss_phase_shift.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/area_burst.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/slam_shock.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/npcs/npc_000.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/npcs/npc_000_walk.png')).toBe(true);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('resumes all PNG artifacts from generation_manifest.json when present', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-manifest-resume-${Date.now()}`);
    mkdirSync(join(outputDir, 'assets', 'characters'), { recursive: true });

    const playerPath = join(outputDir, 'assets', 'characters', 'player.png');
    writeFileSync(playerPath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    writeFileSync(
      join(outputDir, 'generation_manifest.json'),
      JSON.stringify({
        artifacts: [
          {
            id: 'player',
            path: 'assets/characters/player.png',
            provider: 'procedural',
            fallbackGenerated: true,
            critiquePassed: true,
            critiqueScore: 100,
          },
        ],
      }),
    );

    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'TINY_TEST',
      seed: 42,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      resume: true,
    });

    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]?.provider).toBe('procedural');
    expect(result.warnings.some((w) => w.includes('generation_manifest.json'))).toBe(true);

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

  it('generates distinct assets for each boss in multi-boss profiles', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-bosses-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'SMALL',
      seed: 99,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      bosses: [
        { id: 'boss_000', name: 'Guardian' },
        { id: 'boss_final', name: 'Core Warden' },
      ],
    });

    expect(result.assets.some((a) => a.path === 'assets/bosses/boss_000.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/bosses/boss_000_attack.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/bosses/boss_final.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/bosses/boss_final_attack.png')).toBe(true);

    const boss000 = result.assets.find((a) => a.id === 'boss_000')!;
    const bossFinal = result.assets.find((a) => a.id === 'boss_final')!;
    expect(boss000.buffer.equals(bossFinal.buffer)).toBe(false);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('uses per-boss visual prompts when provided', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-boss-prompts-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'SMALL',
      seed: 12,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      bosses: [
        {
          id: 'boss_000',
          name: 'Guardian',
          visualPrompt: 'pixel art crystal golem mini boss',
          attacks: ['slam'],
        },
        {
          id: 'boss_final',
          name: 'Core Warden',
          visualPrompt: 'pixel art molten core final boss',
          isFinal: true,
          attacks: ['area_burst'],
        },
      ],
    });

    expect(result.assets.filter((a) => a.path.startsWith('assets/bosses/boss_000')).length).toBeGreaterThanOrEqual(4);
    expect(result.assets.filter((a) => a.path.startsWith('assets/bosses/boss_final')).length).toBeGreaterThanOrEqual(4);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('generates walk sheets for each NPC', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-npcs-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'TINY_TEST',
      seed: 7,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      npcs: [
        { id: 'npc_merchant', name: 'Vendor', role: 'merchant' },
        { id: 'npc_sage', name: 'Sage', role: 'lore' },
      ],
    });

    expect(result.assets.some((a) => a.path === 'assets/npcs/npc_merchant.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/npcs/npc_merchant_walk.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/npcs/npc_sage.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/npcs/npc_sage_walk.png')).toBe(true);

    const merchant = result.assets.find((a) => a.id === 'npc_merchant')!;
    const sage = result.assets.find((a) => a.id === 'npc_sage')!;
    expect(merchant.buffer.equals(sage.buffer)).toBe(false);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('throws GenerationCancelledError when signal aborts mid-generation', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-cancel-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const controller = new AbortController();

    const pipeline = new AssetPipeline();
    const promise = pipeline.generate({
      gameDna: minimalDna,
      profile: 'TINY_TEST',
      seed: 42,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      signal: controller.signal,
      onTaskProgress: (task, current) => {
        if (task === 'enemy_sprite' && current >= 1) {
          controller.abort();
        }
      },
    });

    await expect(promise).rejects.toThrow(GenerationCancelledError);
    rmSync(outputDir, { recursive: true, force: true });
  });
});

describe('AssetPipeline compileFromSource', () => {
  it('persists source alongside compiled and marks COMPILED', async () => {
    const { derivedSourceRelPath } = await import('../src/asset-pipeline.js');
    const { generateProceduralSprite } = await import('../src/png.js');
    const outputDir = join(tmpdir(), `metroforge-compile-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const source = generateProceduralSprite({
      id: 'big',
      width: 64,
      height: 64,
      fill: [90, 140, 220, 255],
      shape: 'humanoid',
    });
    const compiledRel = 'assets/characters/hero.png';
    const pipeline = new AssetPipeline();
    const asset = pipeline.compileFromSource({
      id: 'hero',
      sourcePng: source,
      compiledRelPath: compiledRel,
      outputDir,
      targetWidth: 32,
      targetHeight: 32,
      tileSize: 16,
      provider: 'nvidia-image',
      modelId: 'black-forest-labs/flux.1-dev',
    });

    expect(derivedSourceRelPath(compiledRel)).toBe('assets/characters/hero_source.png');
    expect(asset.sourcePath).toBe('assets/characters/hero_source.png');
    expect(asset.sourceType).toBe('compiled');
    expect(asset.maturity).toBe('COMPILED');
    expect(asset.productionReady).toBe(false);
    expect(existsSync(join(outputDir, 'assets/characters/hero_source.png'))).toBe(true);
    expect(existsSync(join(outputDir, compiledRel))).toBe(true);
    expect(asset.buffer.length).toBeLessThan(source.length);

    rmSync(outputDir, { recursive: true, force: true });
  });
});
