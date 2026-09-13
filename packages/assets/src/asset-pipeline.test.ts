import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GenerationCancelledError } from '@metroforge/shared';
import { AssetPipeline, compiledSpriteFrameSize, proceduralProductionIntent, inferAssetTypeFromPath } from '../src/asset-pipeline.js';
import { decodePngRgba, generateProceduralSprite } from '../src/png.js';
import type { GameDNA } from '@metroforge/schemas';

describe('proceduralProductionIntent', () => {
  it('allows validated runtime procedural art across the real shipping families', () => {
    expect(proceduralProductionIntent({ path: 'assets/tilesets/biome_0/source.png', provider: 'procedural', critiquePassed: true }, 'tileset')).toBe(true);
    expect(proceduralProductionIntent({ path: 'assets/props/biome_0/arch.png', provider: 'procedural', critiquePassed: true }, 'prop')).toBe(true);
    expect(proceduralProductionIntent({ path: 'assets/characters/player.png', provider: 'procedural', critiquePassed: true }, 'player')).toBe(true);
    expect(proceduralProductionIntent({ path: 'assets/enemies/enemy_000.png', provider: 'procedural', critiquePassed: true }, 'enemy')).toBe(true);
    expect(proceduralProductionIntent({ path: 'assets/bosses/boss_final.png', provider: 'procedural', critiquePassed: true }, 'boss')).toBe(true);
    expect(proceduralProductionIntent({ path: 'assets/backgrounds/biome_0/far.png', provider: 'procedural', critiquePassed: true }, 'background')).toBe(true);
    expect(proceduralProductionIntent({ path: 'assets/ui/menus/title.png', provider: 'procedural', critiquePassed: true }, 'ui')).toBe(true);
    expect(proceduralProductionIntent({ path: 'assets/vfx/hit_spark.png', provider: 'procedural', critiquePassed: true }, 'vfx')).toBe(true);
  });

  it('blocks unvalidated or non-shipping procedural fallback from being treated as production', () => {
    expect(proceduralProductionIntent({ path: 'assets/props/biome_0/arch.png', provider: 'procedural', critiquePassed: false }, 'prop')).toBe(false);
    expect(proceduralProductionIntent({ path: 'assets/qa/tiles.png', provider: 'procedural', critiquePassed: true }, 'tile')).toBe(false);
    expect(proceduralProductionIntent({ path: 'audio/sfx/player_attack.wav', provider: 'procedural', critiquePassed: true }, 'audio')).toBe(false);
  });

  it('allows validated procedural NPC dialogue portraits (a shipping, runtime-visible UI family)', () => {
    expect(
      proceduralProductionIntent(
        { path: 'assets/ui/portraits/quest_giver.png', provider: 'procedural', critiquePassed: true },
        'portrait',
      ),
    ).toBe(true);
  });
});

describe('inferAssetTypeFromPath', () => {
  it('resolves UI, portrait, prop, and background paths — not just the original narrower set', () => {
    expect(inferAssetTypeFromPath('assets/ui/icons/ability_wall_slide.png')).toBe('ui');
    expect(inferAssetTypeFromPath('assets/ui/portraits/quest_giver.png')).toBe('portrait');
    expect(inferAssetTypeFromPath('assets/props/biome_0/arch.png')).toBe('prop');
    expect(inferAssetTypeFromPath('assets/backgrounds/biome_0/far.png')).toBe('background');
  });

  it('still resolves the original path families unchanged', () => {
    expect(inferAssetTypeFromPath('assets/vfx/hit_spark.png')).toBe('vfx');
    expect(inferAssetTypeFromPath('assets/tilesets/biome_0/source.png')).toBe('tileset');
    expect(inferAssetTypeFromPath('assets/tilesets/biome_0/tiles/tile_0_0.png')).toBe('tile');
    expect(inferAssetTypeFromPath('assets/enemies/enemy_000.png')).toBe('enemy');
    expect(inferAssetTypeFromPath('assets/characters/player.png')).toBe('player');
    expect(inferAssetTypeFromPath('assets/characters/player_attack.png')).toBe('animation');
  });
});

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
    // terrain.tres records the deterministic Godot 4 ground terrain contract used by the runtime
    // TileMapLayer. The fixed atlas mapping is validated by TileCompiler tests below.
    const terrainTresPath = join(outputDir, 'assets', 'tilesets', 'biome_0', 'terrain.tres');
    expect(existsSync(terrainTresPath)).toBe(true);
    const terrainTres = readFileSync(terrainTresPath, 'utf8');
    expect(terrainTres).toContain('terrain_set_0/mode = 0');
    expect(terrainTres).toContain('terrain_set_0/terrain_0/name = "ground"');
    expect(terrainTres).toContain('0:0/0/terrain_set = 0');
    expect(terrainTres).toContain('0:0/0/terrains_peering_bit/top_side = -1');
    expect(terrainTres).toContain('1:0/0/terrains_peering_bit/top_side = 0');
    expect(result.assets.some((a) => a.path === 'assets/vfx/hit_spark.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/dash_trail.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/ability_unlock.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/boss_phase_shift.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/area_burst.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/slam_shock.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/vfx/landing_dust.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/props/interact/pickup.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/props/interact/save_shrine.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/props/interact/ability.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/npcs/npc_000.png')).toBe(true);
    expect(result.assets.some((a) => a.path === 'assets/npcs/npc_000_walk.png')).toBe(true);

    const npcStill = result.assets.find((a) => a.path === 'assets/npcs/npc_000.png')!;
    const npcPx = decodePngRgba(npcStill.buffer);
    let mustard = 0;
    for (let i = 0; i < npcPx.rgba.length; i += 4) {
      if ((npcPx.rgba[i + 3] ?? 0) < 128) continue;
      const r = npcPx.rgba[i]!;
      const g = npcPx.rgba[i + 1]!;
      const b = npcPx.rgba[i + 2]!;
      if (r > 180 && g > 140 && b < 100) mustard += 1;
    }
    expect(mustard).toBe(0);

    expect(result.assets.some((a) => a.path === 'assets/backgrounds/biome_0/far.png')).toBe(true);
    // Player animation production pass: idle now gets a real multi-frame sheet (buildProgressionSheetAsset),
    // not the single-frame `player_idle_pose.png` still it fell back to before this pass.
    expect(result.assets.some((a) => a.path === 'assets/characters/player_idle.png')).toBe(true);
    expect(result.assets.some((a) => a.path.includes('assets/ui/portraits/'))).toBe(true);

    const player = result.assets.find((a) => a.path === 'assets/characters/player.png')!;
    const playerDims = decodePngRgba(player.buffer);
    const characterFrame = compiledSpriteFrameSize('character');
    expect(playerDims.width).toBe(characterFrame.width);
    expect(playerDims.height).toBe(characterFrame.height);

    const tileset = result.assets.find((a) => a.path === 'assets/tilesets/biome_0/source.png')!;
    const tilesetDims = decodePngRgba(tileset.buffer);
    expect(tilesetDims.width).toBe(16 * 8);
    expect(tilesetDims.height).toBe(16 * 6);

    // Regression: generateDeathSheet deliberately fades the final frame to 45% alpha (never
    // fully invisible), but PixelArtProcessor's default alpha-cleanup binarizes at a 128
    // threshold — 45% of 255 rounds to ~115, just under that, which wiped the whole final
    // frame to fully transparent. A death animation must not vanish to nothing.
    const death = result.assets.find((a) => a.path === 'assets/characters/player_death.png')!;
    expect(death).toBeDefined();
    const deathDims = decodePngRgba(death.buffer);
    const deathFrameCount = deathDims.width / characterFrame.width;
    const lastFrameX0 = (deathFrameCount - 1) * characterFrame.width;
    let lastFrameOpaquePixels = 0;
    for (let y = 0; y < deathDims.height; y++) {
      for (let x = lastFrameX0; x < deathDims.width; x++) {
        if (deathDims.rgba[(y * deathDims.width + x) * 4 + 3]! > 0) lastFrameOpaquePixels++;
      }
    }
    expect(lastFrameOpaquePixels).toBeGreaterThan(0);

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

  it('loads authored foundry courier actors for the side-view foundry visual slice', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-authored-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: {
        ...minimalDna,
        profile: 'VISUAL_VERTICAL_SLICE',
        // The authored courier kit is gated on a side-view foundry/courier theme, not on the
        // profile alone (it must never reach a top-down or unrelated side-view game).
        narrative: { ...minimalDna.narrative, premise: 'a lone courier delves a ruined foundry' },
        technical: { ...minimalDna.technical, tileSize: 32 },
      },
      profile: 'VISUAL_VERTICAL_SLICE',
      seed: 42,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
    });

    const player = result.assets.find((a) => a.path === 'assets/characters/player.png')!;
    const npc = result.assets.find((a) => a.path === 'assets/npcs/npc_000.png')!;
    const walk = result.assets.find((a) => a.path === 'assets/characters/player_walk.png')!;
    const npcWalk = result.assets.find((a) => a.path === 'assets/npcs/npc_000_walk.png')!;
    expect(player.provider).toBe('authored-original');
    expect(player.fallbackGenerated).toBe(false);
    expect(player.maturity).toBe('QA_REVIEW');
    expect(player.sourceType).toBe('manual');
    expect(player.fakeAnimation).toBeFalsy();
    expect(npc.provider).toBe('authored-original');
    expect(npc.fallbackGenerated).toBe(false);
    expect(npc.maturity).toBe('QA_REVIEW');
    // Authored 4-frame courier strips reach the game for the visible combat states. (idle is a
    // full V2 progression sheet, not a pose still, after the integration merge — see
    // docs/debug/TOPDOWN_GENRE_MILESTONE.md; the authored kit's other _pose stills still slot in
    // for the states V2 leaves as pose transforms: run/jump/fall/land/dash.)
    expect(walk.provider).toBe('authored-original');
    expect(walk.fallbackGenerated).toBe(false);
    expect(walk.fakeAnimation).toBe(false);
    expect(npcWalk.provider).toBe('authored-original');
    expect(npcWalk.fallbackGenerated).toBe(false);
    for (const state of ['attack', 'hurt', 'death']) {
      const sheet = result.assets.find((a) => a.path === `assets/characters/player_${state}.png`)!;
      expect(sheet.provider).toBe('authored-original');
      expect(sheet.fallbackGenerated).toBe(false);
    }
    expect(player.buffer.equals(npc.buffer)).toBe(false);

    const tileset = result.assets.find((a) => a.path === 'assets/tilesets/biome_0/source.png')!;
    expect(tileset.provider).toBe('authored-original');
    expect(tileset.fallbackGenerated).toBe(false);
    const ability = result.assets.find((a) => a.path === 'assets/props/interact/ability.png')!;
    expect(ability.provider).toBe('authored-original');
    expect(ability.fallbackGenerated).toBe(false);
    expect(decodePngRgba(tileset.buffer).width).toBe(256);
    expect(decodePngRgba(tileset.buffer).height).toBe(192);
    expect(tileset.sourceType).toBe('manual');
    expect(tileset.maturity).toBe('QA_REVIEW');
    expect(ability.sourceType).toBe('manual');
    const playerPx = decodePngRgba(player.buffer);
    expect(playerPx.width).toBe(64);
    expect(playerPx.height).toBe(64);
    let feet = 0;
    for (let x = 0; x < playerPx.width; x++) {
      if ((playerPx.rgba[((playerPx.height - 1) * playerPx.width + x) * 4 + 3] ?? 0) > 128) feet += 1;
    }
    expect(feet).toBeGreaterThan(0);

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

    // Regression: the portrait crop used to fabricate provider:'pixel-art-processor' and a
    // hardcoded critiqueScore (45) whenever the parent NPC was a fallback, permanently pinning
    // the portrait to PLACEHOLDER even once the parent itself reached PROCEDURAL_PRODUCTION on
    // real evidence. It must now inherit the parent's actual provider/critique evidence instead.
    const portrait = result.assets.find((a) => a.id === 'portrait_merchant')!;
    expect(portrait).toBeDefined();
    expect(portrait.provider).toBe(merchant.provider);
    expect(portrait.critiqueScore).toBe(merchant.critiqueScore);
    expect(portrait.critiquePassed).toBe(merchant.critiquePassed);
    if (merchant.maturity === 'PROCEDURAL_PRODUCTION') {
      expect(portrait.maturity).toBe('PROCEDURAL_PRODUCTION');
    }

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('generates distinct real multi-frame sheets for every remaining locomotion/transition state for TINY_TEST with no image provider (player animation production pass: idle/jump_start/jump/fall/land/dash/wall_slide/wall_jump/swim must not fall back to a static pose)', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-poses-${Date.now()}`);
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

    // Every remaining locomotion/transition state now gets a real multi-frame sheet
    // (buildProgressionSheetAsset) instead of the single static `player_<name>_pose.png` it fell
    // back to before this pass — the same defect class run/walk already fixed, generalized.
    const progressionNames = ['idle', 'jump_start', 'jump', 'fall', 'land', 'dash', 'wall_slide', 'wall_jump', 'swim'];
    for (const name of progressionNames) {
      const relPath = `assets/characters/player_${name}.png`;
      const asset = result.assets.find((a) => a.path === relPath);
      expect(asset, relPath).toBeDefined();
      expect(result.assets.some((a) => a.path === `assets/characters/player_${name}_pose.png`), `${name}_pose.png must not exist`).toBe(false);
    }

    // No stray pose stills for the states that already had a dedicated multi-frame sheet before
    // this pass either — AnimatedAssetSprite.gd's generalized precedence rule would ignore them
    // anyway, but the pipeline shouldn't waste a generation round-trip producing them.
    expect(result.assets.some((a) => a.path === 'assets/characters/player_attack_pose.png')).toBe(false);
    expect(result.assets.some((a) => a.path === 'assets/characters/player_hurt_pose.png')).toBe(false);
    expect(result.assets.some((a) => a.path === 'assets/characters/player_death_pose.png')).toBe(false);
    expect(result.assets.some((a) => a.path === 'assets/characters/player_run_pose.png')).toBe(false);

    // attack_2/attack_3 combo continuation hits — real, distinct arcs, not a rotate/recolor.
    const attack2 = result.assets.find((a) => a.path === 'assets/characters/player_attack_2.png')!;
    const attack3 = result.assets.find((a) => a.path === 'assets/characters/player_attack_3.png')!;
    expect(attack2).toBeDefined();
    expect(attack3).toBeDefined();
    expect(attack2.buffer.equals(attack3.buffer)).toBe(false);

    // Run is a genuine 12-frame animated sheet (production standard §22/§25), not a static pose —
    // distinct from the walk sheet (different technique: longer stride + forward lean), and
    // gated on real frame-quality metrics (§20), not just the generic animation critique.
    const run = result.assets.find((a) => a.path === 'assets/characters/player_run.png')!;
    expect(run).toBeDefined();
    const runDecoded = decodePngRgba(run.buffer);
    expect(runDecoded.width).toBe(64 * 12);
    expect(run.frameQuality).toBeDefined();
    expect(run.frameQuality!.frameCount).toBe(12);
    expect(run.frameQuality!.uniqueFrameRatio).toBeGreaterThanOrEqual(0.8);
    expect(run.frameQuality!.meanSilhouetteDelta).toBeGreaterThan(0);
    expect(run.critiquePassed).toBe(true);

    const idle = result.assets.find((a) => a.path === 'assets/characters/player_idle.png')!;
    const walk = result.assets.find((a) => a.path === 'assets/characters/player_walk.png')!;
    expect(idle.frameQuality).toBeDefined();
    // idle sheet frame 0 (first `frameWidth` columns) must differ from the walk sheet's frame 0 —
    // the literal bug this phase closes (idle used to be a byte copy of walk-frame-1).
    const walkDecoded = decodePngRgba(walk.buffer);
    const idleDecoded = decodePngRgba(idle.buffer);
    let identical = true;
    for (let y = 0; y < idleDecoded.height && identical; y++) {
      for (let x = 0; x < 64; x++) {
        const wi = (y * walkDecoded.width + x) * 4;
        const ii = (y * idleDecoded.width + x) * 4;
        if (
          walkDecoded.rgba[wi] !== idleDecoded.rgba[ii] ||
          walkDecoded.rgba[wi + 1] !== idleDecoded.rgba[ii + 1] ||
          walkDecoded.rgba[wi + 2] !== idleDecoded.rgba[ii + 2] ||
          walkDecoded.rgba[wi + 3] !== idleDecoded.rgba[ii + 3]
        ) {
          identical = false;
          break;
        }
      }
    }
    expect(identical).toBe(false);

    // Deterministic procedural fallback must be marked as such (not silently claimed as AI art).
    expect(idle.fallbackGenerated).toBe(true);
    expect(idle.provider).toBe('procedural');

    // All locomotion/transition sheets must be pairwise distinct — not the same clip duplicated
    // per state under a different filename.
    const buffers = progressionNames.map(
      (name) => result.assets.find((a) => a.path === `assets/characters/player_${name}.png`)!.buffer,
    );
    for (let i = 0; i < buffers.length; i++) {
      for (let j = i + 1; j < buffers.length; j++) {
        expect(buffers[i]!.equals(buffers[j]!), `${progressionNames[i]} vs ${progressionNames[j]}`).toBe(false);
      }
    }

    // Run must not be a relabeled copy of walk — different stride/lean, so byte-distinct even
    // though both are multi-frame sheets derived from the same base still.
    expect(run.buffer.equals(walk.buffer)).toBe(false);

    // Canonical per-clip metadata sidecar (§24) — real FPS/loop declared per animation, not one
    // global playback speed for every clip.
    const sidecarPath = join(outputDir, 'assets', 'characters', 'player_animations.json');
    expect(existsSync(sidecarPath)).toBe(true);
    const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
    expect(sidecar.idle).toMatchObject({ frameCount: 8, fps: 8, loop: true });
    expect(sidecar.attack_3).toMatchObject({ frameCount: 16, fps: 16, loop: false });

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

describe('compiledSpriteFrameSize', () => {
  it('raises character/enemy/npc above legacy 32 and keeps tileset/item rules', () => {
    expect(compiledSpriteFrameSize('character')).toEqual({ width: 64, height: 64 });
    expect(compiledSpriteFrameSize('enemy')).toEqual({ width: 64, height: 64 });
    expect(compiledSpriteFrameSize('npc')).toEqual({ width: 64, height: 64 });
    expect(compiledSpriteFrameSize('boss')).toEqual({ width: 96, height: 96 });
    expect(compiledSpriteFrameSize('boss_final')).toEqual({ width: 160, height: 160 });
    expect(compiledSpriteFrameSize('tileset')).toEqual({ width: 128, height: 128 });
    expect(compiledSpriteFrameSize('item')).toEqual({ width: 16, height: 16 });
  });
});

describe('AssetPipeline compileFromSource', () => {
  it('persists source alongside compiled and marks COMPILED', async () => {
    const { derivedSourceRelPath } = await import('../src/asset-pipeline.js');
    const { generateProceduralSprite } = await import('../src/png.js');
    const outputDir = join(tmpdir(), `metroforge-compile-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const frame = compiledSpriteFrameSize('character');
    const source = generateProceduralSprite({
      id: 'big',
      width: 256,
      height: 256,
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
      targetWidth: frame.width,
      targetHeight: frame.height,
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

    const compiledDims = decodePngRgba(asset.buffer);
    expect(compiledDims.width).toBe(frame.width);
    expect(compiledDims.height).toBe(frame.height);
    const sourceOnDisk = decodePngRgba(
      readFileSync(join(outputDir, 'assets/characters/hero_source.png')),
    );
    expect(sourceOnDisk.width).toBe(256);
    expect(sourceOnDisk.height).toBe(256);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('soft-pass critique on compile lands QA_REVIEW, never PRODUCTION_READY', async () => {
    const { generateProceduralSprite } = await import('../src/png.js');
    const outputDir = join(tmpdir(), `metroforge-compile-qa-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const frame = compiledSpriteFrameSize('character');
    const source = generateProceduralSprite({
      id: 'nvidia_activation_player',
      width: 256,
      height: 256,
      fill: [200, 90, 40, 255],
      shape: 'humanoid',
    });
    const pipeline = new AssetPipeline();
    const asset = pipeline.compileFromSource({
      id: 'nvidia_activation_player',
      sourcePng: source,
      compiledRelPath: 'assets/characters/nvidia_activation_player.png',
      outputDir,
      targetWidth: frame.width,
      targetHeight: frame.height,
      tileSize: 16,
      provider: 'nvidia-image',
      modelId: 'black-forest-labs/flux.1-dev',
      critiquePassed: true,
      critiqueScore: 85,
    });

    expect(asset.sourceType).toBe('compiled');
    expect(asset.maturity).toBe('QA_REVIEW');
    expect(asset.productionReady).toBe(false);

    rmSync(outputDir, { recursive: true, force: true });
  });
});

describe('AssetPipeline visualMode — NVIDIA NIM enhancement pass', () => {
  it('procedural-only (default, visualMode omitted) never invokes an injected editor/generator, even if supplied', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-visualmode-a-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const editImage = () => {
      throw new Error('procedural-only must never call the editor');
    };
    const generateImage = () => {
      throw new Error('procedural-only must never call the generator');
    };

    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'TINY_TEST',
      seed: 42,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      // visualMode intentionally omitted — must default to procedural-only.
      visualEnhancementEditor: { id: 'poison-editor', editImage },
      visualEnhancementGenerator: { id: 'poison-generator', checkHealth: async () => true, generateImage },
    });

    expect(result.visualEnhancement).toBeUndefined();
    // Regression: interactive_chest_{closed,open} must exist under the same guarantee as the
    // other three interactive world-object icons — a real closed/open chest sprite even with
    // every AI provider unavailable, not only when one succeeds.
    for (const id of [
      'interactive_checkpoint',
      'interactive_ability_pickup',
      'interactive_ability_gate',
      'interactive_chest_closed',
      'interactive_chest_open',
      'interactive_portal',
    ]) {
      const interactive = result.assets.find((asset) => asset.id === id);
      expect(interactive?.maturity).toBe('PROCEDURAL_PRODUCTION');
      expect(interactive?.productionReady).toBe(true);
      expect(interactive?.fallbackGenerated).toBe(true);
    }
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('nvidia-enhanced mode runs the pass, calls the injected editor/generator, and reports an honest summary', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-visualmode-b-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    let editCalls = 0;
    let genCalls = 0;
    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'TINY_TEST',
      seed: 42,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      visualMode: 'nvidia-enhanced',
      visualEnhancementEditor: {
        id: 'fake-nvidia-image-edit',
        editImage: async (req) => {
          editCalls++;
          return {
            provider: 'nvidia-image-edit',
            model: 'qwen/qwen-image-edit-2511',
            sourceAssetIds: req.sourceAssets.map((s) => s.assetId),
            images: [{ buffer: generateProceduralSprite({ id: 'enh', width: 64, height: 64, fill: [80, 120, 200, 200], shape: 'humanoid' }), mimeType: 'image/png', width: 64, height: 64 }],
            seed: 1,
            provenance: {
              provider: 'nvidia-image-edit',
              model: 'qwen/qwen-image-edit-2511',
              capability: 'IMAGE_EDIT',
              sourceAssetIds: req.sourceAssets.map((s) => s.assetId),
              instructionHash: 'x',
              generatedAt: new Date().toISOString(),
              nativeDimensions: { width: 64, height: 64 },
              source: 'image_edit',
            },
          };
        },
      },
      visualEnhancementGenerator: {
        id: 'fake-nvidia-image',
        checkHealth: async () => true,
        generateImage: async () => {
          genCalls++;
          return {
            image: generateProceduralSprite({ id: 'gen', width: 32, height: 32, fill: [200, 160, 40, 200], shape: 'item' }),
            provider: 'nvidia-image',
            modelId: 'black-forest-labs/flux.1-dev',
            seed: 2,
            fallbackGenerated: false,
          };
        },
      },
    });

    expect(result.visualEnhancement).toBeDefined();
    expect(result.visualEnhancement!.visualMode).toBe('nvidia-enhanced');
    // At minimum: player + up to 2 TINY_TEST enemies + checkpoint/pickup/gate (always planned).
    expect(result.visualEnhancement!.attempted).toBeGreaterThanOrEqual(5);
    expect(editCalls).toBeGreaterThan(0);
    expect(genCalls).toBe(3); // checkpoint + pickup + gate
    for (const id of ['interactive_checkpoint', 'interactive_ability_pickup', 'interactive_ability_gate']) {
      const interactive = result.assets.find((asset) => asset.id === id);
      expect(interactive).toBeDefined();
      expect(interactive?.maturity).toBe('QA_REVIEW');
      expect(interactive?.productionReady).toBe(false);
      expect(interactive?.sourceType).toBe('ai_generated');
      expect(existsSync(join(outputDir, interactive!.path))).toBe(true);
    }
    // Every outcome is honestly one of the two real states — never a silently faked success.
    for (const outcome of result.visualEnhancement!.outcomes) {
      expect(['AI_GENERATED_NVIDIA_NIM', 'FALLBACK_ACTIVE']).toContain(outcome.origin);
    }

    // Regression: a successful enhancement writes new bytes to disk, but the *returned* assets[]
    // array used to still carry the stale pre-enhancement buffer — the pipeline caller
    // (packages/generation/src/pipeline.ts) rebuilds its Godot texture-write map from exactly
    // this array and would silently clobber the enhancement back to procedural. Every activated
    // outcome's asset entry must carry the same bytes that are actually on disk.
    const activated = result.visualEnhancement!.outcomes.filter((o) => o.succeeded && o.activatedPath);
    expect(activated.length).toBeGreaterThan(0);
    for (const outcome of activated) {
      const onDisk = readFileSync(join(outputDir, ...outcome.activatedPath!.split('/')));
      const inReturnedAssets = result.assets.find((a) => a.path === outcome.activatedPath);
      expect(inReturnedAssets).toBeDefined();
      expect(inReturnedAssets!.buffer.equals(onDisk)).toBe(true);
      expect(inReturnedAssets!.fallbackGenerated).toBe(false);
      expect(inReturnedAssets!.sourceType).toBe('ai_generated');
    }

    rmSync(outputDir, { recursive: true, force: true });
  });
});

describe('AssetPipeline — AssetFoundry production integration (migration seam)', () => {
  // Regression guard for the AssetPipeline → AssetFoundry migration: proves the *real*
  // Candidate/game-generation path (AssetPipeline.generate(), not a standalone Foundry probe)
  // actually consults the gateway backend it was configured with for the first migrated
  // category (player key art). No credentials are configured in this test environment, so every
  // real generation attempt legitimately falls back to procedural — what these assertions prove
  // is *which gateway was consulted*, via GeneratedAsset.generationBackend, which is recorded
  // whether or not that attempt succeeded. If AssetPipeline ever silently reverted to the old
  // single-provider resolver for a call site explicitly configured with assetGenerationBackend:
  // 'foundry', the second test below would read 'legacy' and fail.
  it('defaults to the legacy gateway when assetGenerationBackend is unset', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-gateway-legacy-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'TINY_TEST',
      seed: 1,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
    });
    const player = result.assets.find((a) => a.id === 'player')!;
    expect(player).toBeDefined();
    // A gateway is always consulted internally (see generateSprite) even here — with no provider
    // configured (skipImageGen), that gateway defaults to LegacyAssetGenerationGateway(null),
    // which fails fast and falls back to procedural exactly as the pre-migration inline branch
    // did. 'legacy' is the correct, harmless value here — the assertion that actually matters is
    // the next test, where it must read 'foundry' instead.
    expect(player.generationBackend).toBe('legacy');
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('routes the player key-art generation through AssetFoundry when assetGenerationBackend is "foundry"', async () => {
    const outputDir = join(tmpdir(), `metroforge-assets-gateway-foundry-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: minimalDna,
      profile: 'TINY_TEST',
      seed: 1,
      outputDir,
      skipVlm: true,
      // skipImageGen keeps every OTHER category's provider resolution out of this test (no real
      // network/subprocess health checks) — it does NOT bypass the player gateway, which is
      // constructed from imageRoute.registry regardless (see generate()): with skipImageGen that
      // registry is empty, so the Foundry gateway still runs, fails fast (no candidates), and
      // falls back to procedural — proving the gateway was genuinely consulted without making
      // this test slow or network-dependent.
      skipImageGen: true,
      assetGenerationBackend: 'foundry',
      // FREE_ONLY must reach the Foundry request (see generateSprite's mode → constraint
      // derivation) — with an empty registry there's no paid candidate to exclude here, but this
      // proves the value flows through without being silently dropped or crashing; the actual
      // exclusion-of-a-paid-provider behavior is covered by
      // FoundryAssetGenerationGateway > 'propagates freeOnly so a paid-only registry yields no
      // eligible candidate' in gateway.test.ts, which exercises Foundry's own filtering directly.
      mode: 'FREE_ONLY',
    });
    const player = result.assets.find((a) => a.id === 'player')!;
    expect(player).toBeDefined();
    expect(player.generationBackend).toBe('foundry');
    // No credentials configured ⇒ Foundry has no eligible provider ⇒ honest procedural fallback,
    // not a fabricated success.
    expect(player.fallbackGenerated).toBe(true);
    expect(player.fallbackReason).toContain('foundry');

    // Every other category in this same run must be unaffected — the migration is scoped to the
    // player call site only in this pass.
    const nonPlayer = result.assets.filter((a) => a.id !== 'player' && a.provider !== 'checkpoint');
    for (const asset of nonPlayer) {
      expect(asset.generationBackend).not.toBe('foundry');
    }
    rmSync(outputDir, { recursive: true, force: true });
  });
});
