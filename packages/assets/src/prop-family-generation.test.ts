import { describe, it, expect, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { GameDNA } from '@metroforge/schemas';
import {
  generateArtBible,
  generateStyleBible,
  generateVisualDNA,
  generateAllBiomeVisualDNA,
  generateEnvironmentKit,
} from '@metroforge/procedural';
import { encodePng, decodePngRgba } from './png.js';
import type { ImageGenerator, ImageGenRequest, ImageGenResult } from './types/image-gen.js';
import type { GeneratedAsset } from './asset-pipeline.js';

// `registerFoundryImageProviders` is the only seam AssetPipeline uses to populate its
// internal ImageProviderRegistry — replacing it lets these tests inject a fully-controlled
// fake ImageGenerator into a real `AssetPipeline.generate()` run without touching the
// network, mirroring the pattern already used in image-router.test.ts at the registry level.
const activeMock: { provider: ImageGenerator | null } = { provider: null };
vi.mock('./foundry/register.js', () => ({
  registerFoundryImageProviders: (registry: { register: (r: { provider: ImageGenerator; local: boolean; priority: number }) => void }) => {
    if (activeMock.provider) {
      registry.register({ provider: activeMock.provider, local: false, priority: 100 });
    }
  },
}));

const { AssetPipeline } = await import('./asset-pipeline.js');

/** A small opaque square on a transparent field — enough for fitOpaque cropping to work on. */
function fakeAiPng(): Buffer {
  const size = 128;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 32; y < 96; y++) {
    for (let x = 32; x < 96; x++) {
      const i = (y * size + x) * 4;
      rgba[i] = 200;
      rgba[i + 1] = 160;
      rgba[i + 2] = 60;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

class MockImageGenerator implements ImageGenerator {
  calls: ImageGenRequest[] = [];
  constructor(
    public id: string,
    private readonly behavior: 'succeed' | 'fail',
    private readonly failMessage = 'CONTENT_FILTERED: mock content-safety rejection',
  ) {}
  async checkHealth(): Promise<boolean> {
    return true;
  }
  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    this.calls.push(request);
    if (this.behavior === 'fail') {
      throw new Error(this.failMessage);
    }
    return {
      image: fakeAiPng(),
      provider: this.id,
      modelId: 'mock-model-v1',
      seed: request.seed ?? 1,
      fallbackGenerated: false,
    };
  }
}

/** Type-safe access to the private per-family prop generator, without `any`. */
interface PropFamilyAssetOpts {
  id: string;
  path: string;
  family: string;
  fill: string;
  accent: string;
  width: number;
  height: number;
  imageGen: ImageGenerator | null;
  prompt: string;
  negativePrompt?: string;
  seed: number;
  outputDir: string;
  resume?: boolean;
  signal?: AbortSignal;
}
interface HasGeneratePropFamilyAsset {
  generatePropFamilyAsset(opts: PropFamilyAssetOpts): Promise<GeneratedAsset>;
}
function callGeneratePropFamilyAsset(
  pipeline: InstanceType<typeof AssetPipeline>,
  opts: PropFamilyAssetOpts,
): Promise<GeneratedAsset> {
  return (pipeline as unknown as HasGeneratePropFamilyAsset).generatePropFamilyAsset(opts);
}

function mkTmp(label: string): string {
  const dir = join(tmpdir(), `metroforge-prop-family-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const baseDna = (profile: GameDNA['profile']): GameDNA => ({
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: {
    title: 'Test Game',
    genre: 'Metroidvania',
    tone: 'dark',
    visualStyle: 'drowned gothic ruin',
  },
  technical: {
    resolution: { width: 1280, height: 720 },
    tileSize: 32,
    targetPlaytimeHours: 1,
    difficulty: 'normal',
  },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: profile === 'TINY_TEST' ? 8 : 10 },
  narrative: {
    premise: 'A collapsed mining colony haunted by a swarm intelligence',
    protagonist: 'tide warden',
    centralConflict: 'seal the swarm',
  },
  seed: 42,
  profile,
});

describe('generatePropFamilyAsset (per-family prop AI generation, private unit)', () => {
  it('AI success populates real generated image bytes, not the procedural placeholder', async () => {
    const outputDir = mkTmp('success');
    const pipeline = new AssetPipeline();
    const mockGen = new MockImageGenerator('nvidia-image', 'succeed');

    const asset = await callGeneratePropFamilyAsset(pipeline, {
      id: 'biome_0_prop_family_lantern',
      path: 'assets/props/biome_0/biome_0_prop_0.png',
      family: 'lantern',
      fill: '#284878',
      accent: '#c4a060',
      width: 32,
      height: 32,
      imageGen: mockGen,
      prompt: 'lantern environmental prop, small isolated game object',
      seed: 123,
      outputDir,
    });

    expect(mockGen.calls).toHaveLength(1);
    expect(asset.fallbackGenerated).toBe(false);
    expect(asset.provider).toBe('nvidia-image');
    expect(asset.modelId).toBe('mock-model-v1');
    expect(asset.fallbackReason).toBeUndefined();
    expect(asset.sourceType).toBe('compiled');
    expect(asset.sourcePath).toBeDefined();

    const dims = decodePngRgba(asset.buffer);
    expect(dims.width).toBe(32);
    expect(dims.height).toBe(32);
    // Some pixels must actually be opaque (real content), not a blank/transparent buffer.
    let opaquePixels = 0;
    for (let i = 3; i < dims.rgba.length; i += 4) {
      if ((dims.rgba[i] ?? 0) > 0) opaquePixels++;
    }
    expect(opaquePixels).toBeGreaterThan(0);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('AI failure falls back to procedural with a real captured fallbackReason (not a generic string)', async () => {
    const outputDir = mkTmp('failure');
    const pipeline = new AssetPipeline();
    const mockGen = new MockImageGenerator(
      'nvidia-image',
      'fail',
      'CONTENT_FILTERED: mock content-safety rejection for lantern',
    );

    const asset = await callGeneratePropFamilyAsset(pipeline, {
      id: 'biome_0_prop_family_lantern',
      path: 'assets/props/biome_0/biome_0_prop_0.png',
      family: 'lantern',
      fill: '#284878',
      accent: '#c4a060',
      width: 32,
      height: 32,
      imageGen: mockGen,
      prompt: 'lantern environmental prop, small isolated game object',
      seed: 123,
      outputDir,
    });

    expect(mockGen.calls).toHaveLength(1);
    expect(asset.fallbackGenerated).toBe(true);
    expect(asset.provider).toBe('procedural');
    expect(asset.fallbackReason).toBeDefined();
    // The real provider error must be captured verbatim, not swapped for a generic message —
    // same diagnosability fix already applied to the character/VFX paths (d72869f/e1681b9).
    expect(asset.fallbackReason).toContain('CONTENT_FILTERED: mock content-safety rejection for lantern');
    expect(asset.fallbackReason).toContain('nvidia-image');

    const dims = decodePngRgba(asset.buffer);
    expect(dims.width).toBe(32);
    expect(dims.height).toBe(32);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('no imageGen (profile-gated / budget-exhausted) produces a distinct "not attempted" reason', async () => {
    const outputDir = mkTmp('gated');
    const pipeline = new AssetPipeline();

    const asset = await callGeneratePropFamilyAsset(pipeline, {
      id: 'biome_0_prop_family_lantern',
      path: 'assets/props/biome_0/biome_0_prop_0.png',
      family: 'lantern',
      fill: '#284878',
      accent: '#c4a060',
      width: 32,
      height: 32,
      imageGen: null,
      prompt: 'lantern environmental prop, small isolated game object',
      seed: 123,
      outputDir,
    });

    expect(asset.fallbackGenerated).toBe(true);
    expect(asset.provider).toBe('procedural');
    expect(asset.fallbackReason).toBeDefined();
    expect(asset.fallbackReason).toMatch(/not attempted/i);
    // Must be distinguishable from the "we tried and it failed" reason above.
    expect(asset.fallbackReason).not.toContain('CONTENT_FILTERED');

    rmSync(outputDir, { recursive: true, force: true });
  });
});

describe('AssetPipeline.generate prop AI gate (real end-to-end pipeline, mocked provider)', () => {
  it('never attempts real prop generation outside VISUAL_VERTICAL_SLICE, and does (capped, per-family) for VISUAL_VERTICAL_SLICE', async () => {
    // Always-fails provider: every asset category (player/enemy/boss/tileset/vfx/icons/props)
    // gracefully falls back to procedural, so the whole pipeline stays safe to run end-to-end —
    // the only thing under test here is *which prompts were ever sent*.
    const allPrompts: string[] = [];
    activeMock.provider = {
      id: 'nvidia-image',
      async checkHealth() {
        return true;
      },
      async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
        allPrompts.push(request.prompt);
        throw new Error('mock provider unavailable — simulated for test');
      },
    };

    const propMarker = 'environmental prop';

    // --- TINY_TEST: AI must never be attempted for props ---
    {
      const dna = baseDna('TINY_TEST');
      const art = generateArtBible(dna, dna.seed);
      const style = generateStyleBible(dna, art);
      const visualDNA = generateVisualDNA({ gameDna: dna, artBible: art, styleBible: style });
      const biomes = generateAllBiomeVisualDNA({ visualDNA, gameDna: dna });
      const kit = generateEnvironmentKit({ visualDNA, biome: biomes[0]!, profile: 'TINY_TEST', seed: dna.seed });

      allPrompts.length = 0;
      const outputDir = mkTmp('gate-tiny');
      const pipeline = new AssetPipeline();
      await pipeline.generate({
        gameDna: dna,
        profile: 'TINY_TEST',
        seed: dna.seed,
        outputDir,
        skipVlm: true,
        visualDNA,
        environmentKits: [kit],
        styleBible: style,
        artBible: art,
      });

      const propCalls = allPrompts.filter((p) => p.includes(propMarker));
      expect(propCalls).toHaveLength(0);
      rmSync(outputDir, { recursive: true, force: true });
    }

    // --- VISUAL_VERTICAL_SLICE: AI must be attempted, capped per distinct prop family ---
    {
      const dna = baseDna('VISUAL_VERTICAL_SLICE');
      const art = generateArtBible(dna, dna.seed);
      const style = generateStyleBible(dna, art);
      const visualDNA = generateVisualDNA({ gameDna: dna, artBible: art, styleBible: style });
      const biomes = generateAllBiomeVisualDNA({ visualDNA, gameDna: dna });
      const kit = generateEnvironmentKit({
        visualDNA,
        biome: biomes[0]!,
        profile: 'VISUAL_VERTICAL_SLICE',
        seed: dna.seed,
      });
      expect(kit.props.length).toBeGreaterThanOrEqual(12);

      allPrompts.length = 0;
      const outputDir = mkTmp('gate-vvs');
      const pipeline = new AssetPipeline();
      await pipeline.generate({
        gameDna: dna,
        profile: 'VISUAL_VERTICAL_SLICE',
        seed: dna.seed,
        outputDir,
        skipVlm: true,
        visualDNA,
        environmentKits: [kit],
        styleBible: style,
        artBible: art,
      });

      const propCalls = allPrompts.filter((p) => p.includes(propMarker));
      const distinctFamilies = new Set(
        kit.props.map((p) => (p.family.includes('moss') || p.family.includes('plant') ? 'debris' : p.family)),
      );
      expect(propCalls.length).toBeGreaterThan(0);
      // One real call per distinct family, never one per individual prop instance, and never
      // more than the hard MAX_AI_PROP_FAMILIES backstop.
      expect(propCalls.length).toBeLessThanOrEqual(Math.min(distinctFamilies.size, 6));
      expect(propCalls.length).toBeLessThan(kit.props.length);

      rmSync(outputDir, { recursive: true, force: true });
    }

    activeMock.provider = null;
  }, 30000);
});
