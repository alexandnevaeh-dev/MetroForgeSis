import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type { GameDNA, ArtBible } from '@metroforge/schemas';
import {
  generateProceduralSprite,
  generateTilesetSource,
  generateWalkCycleSheet,
  type SpriteSpec,
} from './png.js';
import { PixelArtProcessor } from './pixel-art-processor.js';
import { ComfyUIProvider } from './providers/comfyui.js';
import { DiffusersProvider } from './providers/diffusers.js';
import { VLMCritic, runDeterministicAssetChecks } from './vlm-critic.js';
import type { ImageGenerationProfile } from './types/vision.js';
import type { ImageGenerator } from './types/image-gen.js';
import type { GenerationProfile } from '@metroforge/shared';
import { PROFILE_DEFAULTS } from '@metroforge/shared';

export interface GeneratedAsset {
  id: string;
  path: string;
  buffer: Buffer;
  provider: string;
  fallbackGenerated: boolean;
  critiquePassed: boolean;
  critiqueScore: number;
}

export interface AssetPipelineOptions {
  gameDna: GameDNA;
  profile: GenerationProfile;
  seed: number;
  outputDir: string;
  artBible?: ArtBible;
  comfyuiUrl?: string;
  diffusersPython?: string;
  diffusersModelId?: string;
  ollamaBaseUrl?: string;
  skipVlm?: boolean;
  skipImageGen?: boolean;
  /** Reuse already-generated sprite files on disk instead of regenerating them. */
  resume?: boolean;
}

export interface AssetPipelineResult {
  assets: GeneratedAsset[];
  warnings: string[];
}

const BIOME_PALETTES: [number, number, number][][] = [
  [[40, 45, 55], [70, 75, 90], [100, 130, 200], [180, 100, 80]],
  [[30, 50, 35], [55, 90, 60], [90, 160, 100], [200, 180, 60]],
  [[50, 30, 60], [90, 50, 110], [160, 80, 180], [240, 200, 255]],
  [[55, 40, 30], [100, 70, 45], [180, 120, 60], [220, 200, 160]],
  [[25, 35, 50], [45, 65, 90], [80, 140, 180], [200, 220, 240]],
];

async function resolveImageGenerator(options: {
  comfyuiUrl?: string;
  diffusersPython?: string;
  diffusersModelId?: string;
}): Promise<{ generator: ImageGenerator | null; warnings: string[] }> {
  const warnings: string[] = [];

  if (options.comfyuiUrl) {
    const comfyui = new ComfyUIProvider({ baseUrl: options.comfyuiUrl });
    if (await comfyui.checkHealth()) return { generator: comfyui, warnings };
    warnings.push('ComfyUI unavailable');
  }

  const diffusers = new DiffusersProvider({
    pythonPath: options.diffusersPython,
    modelId: options.diffusersModelId,
  });
  if (await diffusers.checkHealth()) return { generator: diffusers, warnings };
  warnings.push('Diffusers worker unavailable — using procedural assets');

  return { generator: null, warnings };
}

function checkpointFullPath(outputDir: string, relPath: string): string {
  return join(outputDir, relPath.replace(/\//g, sep));
}

function loadCheckpoint(outputDir: string, relPath: string): Buffer | null {
  const full = checkpointFullPath(outputDir, relPath);
  if (!existsSync(full)) return null;
  try {
    return readFileSync(full);
  } catch {
    return null;
  }
}

function writeCheckpoint(outputDir: string, relPath: string, buffer: Buffer): void {
  const full = checkpointFullPath(outputDir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, buffer);
}

export class AssetPipeline {
  private readonly pixelArt = new PixelArtProcessor();

  async generate(options: AssetPipelineOptions): Promise<AssetPipelineResult> {
    const assets: GeneratedAsset[] = [];
    const warnings: string[] = [];
    const defaults = PROFILE_DEFAULTS[options.profile];
    const tileSize = options.gameDna.technical.tileSize;
    const negativePrompt = options.artBible?.negativePrompts.join(', ');

    const { generator: imageGen, warnings: providerWarnings } = options.skipImageGen
      ? { generator: null, warnings: [] as string[] }
      : await resolveImageGenerator({
          comfyuiUrl: options.comfyuiUrl,
          diffusersPython: options.diffusersPython,
          diffusersModelId: options.diffusersModelId,
        });
    warnings.push(...providerWarnings);

    const vlm = options.ollamaBaseUrl
      ? new VLMCritic({ ollamaBaseUrl: options.ollamaBaseUrl })
      : null;
    const vlmAvailable = vlm ? await vlm.isAvailable() : false;
    if (!vlmAvailable && !options.skipVlm) {
      warnings.push('VLM critic unavailable — using deterministic asset checks');
    }

    const playerPrompt =
      options.artBible?.characterGuidelines.player ??
      `${options.gameDna.identity.visualStyle} player character ${options.gameDna.narrative.protagonist}`;

    assets.push(
      await this.generateSprite({
        id: 'player',
        path: 'assets/characters/player.png',
        spec: {
          id: 'player',
          width: 32,
          height: 32,
          fill: [90, 140, 220, 255],
          accent: [240, 240, 250, 255],
          shape: 'humanoid',
        },
        profile: 'CHARACTER',
        prompt: playerPrompt,
        imageGen,
        negativePrompt,
        vlm,
        vlmAvailable,
        artDirection: options.gameDna.identity.visualStyle,
        tileSize,
        seed: options.seed,
        outputDir: options.outputDir,
        resume: options.resume,
      }),
    );

    const walkSheet = generateWalkCycleSheet(
      {
        id: 'player',
        width: 32,
        height: 32,
        fill: [90, 140, 220, 255],
        accent: [240, 240, 250, 255],
        shape: 'humanoid',
      },
      4,
    );
    const walkProcessed = this.pixelArt.process(walkSheet, {
      targetWidth: 128,
      targetHeight: 32,
      tileSize,
    });
    assets.push({
      id: 'player_walk_sheet',
      path: 'assets/characters/player_walk.png',
      buffer: walkProcessed.buffer,
      provider: 'procedural',
      fallbackGenerated: true,
      critiquePassed: true,
      critiqueScore: 100,
    });

    for (let i = 0; i < defaults.enemies; i++) {
      const palette = BIOME_PALETTES[i % BIOME_PALETTES.length]!;
      const enemyId = `enemy_${i.toString().padStart(3, '0')}`;
      const enemySpec: SpriteSpec = {
        id: enemyId,
        width: 32,
        height: 32,
        fill: [palette[2]![0], palette[2]![1], palette[2]![2], 255],
        shape: 'enemy',
      };

      assets.push(
        await this.generateSprite({
          id: enemyId,
          path: `assets/enemies/${enemyId}.png`,
          spec: enemySpec,
          profile: 'ENEMY',
          prompt: options.artBible?.characterGuidelines.enemy ?? `enemy creature biome ${i % defaults.biomes}`,
          imageGen,
          negativePrompt,
          vlm,
          vlmAvailable,
          artDirection: options.gameDna.identity.visualStyle,
          tileSize,
          seed: options.seed + i,
          outputDir: options.outputDir,
          resume: options.resume,
        }),
      );

      assets.push(
        this.buildWalkSheetAsset(enemyId, enemySpec, `assets/enemies/${enemyId}_walk.png`, 4, tileSize),
      );
    }

    const bossSpec: SpriteSpec = {
      id: 'boss_final',
      width: 48,
      height: 48,
      fill: [180, 60, 180, 255],
      shape: 'boss',
    };

    assets.push(
      await this.generateSprite({
        id: 'boss_final',
        path: 'assets/bosses/boss_final.png',
        spec: bossSpec,
        profile: 'BOSS',
        prompt:
          options.artBible?.characterGuidelines.boss ??
          `final boss ${options.gameDna.narrative.centralConflict}`,
        imageGen,
        negativePrompt,
        vlm,
        vlmAvailable,
        artDirection: options.gameDna.identity.visualStyle,
        tileSize,
        seed: options.seed + 999,
        outputDir: options.outputDir,
        resume: options.resume,
      }),
    );

    assets.push(
      this.buildWalkSheetAsset('boss_final', bossSpec, 'assets/bosses/boss_final_walk.png', 3, tileSize),
    );

    for (let b = 0; b < defaults.biomes; b++) {
      const tilesetPath = `assets/tilesets/biome_${b}/source.png`;
      const cachedTileset = options.resume ? loadCheckpoint(options.outputDir, tilesetPath) : null;

      let processedBuffer: Buffer;
      let critiquePassed: boolean;
      let critiqueScore: number;
      let provider: string;
      let fallback: boolean;

      if (cachedTileset) {
        processedBuffer = cachedTileset;
        critiquePassed = true;
        critiqueScore = 100;
        provider = 'checkpoint';
        fallback = false;
      } else {
        let tileBuffer = generateTilesetSource(options.seed + b * 100, 128);
        fallback = true;
        provider = 'procedural';

        if (imageGen) {
          try {
            const tilePrompt =
              options.artBible?.environmentGuidelines.tileStyle ??
              `${options.gameDna.identity.visualStyle} biome ${b} ground and wall tiles`;
            const result = await imageGen.generateImage({
              profile: 'TILE_SOURCE',
              prompt: tilePrompt,
              negativePrompt,
              width: 128,
              height: 128,
              seed: options.seed + b,
            });
            tileBuffer = result.image;
            fallback = result.fallbackGenerated;
            provider = fallback ? 'procedural' : imageGen.id;
          } catch {
            warnings.push(`Image gen tileset biome ${b} failed — procedural fallback`);
          }
        }

        const processed = this.pixelArt.process(tileBuffer, {
          targetWidth: 128,
          targetHeight: 128,
          tileSize,
          palette: BIOME_PALETTES[b % BIOME_PALETTES.length],
        });
        processedBuffer = processed.buffer;

        const detCheck = runDeterministicAssetChecks(processedBuffer, 128, 128);
        critiquePassed = detCheck.passed;
        critiqueScore = 75;

        if (vlm && vlmAvailable) {
          const critique = await vlm.critique({
            image: processedBuffer,
            assetType: 'tile',
            artDirection: options.gameDna.identity.visualStyle,
          });
          critiquePassed = critique.passed;
          critiqueScore = critique.score;
        }

        writeCheckpoint(options.outputDir, tilesetPath, processedBuffer);
      }

      assets.push({
        id: `tileset_biome_${b}`,
        path: tilesetPath,
        buffer: processedBuffer,
        provider,
        fallbackGenerated: fallback,
        critiquePassed,
        critiqueScore,
      });

      const tiles = this.pixelArt.sliceTiles(processedBuffer, tileSize);
      for (const [tileId, tileBuf] of tiles) {
        assets.push({
          id: `biome_${b}_${tileId}`,
          path: `assets/tilesets/biome_${b}/tiles/${tileId}.png`,
          buffer: tileBuf,
          provider: 'pixel-art-processor',
          fallbackGenerated: true,
          critiquePassed: true,
          critiqueScore: 100,
        });
      }
    }

    return { assets, warnings };
  }

  private buildWalkSheetAsset(
    id: string,
    spec: SpriteSpec,
    path: string,
    frameCount: number,
    tileSize: number,
  ): GeneratedAsset {
    const sheet = generateWalkCycleSheet(spec, frameCount);
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * frameCount,
      targetHeight: spec.height,
      tileSize,
    });
    return {
      id: `${id}_walk`,
      path,
      buffer: processed.buffer,
      provider: 'procedural',
      fallbackGenerated: true,
      critiquePassed: true,
      critiqueScore: 100,
    };
  }

  private async generateSprite(opts: {
    id: string;
    path: string;
    spec: SpriteSpec;
    profile: ImageGenerationProfile;
    prompt: string;
    imageGen: ImageGenerator | null;
    negativePrompt?: string;
    vlm: VLMCritic | null;
    vlmAvailable: boolean;
    artDirection: string;
    tileSize: number;
    seed: number;
    outputDir: string;
    resume?: boolean;
  }): Promise<GeneratedAsset> {
    if (opts.resume) {
      const cached = loadCheckpoint(opts.outputDir, opts.path);
      if (cached) {
        return {
          id: opts.id,
          path: opts.path,
          buffer: cached,
          provider: 'checkpoint',
          fallbackGenerated: false,
          critiquePassed: true,
          critiqueScore: 100,
        };
      }
    }

    let buffer = generateProceduralSprite(opts.spec);
    let provider = 'procedural';
    let fallback = true;

    if (opts.imageGen) {
      try {
        const result = await opts.imageGen.generateImage({
          profile: opts.profile,
          prompt: opts.prompt,
          negativePrompt: opts.negativePrompt,
          width: opts.spec.width * 4,
          height: opts.spec.height * 4,
          seed: opts.seed,
        });
        buffer = result.image;
        provider = result.provider;
        fallback = false;
      } catch {
        // keep procedural
      }
    }

    const processed = this.pixelArt.process(buffer, {
      targetWidth: opts.spec.width,
      targetHeight: opts.spec.height,
      tileSize: opts.tileSize,
    });

    const det = runDeterministicAssetChecks(processed.buffer, opts.spec.width, opts.spec.height);
    let critiquePassed = det.passed;
    let critiqueScore = 70;

    if (opts.vlm && opts.vlmAvailable) {
      const assetType =
        opts.profile === 'BOSS' ? 'boss' : opts.profile === 'ENEMY' ? 'enemy' : 'character';
      const critique = await opts.vlm.critique({
        image: processed.buffer,
        assetType,
        artDirection: opts.artDirection,
      });
      critiquePassed = critique.passed && det.passed;
      critiqueScore = Math.min(critique.score, det.passed ? 100 : 50);
    }

    writeCheckpoint(opts.outputDir, opts.path, processed.buffer);

    return {
      id: opts.id,
      path: opts.path,
      buffer: processed.buffer,
      provider,
      fallbackGenerated: fallback,
      critiquePassed,
      critiqueScore,
    };
  }
}
