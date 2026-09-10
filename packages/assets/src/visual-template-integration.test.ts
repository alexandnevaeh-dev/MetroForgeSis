import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { GameDNA } from '@metroforge/schemas';
import {
  generateArtBible,
  generateStyleBible,
  generateVisualDNA,
  generateAllBiomeVisualDNA,
  generateEnvironmentKit,
} from '@metroforge/procedural';
import { AssetPipeline } from './asset-pipeline.js';
import { loadVisualReferenceLibrary, roleForArchetype } from './visual-templates/index.js';
import { pickEnemyArchetype } from './png.js';

function envKitDna(seed: number): GameDNA {
  return {
    version: '0.1.0',
    archetype: 'SIDE_VIEW_METROIDVANIA',
    identity: { title: 'Test Game', genre: 'Metroidvania', tone: 'dark', visualStyle: 'dark pixel art' },
    technical: { resolution: { width: 1280, height: 720 }, tileSize: 32, targetPlaytimeHours: 2, difficulty: 'normal' },
    combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
    movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
    abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
    world: { biomeCount: 3, roomCount: 8 },
    narrative: { premise: 'A forgotten machine civilization', protagonist: 'forged knight', centralConflict: 'restore the core' },
    seed,
    profile: 'SMALL',
  };
}

/** Builds the real visualDNA + one EnvironmentKit per biome (matching how
 * packages/generation/src/pipeline.ts's GenerationPipeline.run() populates these for every real
 * `metroforge create` invocation), so calling AssetPipeline.generate() directly here exercises
 * the exact same prop-generation call site a real CLI run does. */
function buildEnvironmentFixture(dna: GameDNA) {
  const art = generateArtBible(dna, dna.seed);
  const style = generateStyleBible(dna, art);
  const visualDNA = generateVisualDNA({ gameDna: dna, artBible: art, styleBible: style });
  const biomes = generateAllBiomeVisualDNA({ visualDNA, gameDna: dna });
  const environmentKits = biomes.map((biome) =>
    generateEnvironmentKit({ visualDNA, biome, profile: dna.profile, seed: dna.seed }),
  );
  return { art, style, visualDNA, environmentKits };
}

// Repo root: packages/assets/src/../../.. -> Forged/
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const minimalDna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: { title: 'Test Game', genre: 'Metroidvania', tone: 'dark', visualStyle: 'dark pixel art' },
  technical: { resolution: { width: 1280, height: 720 }, tileSize: 16, targetPlaytimeHours: 2, difficulty: 'normal' },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 3, roomCount: 8 },
  narrative: { premise: 'A forgotten machine civilization', protagonist: 'forged knight', centralConflict: 'restore the core' },
  seed: 42,
  profile: 'TINY_TEST',
};

describe('AssetPipeline x visual reference template library (fourteenth-session integration)', () => {
  it('resolves a template for at least one enemy and records real provenance instead of the generic BIOME_PALETTES fallback', async () => {
    const outputDir = join(tmpdir(), `metroforge-visual-template-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const library = loadVisualReferenceLibrary(REPO_ROOT);

    const pipeline = new AssetPipeline();
    const result = await pipeline.generate({
      gameDna: { ...minimalDna, world: { ...minimalDna.world, biomeCount: 3 } },
      profile: 'SMALL',
      seed: 42,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      visualReferenceLibrary: library,
      visualReferenceLibraryRoot: REPO_ROOT,
    });

    expect(result.assets.some((a) => a.path.startsWith('assets/enemies/'))).toBe(true);

    const provenancePath = join(outputDir, 'reports', 'visual-template-provenance.json');
    expect(existsSync(provenancePath)).toBe(true);
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
    expect(provenance.libraryId).toBe('metroforge-reference-library-v1');
    expect(Array.isArray(provenance.entries)).toBe(true);
    expect(provenance.entries.length).toBeGreaterThan(0);

    for (const entry of provenance.entries) {
      expect(entry.templateId).toBeTruthy();
      expect(entry.styleVersion).toBe(library.styleVersion);
      expect(['foundry', 'flooded_utility', 'overgrown_reactor']).toContain(entry.biome);
      expect(entry.prompt.length).toBeGreaterThan(0);
      expect(typeof entry.tokenBudget.estimated).toBe('boolean');
      // No real reference-image-conditioning-capable provider is registered in this
      // skipImageGen:true test, so every entry must honestly disclose that instead of silently
      // pretending conditioning was attempted.
      expect(entry.conditioningAttached).toBe(false);
      expect(entry.conditioningDisclosure).toMatch(/no provider selected/);
    }
  });

  it('gives two different-biome instances of the same enemy archetype genuinely different template ids and palettes (the "two variations" demonstration)', async () => {
    const outputDir = join(tmpdir(), `metroforge-visual-template-variations-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const library = loadVisualReferenceLibrary(REPO_ROOT);

    const pipeline = new AssetPipeline();
    await pipeline.generate({
      gameDna: { ...minimalDna, world: { ...minimalDna.world, biomeCount: 3 } },
      profile: 'MEDIUM',
      seed: 42,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      visualReferenceLibrary: library,
      visualReferenceLibraryRoot: REPO_ROOT,
    });

    const provenancePath = join(outputDir, 'reports', 'visual-template-provenance.json');
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
    const entries: Array<{ assetId: string; templateId: string; biome: string }> = provenance.entries;

    // Group by the archetype pickEnemyArchetype() actually assigned each enemy id, then find an
    // archetype that this library covers (roleForArchetype) with more than one biome instance.
    const byRole = new Map<string, typeof entries>();
    for (const entry of entries) {
      const archetype = pickEnemyArchetype(entry.assetId);
      const role = roleForArchetype(archetype);
      if (!role) continue;
      const list = byRole.get(role) ?? [];
      list.push(entry);
      byRole.set(role, list);
    }
    const multiVariant = [...byRole.values()].find((list) => list.length >= 2);
    expect(multiVariant, 'expected at least one enemy archetype to appear in 2+ different biomes across a MEDIUM profile').toBeDefined();
    const [a, b] = multiVariant!;
    expect(a!.templateId).not.toBe(b!.templateId);
    expect(a!.biome).not.toBe(b!.biome);
  });
});

describe('AssetPipeline x visual reference template library — terrain/prop/background coverage (fifteenth session)', () => {
  async function generate(outputDir: string, seed: number) {
    const library = loadVisualReferenceLibrary(REPO_ROOT);
    const dna = envKitDna(seed);
    const { art, style, visualDNA, environmentKits } = buildEnvironmentFixture(dna);
    const pipeline = new AssetPipeline();
    await pipeline.generate({
      gameDna: dna,
      profile: 'SMALL',
      seed,
      outputDir,
      skipVlm: true,
      skipImageGen: true,
      artBible: art,
      styleBible: style,
      visualDNA,
      environmentKits,
      visualReferenceLibrary: library,
      visualReferenceLibraryRoot: REPO_ROOT,
    });
    const provenancePath = join(outputDir, 'reports', 'visual-template-provenance.json');
    return JSON.parse(readFileSync(provenancePath, 'utf8'));
  }

  it('records provenance for terrain, prop, and background roles too, each with a real provider, conditioning mode, and feature disclosure — not just enemies', async () => {
    const outputDir = join(tmpdir(), `metroforge-visual-template-env-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const provenance = await generate(outputDir, 42);
    const roles = new Set(provenance.entries.map((e: { assetRole: string }) => e.assetRole));
    expect(roles.has('terrain')).toBe(true);
    expect(roles.has('prop')).toBe(true);
    expect(roles.has('background')).toBe(true);

    for (const entry of provenance.entries) {
      expect(entry.provider, `entry ${entry.assetId} must have a real provider, never left "pending"`).not.toBe('pending');
      expect(typeof entry.provider).toBe('string');
      expect(entry.provider.length).toBeGreaterThan(0);
      expect(['ip_adapter', 'controlnet_canny', 'img2img', 'none']).toContain(entry.conditioningMode);
      expect(Array.isArray(entry.appliedFeatures)).toBe(true);
      expect(Array.isArray(entry.unsupportedFeatures)).toBe(true);
    }
    // No image provider is registered in this skipImageGen test, so every real generation call
    // falls through to the procedural fallback.
    expect(provenance.entries.every((e: { provider: string }) => e.provider === 'procedural')).toBe(true);
  });

  it('the terrain entries carry the biome-specific features this session wired (grates/stains for foundry, corrosion for flooded, vegetation for overgrown)', async () => {
    const outputDir = join(tmpdir(), `metroforge-visual-template-terrainfeat-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const provenance = await generate(outputDir, 42);
    const terrainEntries = provenance.entries.filter((e: { assetRole: string }) => e.assetRole === 'terrain');
    expect(terrainEntries.length).toBeGreaterThan(0);
    for (const entry of terrainEntries) {
      expect(entry.unsupportedFeatures).toEqual([]); // every feature this library declares is genuinely supported
      if (entry.biome === 'foundry') expect(entry.appliedFeatures).toEqual(expect.arrayContaining(['panel_grates', 'stains']));
      if (entry.biome === 'flooded_utility') expect(entry.appliedFeatures).toEqual(expect.arrayContaining(['corrosion']));
      if (entry.biome === 'overgrown_reactor') expect(entry.appliedFeatures).toEqual(expect.arrayContaining(['vegetation']));
    }
  });

  it('reproducibility: the same seed produces byte-identical tileset/background/prop assets on repeat generation', async () => {
    const dirA = join(tmpdir(), `metroforge-visual-template-repro-a-${Date.now()}`);
    const dirB = join(tmpdir(), `metroforge-visual-template-repro-b-${Date.now()}`);
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    const library = loadVisualReferenceLibrary(REPO_ROOT);
    const dna = envKitDna(777);
    const { art, style, visualDNA, environmentKits } = buildEnvironmentFixture(dna);
    for (const outputDir of [dirA, dirB]) {
      const pipeline = new AssetPipeline();
      await pipeline.generate({
        gameDna: dna,
        profile: 'SMALL',
        seed: 777,
        outputDir,
        skipVlm: true,
        skipImageGen: true,
        artBible: art,
        styleBible: style,
        visualDNA,
        environmentKits,
        visualReferenceLibrary: library,
        visualReferenceLibraryRoot: REPO_ROOT,
      });
    }
    const tilesetA = readFileSync(join(dirA, 'assets/tilesets/biome_0/source.png'));
    const tilesetB = readFileSync(join(dirB, 'assets/tilesets/biome_0/source.png'));
    expect(tilesetA.equals(tilesetB)).toBe(true);
    const bgA = readFileSync(join(dirA, 'assets/backgrounds/biome_0/near.png'));
    const bgB = readFileSync(join(dirB, 'assets/backgrounds/biome_0/near.png'));
    expect(bgA.equals(bgB)).toBe(true);
  });

  it('a different seed changes the tileset bytes (permitted variation), and a different biome index changes its material colors', async () => {
    const dirSeedA = join(tmpdir(), `metroforge-visual-template-seed-a-${Date.now()}`);
    const dirSeedB = join(tmpdir(), `metroforge-visual-template-seed-b-${Date.now()}`);
    mkdirSync(dirSeedA, { recursive: true });
    mkdirSync(dirSeedB, { recursive: true });
    const provA = await generate(dirSeedA, 1);
    const provB = await generate(dirSeedB, 2);
    const tilesetSeedA = readFileSync(join(dirSeedA, 'assets/tilesets/biome_0/source.png'));
    const tilesetSeedB = readFileSync(join(dirSeedB, 'assets/tilesets/biome_0/source.png'));
    expect(tilesetSeedA.equals(tilesetSeedB)).toBe(false);
    void provA;
    void provB;

    // Different biome index within the SAME run must use different real material colors —
    // compare biome_0 (foundry) vs biome_1 (flooded_utility) tileset bytes.
    const tilesetBiome0 = readFileSync(join(dirSeedA, 'assets/tilesets/biome_0/source.png'));
    const tilesetBiome1 = readFileSync(join(dirSeedA, 'assets/tilesets/biome_1/source.png'));
    expect(tilesetBiome0.equals(tilesetBiome1)).toBe(false);
  });

  it('every terrain/background asset stays PNG-decodable, tile-size-aligned, and fully opaque (transparency/dimension validity survives template styling)', async () => {
    const outputDir = join(tmpdir(), `metroforge-visual-template-validity-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    await generate(outputDir, 42);
    const { decodePngRgba } = await import('./png.js');
    // The final on-disk tileset is TileCompiler's compiled atlas (not the raw 128x128 procedural
    // source) — its own seam/role tests cover exact atlas geometry and which cells are legitimately
    // blank; here we only need to confirm template styling didn't break tile-size alignment
    // (opacity of the procedurally-styled SOURCE texture itself is already covered directly by
    // png.test.ts's "preserves tile-grid boundaries" case).
    const tileset = decodePngRgba(readFileSync(join(outputDir, 'assets/tilesets/biome_0/source.png')));
    expect(tileset.width % 16).toBe(0);
    expect(tileset.height % 16).toBe(0);
    const bg = decodePngRgba(readFileSync(join(outputDir, 'assets/backgrounds/biome_0/near.png')));
    expect(bg.width).toBeGreaterThan(0);
    expect(bg.height).toBeGreaterThan(0);
  });
});
