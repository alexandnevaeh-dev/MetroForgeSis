import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type { GameDNA, ArtBible } from '@metroforge/schemas';
import {
  generateProceduralSprite,
  generateTilesetSource,
  generateWalkCycleSheet,
  generateHurtFlashSheet,
  generateAttackSheet,
  generateVfxTexture,
  type SpriteSpec,
  type VfxSpec,
} from './png.js';
import { PixelArtProcessor } from './pixel-art-processor.js';
import { ComfyUIProvider } from './providers/comfyui.js';
import { DiffusersProvider } from './providers/diffusers.js';
import { NvidiaImageProvider } from './providers/nvidia-image.js';
import { ImageProviderRegistry } from './image-router.js';
import type { VisionCritic } from './vision-critic-factory.js';
import { createVisionCritic } from './vision-critic-factory.js';
import { runDeterministicAssetChecks } from './vlm-critic.js';
import { critiqueAnimationSheet, critiqueTilesetSheet } from './animation-critic.js';
import type { ImageGenerationProfile } from './types/vision.js';
import type { ImageGenerator, ImageConditioning } from './types/image-gen.js';
import type { GenerationMode, GenerationProfile } from '@metroforge/shared';
import {
  PROFILE_DEFAULTS,
  throwIfCancelled,
  inferAssetMaturity,
  isProviderUserEnabled,
  critiqueEffectivelyPassed,
} from '@metroforge/shared';
import type { AssetMaturity, AssetSourceType } from '@metroforge/shared';

export interface GeneratedAsset {
  id: string;
  path: string;
  buffer: Buffer;
  provider: string;
  /** The specific model id an image-generation provider reported for this asset
   *  (ImageGenResult.modelId) — absent for procedural/checkpoint/pixel-art-processor assets,
   *  which genuinely have no underlying model to name. */
  modelId?: string;
  fallbackGenerated: boolean;
  critiquePassed: boolean;
  critiqueScore: number;
  maturity: AssetMaturity;
  productionReady: boolean;
  sourceType: AssetSourceType;
  /** Sidecar AI/full-res PNG kept when `path` holds the pixel-art compiled output. */
  sourcePath?: string;
  fallbackDepth?: number;
  fallbackReason?: string;
  selectedProvider?: string;
  selectedModel?: string;
  requestedCapability?: string;
  productionAllowed?: boolean;
}

/** `assets/foo/bar.png` → `assets/foo/bar_source.png` (never overwrites the compiled path). */
export function derivedSourceRelPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/');
  const dot = normalized.lastIndexOf('.');
  if (dot <= 0) return `${normalized}_source`;
  return `${normalized.slice(0, dot)}_source${normalized.slice(dot)}`;
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
  nvidiaApiKey?: string;
  nvidiaApiBaseUrl?: string;
  nvidiaImageModel?: string;
  nvidiaVisionModel?: string;
  ollamaBaseUrl?: string;
  skipVlm?: boolean;
  skipImageGen?: boolean;
  /** Per-NPC art metadata from generated game content. */
  npcs?: Array<{
    id: string;
    name?: string;
    role?: string;
  }>;
  /** Per-boss art metadata from generated game content. */
  bosses?: Array<{
    id: string;
    name?: string;
    lore?: string;
    visualPrompt?: string;
    isFinal?: boolean;
    attacks?: string[];
  }>;
  /** Reuse already-generated sprite files on disk instead of regenerating them. */
  resume?: boolean;
  /** Routing constraint for image-provider selection — LOCAL_ONLY excludes any registered
   *  provider that isn't local. Remote providers are never rejected for low local VRAM. */
  mode?: GenerationMode;
  /** When LOW_RESOURCE, ImageProviderRegistry prefers remote/hosted image providers. */
  hardwareProfile?: string;
  /** When aborted, generation stops at the next cooperative checkpoint. */
  signal?: AbortSignal;
  /** Per-provider Settings toggles (missing ⇒ enabled). */
  providerEnabled?: Record<string, boolean>;
  onTaskStarted?: (task: string, message: string) => void;
  onTaskProgress?: (task: string, current: number, total: number, message: string) => void;
  onArtifact?: (asset: GeneratedAsset, assetType: string) => void;
}

export interface AssetPipelineResult {
  assets: GeneratedAsset[];
  warnings: string[];
  /** True when any required visual asset used procedural/placeholder fallback. */
  degraded: boolean;
  fallbackDepth: number;
  fallbackReason?: string;
  selectedProvider?: string;
}

const NPC_ROLE_COLORS: Record<string, [number, number, number]> = {
  quest_giver: [220, 180, 70],
  merchant: [70, 170, 120],
  lore: [150, 90, 200],
  companion: [90, 160, 220],
  neutral: [180, 140, 100],
};

const NPC_ROLES = ['quest_giver', 'merchant', 'lore', 'neutral'] as const;

const BIOME_PALETTES: [number, number, number][][] = [
  [[40, 45, 55], [70, 75, 90], [100, 130, 200], [180, 100, 80]],
  [[30, 50, 35], [55, 90, 60], [90, 160, 100], [200, 180, 60]],
  [[50, 30, 60], [90, 50, 110], [160, 80, 180], [240, 200, 255]],
  [[55, 40, 30], [100, 70, 45], [180, 120, 60], [220, 200, 160]],
  [[25, 35, 50], [45, 65, 90], [80, 140, 180], [200, 220, 240]],
];

function buildNpcImagePrompt(
  npc: NonNullable<AssetPipelineOptions['npcs']>[number],
  gameDna: GameDNA,
  artBible: ArtBible | undefined,
): string {
  const role = npc.role ?? 'neutral';
  const guideline = artBible?.characterGuidelines.npc;
  if (guideline) {
    return `${guideline}, ${role} NPC named ${npc.name ?? npc.id}, ${gameDna.identity.visualStyle} pixel art`;
  }
  return `${gameDna.identity.visualStyle} pixel art humanoid NPC sprite, ${role} named ${npc.name ?? npc.id}, ${gameDna.identity.tone} tone, ${gameDna.narrative.premise}`;
}

function buildBossImagePrompt(
  boss: NonNullable<AssetPipelineOptions['bosses']>[number],
  gameDna: GameDNA,
  artBible: ArtBible | undefined,
  isFinal: boolean,
): string {
  if (boss.visualPrompt) return boss.visualPrompt;
  if (isFinal && artBible?.characterGuidelines.boss) return artBible.characterGuidelines.boss;
  const attackHint =
    boss.attacks && boss.attacks.length > 0 ? `, attacks: ${boss.attacks.join(', ')}` : '';
  const role = isFinal ? 'final boss' : `mini boss ${boss.name ?? boss.id}`;
  return `${gameDna.identity.visualStyle} pixel art game boss sprite, ${role}, ${boss.lore ?? gameDna.narrative.centralConflict}${attackHint}, ${gameDna.identity.tone} tone`;
}

const VFX_TEXTURES: VfxSpec[] = [
  {
    id: 'hit_spark',
    size: 16,
    core: [255, 240, 120, 255],
    edge: [255, 80, 40, 255],
    style: 'burst',
  },
  {
    id: 'death_puff',
    size: 24,
    core: [210, 210, 230, 220],
    edge: [90, 90, 110, 0],
    style: 'burst',
  },
  {
    id: 'dash_trail',
    size: 20,
    core: [120, 200, 255, 220],
    edge: [40, 120, 255, 0],
    style: 'streak',
  },
  {
    id: 'pickup_spark',
    size: 16,
    core: [255, 220, 80, 255],
    edge: [255, 255, 200, 0],
    style: 'burst',
  },
  {
    id: 'ability_unlock',
    size: 20,
    core: [140, 220, 255, 255],
    edge: [255, 255, 255, 0],
    style: 'burst',
  },
  {
    id: 'boss_phase_shift',
    size: 32,
    core: [255, 120, 220, 255],
    edge: [120, 40, 180, 0],
    style: 'burst',
  },
  {
    id: 'area_burst',
    size: 24,
    core: [255, 180, 60, 255],
    edge: [255, 60, 20, 0],
    style: 'burst',
  },
  {
    id: 'slam_shock',
    size: 28,
    core: [220, 220, 255, 240],
    edge: [80, 80, 140, 0],
    style: 'streak',
  },
];

/** Routes image generation through `ImageProviderRegistry` (capability-based selection —
 *  see image-router.ts) instead of hardcoding "try ComfyUI, then try Diffusers." Priority
 *  order (ComfyUI over Diffusers) and observable fallback behavior are unchanged from
 *  before this was routed — only the selection mechanism moved from ad hoc sequential
 *  `if`s to a registry the same shape as the text-generation routing uses. */
async function resolveImageGenerator(options: {
  comfyuiUrl?: string;
  diffusersPython?: string;
  diffusersModelId?: string;
  nvidiaApiKey?: string;
  nvidiaApiBaseUrl?: string;
  nvidiaImageModel?: string;
  mode?: GenerationMode;
  hardwareProfile?: string;
  providerEnabled?: Record<string, boolean>;
}): Promise<{
  generator: ImageGenerator | null;
  warnings: string[];
  fallbackDepth: number;
  fallbackReason?: string;
  selectedProvider?: string;
}> {
  const registry = new ImageProviderRegistry();
  const allow = (id: string) => isProviderUserEnabled(options.providerEnabled, id);

  if (options.comfyuiUrl && allow('comfyui')) {
    registry.register({
      provider: new ComfyUIProvider({ baseUrl: options.comfyuiUrl }),
      local: true,
      priority: 90,
    });
  }

  if (options.nvidiaApiKey && allow('nvidia-image')) {
    registry.register({
      provider: new NvidiaImageProvider({
        apiKey: options.nvidiaApiKey,
        baseUrl: options.nvidiaApiBaseUrl,
        modelId: options.nvidiaImageModel,
        pythonPath: options.diffusersPython,
      }),
      local: false,
      priority: 88,
    });
  }

  if (allow('diffusers')) {
    registry.register({
      provider: new DiffusersProvider({
        pythonPath: options.diffusersPython,
        modelId: options.diffusersModelId,
      }),
      local: true,
      priority: 85,
    });
  }

  const selected = await registry.selectHealthy({
    mode: options.mode,
    hardwareProfile: options.hardwareProfile,
  });
  if (selected.generator) {
    return {
      generator: selected.generator,
      warnings: selected.warnings,
      fallbackDepth: selected.fallbackDepth,
      fallbackReason: selected.fallbackReason,
      selectedProvider: selected.selectedProvider,
    };
  }
  return {
    generator: null,
    warnings: [...selected.warnings, 'using procedural assets'],
    fallbackDepth: selected.fallbackDepth,
    fallbackReason: selected.fallbackReason,
    selectedProvider: undefined,
  };
}

function withMaturity(
  asset: Omit<GeneratedAsset, 'maturity' | 'productionReady' | 'sourceType' | 'critiquePassed' | 'critiqueScore'> &
    Partial<Pick<GeneratedAsset, 'maturity' | 'productionReady' | 'sourceType' | 'critiquePassed' | 'critiqueScore'>>,
): GeneratedAsset {
  const inferred = inferAssetMaturity({
    fallbackGenerated: asset.fallbackGenerated,
    provider: asset.provider,
    critiquePassed: asset.critiquePassed,
    critiqueScore: asset.critiqueScore,
    sourceType: asset.sourceType,
  });
  return {
    ...asset,
    critiquePassed: asset.critiquePassed ?? false,
    critiqueScore: asset.critiqueScore ?? 0,
    maturity: asset.maturity ?? inferred.maturity,
    productionReady: asset.productionReady ?? inferred.productionReady,
    sourceType: asset.sourceType ?? inferred.sourceType,
    productionAllowed: asset.productionAllowed ?? !asset.fallbackGenerated,
  };
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

function inferAssetTypeFromPath(path: string): string {
  if (path.includes('/vfx/')) return 'vfx';
  if (path.includes('/tilesets/')) return path.includes('/tiles/') ? 'tile' : 'tileset';
  if (path.includes('/bosses/')) return 'boss';
  if (path.includes('/enemies/')) return 'enemy';
  if (path.includes('/npcs/')) {
    return path.includes('_walk') ? 'animation' : 'npc';
  }
  if (path.includes('/characters/')) return path.includes('_walk') || path.includes('_hurt') || path.includes('_attack') ? 'animation' : 'player';
  return 'texture';
}

function loadManifestArtifacts(outputDir: string): GeneratedAsset[] | null {
  const manifestPath = join(outputDir, 'generation_manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      artifacts?: Array<Record<string, unknown>>;
    };
    const artifacts = manifest.artifacts ?? [];
    if (artifacts.length === 0) return null;

    const loaded: GeneratedAsset[] = [];
    for (const artifact of artifacts) {
      const relPath = String(artifact.path ?? '').replace(/\\/g, '/');
      if (!relPath || !relPath.endsWith('.png')) continue;
      const fullPath = join(outputDir, relPath);
      if (!existsSync(fullPath)) return null;
      loaded.push(
        withMaturity({
          id: String(artifact.id ?? relPath),
          path: relPath,
          buffer: readFileSync(fullPath),
          provider: String(artifact.provider ?? 'checkpoint'),
          fallbackGenerated: Boolean(artifact.fallbackGenerated),
          critiquePassed: artifact.critiquePassed !== false,
          critiqueScore: Number(artifact.critiqueScore ?? 100),
          maturity: typeof artifact.maturity === 'string' ? (artifact.maturity as GeneratedAsset['maturity']) : undefined,
          productionReady: typeof artifact.productionReady === 'boolean' ? artifact.productionReady : undefined,
          sourceType: typeof artifact.sourceType === 'string' ? (artifact.sourceType as GeneratedAsset['sourceType']) : undefined,
        }),
      );
    }
    return loaded.length > 0 ? loaded : null;
  } catch {
    return null;
  }
}

export class AssetPipeline {
  private readonly pixelArt = new PixelArtProcessor();

  async generate(options: AssetPipelineOptions): Promise<AssetPipelineResult> {
    const assets: GeneratedAsset[] = [];
    const warnings: string[] = [];
    const checkCancelled = () => throwIfCancelled(options.signal);
    const recordAsset = (asset: Omit<GeneratedAsset, 'maturity' | 'productionReady' | 'sourceType'> &
      Partial<Pick<GeneratedAsset, 'maturity' | 'productionReady' | 'sourceType'>>, assetType: string) => {
      const finalized = withMaturity(asset);
      assets.push(finalized);
      options.onArtifact?.(finalized, assetType);
    };

    checkCancelled();

    if (options.resume) {
      const cachedAssets = loadManifestArtifacts(options.outputDir);
      if (cachedAssets) {
        options.onTaskStarted?.('environment_assets', 'Resuming from generation_manifest.json');
        for (const asset of cachedAssets) {
          recordAsset(asset, inferAssetTypeFromPath(asset.path));
        }
        warnings.push(
          `Resumed ${cachedAssets.length} asset(s) from generation_manifest.json — skipped regeneration`,
        );
        const degraded = cachedAssets.some((a) => a.fallbackGenerated || a.maturity === 'PLACEHOLDER');
        return {
          assets,
          warnings,
          degraded,
          fallbackDepth: degraded ? 1 : 0,
          fallbackReason: degraded ? 'Resumed assets include procedural placeholders' : undefined,
        };
      }
    }

    const defaults = PROFILE_DEFAULTS[options.profile];
    const tileSize = options.gameDna.technical.tileSize;
    const negativePrompt = options.artBible?.negativePrompts.join(', ');

    const imageRoute = options.skipImageGen
      ? {
          generator: null as ImageGenerator | null,
          warnings: [] as string[],
          fallbackDepth: 0,
          fallbackReason: 'Image generation skipped',
          selectedProvider: undefined as string | undefined,
        }
      : await resolveImageGenerator({
          comfyuiUrl: options.comfyuiUrl,
          diffusersPython: options.diffusersPython,
          diffusersModelId: options.diffusersModelId,
          nvidiaApiKey: options.nvidiaApiKey,
          nvidiaApiBaseUrl: options.nvidiaApiBaseUrl,
          nvidiaImageModel: options.nvidiaImageModel,
          mode: options.mode,
          hardwareProfile: options.hardwareProfile,
          providerEnabled: options.providerEnabled,
        });
    const imageGen = imageRoute.generator;
    const providerWarnings = imageRoute.warnings;
    warnings.push(...providerWarnings);

    const vlm: VisionCritic = createVisionCritic({
      ollamaBaseUrl: options.ollamaBaseUrl,
      nvidiaApiKey: options.nvidiaApiKey,
      nvidiaApiBaseUrl: options.nvidiaApiBaseUrl,
      nvidiaVisionModel: options.nvidiaVisionModel,
    });
    const vlmAvailable = options.skipVlm ? false : await vlm.isAvailable();
    if (!vlmAvailable && !options.skipVlm) {
      warnings.push('VLM critic unavailable — using deterministic asset checks');
    }

    const playerPrompt =
      options.artBible?.characterGuidelines.player ??
      `${options.gameDna.identity.visualStyle} player character ${options.gameDna.narrative.protagonist}`;

    options.onTaskStarted?.('player_sprite', 'Generating player character sprite');
    checkCancelled();
    const playerSpec: SpriteSpec = {
      id: 'player',
      width: 32,
      height: 32,
      fill: [90, 140, 220, 255],
      accent: [240, 240, 250, 255],
      shape: 'humanoid',
    };
    const playerAsset = await this.generateSprite({
      id: 'player',
      path: 'assets/characters/player.png',
      spec: playerSpec,
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
      signal: options.signal,
    });
    recordAsset(playerAsset, 'player');

    // Reuse the real generated still as the animation source (matches the NPC/boss path below) —
    // previously these three always ran off generateProceduralSprite(spec)'s flat placeholder
    // shape even when playerAsset.buffer held real AI art, so a player with a real portrait could
    // still have visually disconnected placeholder walk/attack/hurt frames.
    const playerSource = playerAsset.fallbackGenerated ? undefined : playerAsset.buffer;
    recordAsset(
      this.buildWalkSheetAsset(
        'player',
        playerSpec,
        'assets/characters/player_walk.png',
        4,
        tileSize,
        playerSource,
      ),
      'animation',
    );
    recordAsset(
      this.buildAttackSheetAsset(
        'player',
        playerSpec,
        'assets/characters/player_attack.png',
        4,
        tileSize,
        playerSource,
      ),
      'animation',
    );
    recordAsset(
      this.buildHurtSheetAsset(
        'player',
        playerSpec,
        'assets/characters/player_hurt.png',
        4,
        tileSize,
        playerSource,
      ),
      'animation',
    );

    for (let i = 0; i < defaults.enemies; i++) {
      checkCancelled();
      const palette = BIOME_PALETTES[i % BIOME_PALETTES.length]!;
      const enemyId = `enemy_${i.toString().padStart(3, '0')}`;
      const enemySpec: SpriteSpec = {
        id: enemyId,
        width: 32,
        height: 32,
        fill: [palette[2]![0], palette[2]![1], palette[2]![2], 255],
        shape: 'enemy',
      };

      options.onTaskProgress?.(
        'enemy_sprite',
        i + 1,
        defaults.enemies,
        `Generating enemy ${i + 1} / ${defaults.enemies}`,
      );

      const enemyAsset = await this.generateSprite({
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
        signal: options.signal,
      });
      recordAsset(enemyAsset, 'enemy');

      const enemySource = enemyAsset.fallbackGenerated ? undefined : enemyAsset.buffer;
      recordAsset(
        this.buildWalkSheetAsset(
          enemyId,
          enemySpec,
          `assets/enemies/${enemyId}_walk.png`,
          4,
          tileSize,
          enemySource,
        ),
        'animation',
      );
      recordAsset(
        this.buildHurtSheetAsset(
          enemyId,
          enemySpec,
          `assets/enemies/${enemyId}_hurt.png`,
          4,
          tileSize,
          enemySource,
        ),
        'animation',
      );
      recordAsset(
        this.buildAttackSheetAsset(
          enemyId,
          enemySpec,
          `assets/enemies/${enemyId}_attack.png`,
          4,
          tileSize,
          enemySource,
        ),
        'animation',
      );
    }

    const npcList =
      options.npcs && options.npcs.length > 0
        ? options.npcs
        : Array.from({ length: defaults.npcs }, (_, i) => ({
            id: `npc_${i.toString().padStart(3, '0')}`,
            name: `NPC ${i + 1}`,
            role: NPC_ROLES[i % NPC_ROLES.length],
          }));

    for (let ni = 0; ni < npcList.length; ni++) {
      checkCancelled();
      const npc = npcList[ni]!;
      const npcId = npc.id;
      const role = npc.role ?? NPC_ROLES[ni % NPC_ROLES.length]!;
      const color = NPC_ROLE_COLORS[role] ?? NPC_ROLE_COLORS.neutral!;
      const npcSpec: SpriteSpec = {
        id: npcId,
        width: 32,
        height: 32,
        fill: [color[0], color[1], color[2], 255],
        shape: 'humanoid',
      };

      options.onTaskProgress?.(
        'npc_sprite',
        ni + 1,
        npcList.length,
        `Generating NPC ${ni + 1} / ${npcList.length}: ${npc.name ?? npcId}`,
      );

      const npcAsset = await this.generateSprite({
        id: npcId,
        path: `assets/npcs/${npcId}.png`,
        spec: npcSpec,
        profile: 'CHARACTER',
        prompt: buildNpcImagePrompt(npc, options.gameDna, options.artBible),
        imageGen,
        negativePrompt,
        vlm,
        vlmAvailable,
        artDirection: options.gameDna.identity.visualStyle,
        tileSize,
        seed: options.seed + 7000 + ni,
        outputDir: options.outputDir,
        resume: options.resume,
        signal: options.signal,
      });
      recordAsset(npcAsset, 'npc');
      recordAsset(
        this.buildWalkSheetAsset(
          npcId,
          npcSpec,
          `assets/npcs/${npcId}_walk.png`,
          4,
          tileSize,
          npcAsset.fallbackGenerated ? undefined : npcAsset.buffer,
        ),
        'animation',
      );
    }

    const bossList =
      options.bosses && options.bosses.length > 0
        ? options.bosses
        : Array.from({ length: defaults.bosses }, (_, i) => ({
            id: i === defaults.bosses - 1 ? 'boss_final' : `boss_${i.toString().padStart(3, '0')}`,
            name: i === defaults.bosses - 1 ? 'Final Boss' : `Boss ${i + 1}`,
          }));

    for (let bi = 0; bi < bossList.length; bi++) {
      checkCancelled();
      const boss = bossList[bi]!;
      const bossId = boss.id;
      const isFinal = bossId === 'boss_final' || bi === bossList.length - 1;
      const palette = BIOME_PALETTES[(bi + 2) % BIOME_PALETTES.length]!;
      const bossSize = isFinal ? 48 : 40;
      const bossSpec: SpriteSpec = {
        id: bossId,
        width: bossSize,
        height: bossSize,
        fill: [palette[2]![0], palette[2]![1], palette[2]![2], 255],
        shape: 'boss',
      };

      options.onTaskProgress?.(
        'boss_sprite',
        bi + 1,
        bossList.length,
        `Generating boss ${bi + 1} / ${bossList.length}: ${boss.name ?? bossId}`,
      );

      const bossPrompt = buildBossImagePrompt(boss, options.gameDna, options.artBible, isFinal);

      const bossAsset = await this.generateSprite({
        id: bossId,
        path: `assets/bosses/${bossId}.png`,
        spec: bossSpec,
        profile: 'BOSS',
        prompt: bossPrompt,
        imageGen,
        negativePrompt,
        vlm,
        vlmAvailable,
        artDirection: options.gameDna.identity.visualStyle,
        tileSize,
        seed: options.seed + 999 + bi * 17,
        outputDir: options.outputDir,
        resume: options.resume,
        signal: options.signal,
      });
      recordAsset(bossAsset, 'boss');

      const bossSource = bossAsset.fallbackGenerated ? undefined : bossAsset.buffer;
      recordAsset(
        this.buildWalkSheetAsset(
          bossId,
          bossSpec,
          `assets/bosses/${bossId}_walk.png`,
          3,
          tileSize,
          bossSource,
        ),
        'animation',
      );
      recordAsset(
        this.buildHurtSheetAsset(
          bossId,
          bossSpec,
          `assets/bosses/${bossId}_hurt.png`,
          3,
          tileSize,
          bossSource,
        ),
        'animation',
      );
      recordAsset(
        this.buildAttackSheetAsset(
          bossId,
          bossSpec,
          `assets/bosses/${bossId}_attack.png`,
          3,
          tileSize,
          bossSource,
        ),
        'animation',
      );
    }

    for (let b = 0; b < defaults.biomes; b++) {
      checkCancelled();
      options.onTaskProgress?.(
        'tileset',
        b + 1,
        defaults.biomes,
        `Generating biome tileset ${b + 1} / ${defaults.biomes}`,
      );
      const tilesetPath = `assets/tilesets/biome_${b}/source.png`;
      const cachedTileset = options.resume ? loadCheckpoint(options.outputDir, tilesetPath) : null;

      let processedBuffer: Buffer;
      let critiquePassed: boolean;
      let critiqueScore: number;
      let provider: string;
      let fallback: boolean;
      let modelId: string | undefined;

      if (cachedTileset) {
        processedBuffer = cachedTileset;
        critiquePassed = true;
        critiqueScore = 100;
        provider = 'checkpoint';
        fallback = false;
        modelId = undefined;
      } else {
        let tileBuffer = generateTilesetSource(options.seed + b * 100, 128);
        fallback = true;
        provider = 'procedural';
        modelId = undefined;

        if (imageGen) {
          try {
            checkCancelled();
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
              signal: options.signal,
            });
            tileBuffer = result.image;
            fallback = result.fallbackGenerated;
            provider = fallback ? 'procedural' : imageGen.id;
            modelId = fallback ? undefined : result.modelId;
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
        const sceneCheck = critiqueTilesetSheet(processedBuffer, tileSize);
        critiquePassed = detCheck.passed && sceneCheck.passed;
        critiqueScore = Math.min(detCheck.passed ? 75 : 50, sceneCheck.score);

        if (vlmAvailable) {
          checkCancelled();
          const critique = await vlm.critique({
            image: processedBuffer,
            assetType: 'tile',
            artDirection: options.gameDna.identity.visualStyle,
          });
          // Soft-pass: score >= 70 counts even when a strict VLM sets passed:false.
          critiquePassed =
            detCheck.passed && critiqueEffectivelyPassed(critique.passed, critique.score);
          critiqueScore = Math.min(critique.score, detCheck.passed ? 100 : 50);
        }

        writeCheckpoint(options.outputDir, tilesetPath, processedBuffer);
      }

      recordAsset(
        {
          id: `tileset_biome_${b}`,
          path: tilesetPath,
          buffer: processedBuffer,
          provider,
          modelId,
          fallbackGenerated: fallback,
          critiquePassed,
          critiqueScore,
        },
        'tileset',
      );

      // A tile slice's real/placeholder status is inherited from its parent tileset, not
      // hardcoded — this used to force every individual tile PNG to fallbackGenerated:true (and
      // therefore PLACEHOLDER maturity) even when it was sliced straight out of real AI-generated
      // art, purely because slicing itself is always a deterministic, non-AI step. The slicing
      // step doesn't invent or lose fidelity, so critiquePassed/critiqueScore correctly stay fixed
      // (the parent's critique already covers the whole sheet these tiles are cut from) — only
      // fallbackGenerated/provider should track where the source pixels actually came from.
      const tiles = this.pixelArt.sliceTiles(processedBuffer, tileSize);
      for (const [tileId, tileBuf] of tiles) {
        recordAsset(
          {
            id: `biome_${b}_${tileId}`,
            path: `assets/tilesets/biome_${b}/tiles/${tileId}.png`,
            buffer: tileBuf,
            provider: fallback ? 'procedural' : 'pixel-art-processor',
            fallbackGenerated: fallback,
            critiquePassed: true,
            critiqueScore: 100,
          },
          'tile',
        );
      }
    }

    options.onTaskStarted?.('vfx_textures', 'Generating gameplay VFX textures');
    for (let vi = 0; vi < VFX_TEXTURES.length; vi++) {
      checkCancelled();
      const vfx = VFX_TEXTURES[vi]!;
      options.onTaskProgress?.(
        'vfx_texture',
        vi + 1,
        VFX_TEXTURES.length,
        `Generating VFX ${vi + 1} / ${VFX_TEXTURES.length}: ${vfx.id}`,
      );
      const vfxPath = `assets/vfx/${vfx.id}.png`;
      const cachedVfx = options.resume ? loadCheckpoint(options.outputDir, vfxPath) : null;
      recordAsset(
        {
          id: vfx.id,
          path: vfxPath,
          buffer: cachedVfx ?? generateVfxTexture(vfx),
          provider: cachedVfx ? 'checkpoint' : 'procedural',
          fallbackGenerated: !cachedVfx,
          critiquePassed: true,
          critiqueScore: 100,
        },
        'vfx',
      );
      if (!cachedVfx) {
        writeCheckpoint(options.outputDir, vfxPath, assets[assets.length - 1]!.buffer);
      }
    }

    return {
      assets,
      warnings,
      degraded:
        !imageGen ||
        assets.some((a) => a.fallbackGenerated || a.maturity === 'PLACEHOLDER' || a.maturity === 'BLOCKOUT'),
      fallbackDepth: imageRoute.fallbackDepth + (imageGen ? 0 : 1),
      fallbackReason: imageRoute.fallbackReason,
      selectedProvider: imageRoute.selectedProvider ?? imageGen?.id,
    };
  }

  private buildWalkSheetAsset(
    id: string,
    spec: SpriteSpec,
    path: string,
    frameCount: number,
    tileSize: number,
    sourcePng?: Buffer,
  ): GeneratedAsset {
    const sheet = generateWalkCycleSheet(spec, frameCount, sourcePng);
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * frameCount,
      targetHeight: spec.height,
      tileSize,
    });
    const critique = critiqueAnimationSheet(processed.buffer, {
      frameCount,
      expectedFrameWidth: spec.width,
      expectedFrameHeight: spec.height,
      kind: 'walk',
    });
    return withMaturity({
      id: `${id}_walk`,
      path,
      buffer: processed.buffer,
      provider: sourcePng ? 'pixel-art-processor' : 'procedural',
      fallbackGenerated: !sourcePng,
      critiquePassed: critique.passed,
      critiqueScore: critique.score,
    });
  }

  private buildHurtSheetAsset(
    id: string,
    spec: SpriteSpec,
    path: string,
    frameCount: number,
    tileSize: number,
    sourcePng?: Buffer,
  ): GeneratedAsset {
    const sheet = generateHurtFlashSheet(spec, frameCount, sourcePng);
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * frameCount,
      targetHeight: spec.height,
      tileSize,
    });
    const critique = critiqueAnimationSheet(processed.buffer, {
      frameCount,
      expectedFrameWidth: spec.width,
      expectedFrameHeight: spec.height,
      kind: 'hurt',
    });
    return withMaturity({
      id: `${id}_hurt`,
      path,
      buffer: processed.buffer,
      provider: sourcePng ? 'pixel-art-processor' : 'procedural',
      fallbackGenerated: !sourcePng,
      critiquePassed: critique.passed,
      critiqueScore: critique.score,
    });
  }

  private buildAttackSheetAsset(
    id: string,
    spec: SpriteSpec,
    path: string,
    frameCount: number,
    tileSize: number,
    sourcePng?: Buffer,
  ): GeneratedAsset {
    const sheet = generateAttackSheet(spec, frameCount, sourcePng);
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * frameCount,
      targetHeight: spec.height,
      tileSize,
    });
    const critique = critiqueAnimationSheet(processed.buffer, {
      frameCount,
      expectedFrameWidth: spec.width,
      expectedFrameHeight: spec.height,
      kind: 'attack',
    });
    return withMaturity({
      id: `${id}_attack`,
      path,
      buffer: processed.buffer,
      provider: sourcePng ? 'pixel-art-processor' : 'procedural',
      fallbackGenerated: !sourcePng,
      critiquePassed: critique.passed,
      critiqueScore: critique.score,
    });
  }

  private async generateSprite(opts: {
    id: string;
    path: string;
    spec: SpriteSpec;
    profile: ImageGenerationProfile;
    prompt: string;
    imageGen: ImageGenerator | null;
    negativePrompt?: string;
    vlm: VisionCritic;
    vlmAvailable: boolean;
    artDirection: string;
    tileSize: number;
    seed: number;
    outputDir: string;
    resume?: boolean;
    signal?: AbortSignal;
    conditioning?: ImageConditioning;
  }): Promise<GeneratedAsset> {
    if (opts.resume) {
      const cached = loadCheckpoint(opts.outputDir, opts.path);
      if (cached) {
        return withMaturity({
          id: opts.id,
          path: opts.path,
          buffer: cached,
          provider: 'checkpoint',
          fallbackGenerated: false,
          critiquePassed: true,
          critiqueScore: 100,
        });
      }
    }

    let buffer = generateProceduralSprite(opts.spec);
    let provider = 'procedural';
    let fallback = true;
    let modelId: string | undefined;

    if (opts.imageGen) {
      try {
        throwIfCancelled(opts.signal);
        const result = await opts.imageGen.generateImage({
          profile: opts.profile,
          prompt: opts.prompt,
          negativePrompt: opts.negativePrompt,
          width: opts.spec.width * 4,
          height: opts.spec.height * 4,
          seed: opts.seed,
          signal: opts.signal,
          conditioning: opts.conditioning,
        });
        buffer = result.image;
        provider = result.provider;
        modelId = result.modelId;
        fallback = false;
      } catch {
        // keep procedural
      }
    }

    // Preserve full AI bytes beside the compiled game sprite — never overwrite source with
    // the downscaled pixel-art output.
    let sourcePath: string | undefined;
    if (!fallback) {
      sourcePath = derivedSourceRelPath(opts.path);
      writeCheckpoint(opts.outputDir, sourcePath, buffer);
    }

    const processed = this.pixelArt.process(buffer, {
      targetWidth: opts.spec.width,
      targetHeight: opts.spec.height,
      tileSize: opts.tileSize,
    });

    const det = runDeterministicAssetChecks(processed.buffer, opts.spec.width, opts.spec.height);
    let critiquePassed = det.passed;
    let critiqueScore = 70;

    if (opts.vlmAvailable) {
      throwIfCancelled(opts.signal);
      const assetType =
        opts.profile === 'BOSS' ? 'boss' : opts.profile === 'ENEMY' ? 'enemy' : 'character';
      // Critique the full source when available — tiny quantized sprites often false-fail.
      const critiqueImage = !fallback ? buffer : processed.buffer;
      const critique = await opts.vlm.critique({
        image: critiqueImage,
        assetType,
        artDirection: opts.artDirection,
      });
      // Soft-pass: remote gens with score >= 70 are QA_REVIEW, not REJECTED, when critic is strict.
      // Hard fail remains when deterministic checks fail (blank/corrupt/wrong dims).
      critiquePassed = det.passed && critiqueEffectivelyPassed(critique.passed, critique.score);
      critiqueScore = Math.min(critique.score, det.passed ? 100 : 50);
    }

    writeCheckpoint(opts.outputDir, opts.path, processed.buffer);

    return withMaturity({
      id: opts.id,
      path: opts.path,
      buffer: processed.buffer,
      provider,
      modelId,
      fallbackGenerated: fallback,
      critiquePassed,
      critiqueScore,
      // Compiled game sprite; source sidecar kept when AI succeeded.
      sourceType: fallback ? undefined : 'compiled',
      sourcePath,
      fallbackDepth: fallback ? 1 : 0,
      fallbackReason: fallback ? 'Image provider unavailable or failed — procedural placeholder' : undefined,
      selectedProvider: provider,
      selectedModel: modelId,
      requestedCapability: 'IMAGE_GENERATION',
      productionAllowed: !fallback,
    });
  }

  /**
   * Compile an existing AI/full-res source PNG through PixelArtProcessor without regenerating.
   * Writes compiled bytes to `compiledRelPath` and optionally re-persists `sourceRelPath`.
   */
  compileFromSource(opts: {
    id: string;
    sourcePng: Buffer;
    compiledRelPath: string;
    sourceRelPath?: string;
    outputDir: string;
    targetWidth: number;
    targetHeight: number;
    tileSize?: number;
    provider?: string;
    modelId?: string;
    critiquePassed?: boolean;
    critiqueScore?: number;
  }): GeneratedAsset {
    const sourceRel = opts.sourceRelPath ?? derivedSourceRelPath(opts.compiledRelPath);
    writeCheckpoint(opts.outputDir, sourceRel, opts.sourcePng);

    const processed = this.pixelArt.process(opts.sourcePng, {
      targetWidth: opts.targetWidth,
      targetHeight: opts.targetHeight,
      tileSize: opts.tileSize,
    });
    writeCheckpoint(opts.outputDir, opts.compiledRelPath, processed.buffer);

    const det = runDeterministicAssetChecks(
      processed.buffer,
      opts.targetWidth,
      opts.targetHeight,
    );
    if (!det.passed) {
      return withMaturity({
        id: opts.id,
        path: opts.compiledRelPath,
        buffer: processed.buffer,
        provider: opts.provider ?? 'pixel-art-processor',
        modelId: opts.modelId,
        fallbackGenerated: false,
        critiquePassed: false,
        critiqueScore: 40,
        sourceType: 'compiled',
        sourcePath: sourceRel,
        selectedProvider: opts.provider,
        selectedModel: opts.modelId,
        requestedCapability: 'PIXEL_ART_PROCESS',
        productionAllowed: true,
      });
    }

    // No VLM on offline compile → COMPILED (not auto QA_REVIEW / PRODUCTION_READY).
    // Caller may pass critiquePassed/score to promote to QA_REVIEW via soft-pass.
    return withMaturity({
      id: opts.id,
      path: opts.compiledRelPath,
      buffer: processed.buffer,
      provider: opts.provider ?? 'pixel-art-processor',
      modelId: opts.modelId,
      fallbackGenerated: false,
      critiquePassed: opts.critiquePassed,
      critiqueScore: opts.critiqueScore,
      sourceType: 'compiled',
      sourcePath: sourceRel,
      selectedProvider: opts.provider,
      selectedModel: opts.modelId,
      requestedCapability: 'PIXEL_ART_PROCESS',
      productionAllowed: true,
    });
  }

  /** Project-aware single-asset generation for the manual asset workspace. */
  async generateManual(opts: {
    gameDna: GameDNA;
    artBible?: ArtBible;
    description: string;
    assetType: string;
    assetId: string;
    relPath: string;
    outputDir: string;
    seed: number;
    mode?: GenerationMode;
    hardwareProfile?: string;
    comfyuiUrl?: string;
    diffusersPython?: string;
    diffusersModelId?: string;
    nvidiaApiKey?: string;
    nvidiaApiBaseUrl?: string;
    nvidiaImageModel?: string;
    nvidiaVisionModel?: string;
    ollamaBaseUrl?: string;
    providerEnabled?: Record<string, boolean>;
  }): Promise<GeneratedAsset> {
    const tileSize = opts.gameDna.technical.tileSize;
    const negativePrompt = opts.artBible?.negativePrompts.join(', ');
    const { generator: imageGen } = await resolveImageGenerator({
      comfyuiUrl: opts.comfyuiUrl,
      diffusersPython: opts.diffusersPython,
      diffusersModelId: opts.diffusersModelId,
      nvidiaApiKey: opts.nvidiaApiKey,
      nvidiaApiBaseUrl: opts.nvidiaApiBaseUrl,
      nvidiaImageModel: opts.nvidiaImageModel,
      mode: opts.mode,
      hardwareProfile: opts.hardwareProfile,
      providerEnabled: opts.providerEnabled,
    });
    const vlm = createVisionCritic({
      ollamaBaseUrl: opts.ollamaBaseUrl,
      nvidiaApiKey: opts.nvidiaApiKey,
      nvidiaApiBaseUrl: opts.nvidiaApiBaseUrl,
      nvidiaVisionModel: opts.nvidiaVisionModel,
    });
    const vlmAvailable = await vlm.isAvailable();

    let profile: ImageGenerationProfile = 'CHARACTER';
    let width = 32;
    let height = 32;
    let shape: SpriteSpec['shape'] = 'humanoid';

    switch (opts.assetType) {
      case 'enemy':
        profile = 'ENEMY';
        shape = 'enemy';
        break;
      case 'npc':
        profile = 'CHARACTER';
        shape = 'humanoid';
        break;
      case 'boss':
        profile = 'BOSS';
        width = 48;
        height = 48;
        shape = 'boss';
        break;
      case 'weapon':
      case 'item':
      case 'prop':
        width = 16;
        height = 16;
        shape = 'item';
        break;
      case 'tileset':
      case 'tile':
        profile = 'TILE_SOURCE';
        width = 128;
        height = 128;
        shape = 'tile';
        break;
      default:
        break;
    }

    const styleHint =
      opts.artBible?.characterGuidelines.player ??
      opts.gameDna.identity.visualStyle;
    const prompt = `${opts.description}. Art style: ${styleHint}. Pixel art for ${opts.gameDna.identity.title}.`;

    const sourceCandidate = join(opts.outputDir, derivedSourceRelPath(opts.relPath));
    const existingFullPath = join(opts.outputDir, opts.relPath);
    const conditioningPath = existsSync(sourceCandidate)
      ? sourceCandidate
      : existsSync(existingFullPath)
        ? existingFullPath
        : null;
    const conditioning: ImageConditioning | undefined = conditioningPath
      ? { mode: 'ip_adapter', image: readFileSync(conditioningPath), strength: 0.55 }
      : undefined;

    if (opts.assetType === 'tileset' || opts.assetType === 'tile') {
      let tileBuffer = generateTilesetSource(opts.seed, 128);
      let provider = 'procedural';
      let fallback = true;
      let modelId: string | undefined;
      if (imageGen) {
        try {
          const result = await imageGen.generateImage({
            profile: 'TILE_SOURCE',
            prompt,
            negativePrompt,
            width: 128,
            height: 128,
            seed: opts.seed,
            conditioning,
          });
          tileBuffer = result.image;
          fallback = result.fallbackGenerated;
          provider = fallback ? 'procedural' : imageGen.id;
          modelId = fallback ? undefined : result.modelId;
        } catch {
          /* procedural fallback */
        }
      }
      const processed = this.pixelArt.process(tileBuffer, {
        targetWidth: 128,
        targetHeight: 128,
        tileSize,
      });
      writeCheckpoint(opts.outputDir, opts.relPath, processed.buffer);
      return withMaturity({
        id: opts.assetId,
        path: opts.relPath,
        buffer: processed.buffer,
        provider,
        modelId,
        fallbackGenerated: fallback,
        critiquePassed: true,
        critiqueScore: 80,
        fallbackDepth: fallback ? 1 : 0,
        fallbackReason: fallback ? 'Image provider unavailable or failed — procedural placeholder' : undefined,
        selectedProvider: provider,
        selectedModel: modelId,
        requestedCapability: 'IMAGE_GENERATION',
        productionAllowed: !fallback,
      });
    }

    return this.generateSprite({
      id: opts.assetId,
      path: opts.relPath,
      spec: {
        id: opts.assetId,
        width,
        height,
        fill: [120, 100, 200, 255],
        shape,
      },
      profile,
      prompt,
      imageGen,
      negativePrompt,
      vlm,
      vlmAvailable,
      artDirection: opts.gameDna.identity.visualStyle,
      tileSize,
      seed: opts.seed,
      outputDir: opts.outputDir,
      conditioning,
    });
  }
}
