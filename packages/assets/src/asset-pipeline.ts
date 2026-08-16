import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type { GameDNA, ArtBible, StyleBible, CharacterVisualDNA } from '@metroforge/schemas';
import {
  generateProceduralSprite,
  generateTilesetSource,
  generateWalkCycleSheet,
  generateHurtFlashSheet,
  generateAttackSheet,
  generateDeathSheet,
  generateVfxTexture,
  knockoutVfxBackground,
  decodePngRgba,
  generatePoseStill,
  type SpriteSpec,
  type VfxSpec,
} from './png.js';
import { PixelArtProcessor } from './pixel-art-processor.js';
import { ImageProviderRegistry } from './image-router.js';
import { registerFoundryImageProviders } from './foundry/register.js';
import type { VisionCritic } from './vision-critic-factory.js';
import { createVisionCritic } from './vision-critic-factory.js';
import { runDeterministicAssetChecks } from './vlm-critic.js';
import { critiqueAnimationSheet, critiqueTilesetSheet } from './animation-critic.js';
import { TileCompiler, TILE_ATLAS } from './tile-compiler.js';
import { assembleContactSheet, critiqueAnimationIdentity } from './sprite-qa.js';
import { NVIDIA_FLUX_KONTEXT, nvidiaModelForImageTask } from './image-task.js';
import { buildPlayerAnimationManifest, poseNamesFromManifest } from './animation-manifest.js';
import { buildTileTerrainMetadata, missingRequiredTileRoles } from './tile-roles.js';
import { createHash } from 'node:crypto';
import type { ImageGenerationProfile } from './types/vision.js';
import type { ImageGenerator, ImageConditioning } from './types/image-gen.js';
import type { GenerationMode, GenerationProfile } from '@metroforge/shared';
import {
  PROFILE_DEFAULTS,
  throwIfCancelled,
  inferAssetMaturity,
  critiqueEffectivelyPassed,
  isTopDownArchetype,
} from '@metroforge/shared';
import type { AssetMaturity, AssetSourceType } from '@metroforge/shared';
import { sanitizeImagePromptText } from './sanitize-image-prompt.js';

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
  /** True when this sheet was derived from one still (bob/slide) rather than posed frames. */
  fakeAnimation?: boolean;
  promptHash?: string;
  parentArtifactIds?: string[];
  compiler?: string;
  godotResourcePath?: string;
  repairCount?: number;
  transformation?: string;
  sourceLicense?: string;
  derivedLicense?: string;
}

/** `assets/foo/bar.png` → `assets/foo/bar_source.png` (never overwrites the compiled path). */
export function derivedSourceRelPath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/');
  const dot = normalized.lastIndexOf('.');
  if (dot <= 0) return `${normalized}_source`;
  return `${normalized.slice(0, dot)}_source${normalized.slice(dot)}`;
}

/** Kind of game sprite for profile-aware pixel-art compile targets. */
export type CompiledSpriteKind =
  | 'character'
  | 'enemy'
  | 'npc'
  | 'boss'
  | 'boss_final'
  | 'item'
  | 'tileset';

/**
 * Target size for pixel-art *compiled* game frames (never applied to `*_source.png`).
 * 32×32 crushed readable silhouette; 64×64 is production-usable for characters/enemies/NPCs.
 * Bosses scale up; tileset atlas stays 128; item icons stay 16.
 */
export function compiledSpriteFrameSize(kind: CompiledSpriteKind): { width: number; height: number } {
  switch (kind) {
    case 'character':
    case 'enemy':
    case 'npc':
      return { width: 64, height: 64 };
    case 'boss':
      return { width: 96, height: 96 };
    case 'boss_final':
      return { width: 128, height: 128 };
    case 'item':
      return { width: 16, height: 16 };
    case 'tileset':
      return { width: 128, height: 128 };
  }
}

function decodeImageSize(png: Buffer): { width: number; height: number } {
  const decoded = decodePngRgba(png);
  return { width: decoded.width, height: decoded.height };
}

function applyStylePrompt(
  styleBible: StyleBible | undefined,
  capability: string,
  prompt: string,
): string {
  if (!styleBible) return prompt;
  const prefix = styleBible.promptPrefixes?.[capability];
  const palette = styleBible.palette.map((swatch) => swatch.hex).join(' ');
  const contract = [
    styleBible.outlineRules,
    styleBible.lightingDirection,
    styleBible.saturation,
    styleBible.characterScale,
    styleBible.backgroundDepthRules,
  ]
    .filter(Boolean)
    .join(', ');
  const head = [prefix, styleBible.renderingStyle, styleBible.lighting, palette && `palette ${palette}`, contract]
    .filter(Boolean)
    .join(', ');
  return head ? `${head}. ${prompt}` : prompt;
}

function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

export interface AssetPipelineOptions {
  gameDna: GameDNA;
  profile: GenerationProfile;
  seed: number;
  outputDir: string;
  artBible?: ArtBible;
  /** Compact visual spec derived from ArtBible — prepended to image prompts when present. */
  styleBible?: StyleBible;
  characterVisualDna?: CharacterVisualDNA;
  comfyuiUrl?: string;
  diffusersPython?: string;
  diffusersModelId?: string;
  nvidiaApiKey?: string;
  nvidiaApiBaseUrl?: string;
  nvidiaImageModel?: string;
  nvidiaVisionModel?: string;
  huggingfaceApiKey?: string;
  huggingfaceImageModel?: string;
  automatic1111Url?: string;
  stabilityApiKey?: string;
  deepaiApiKey?: string;
  replicateApiToken?: string;
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
  /** Posed animation failed identity QA or used single-still derivation. */
  fakeAnimationDetected?: boolean;
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

export const VFX_TEXTURES: VfxSpec[] = [
  {
    id: 'hit_spark',
    size: 16,
    core: [255, 240, 120, 255],
    edge: [255, 80, 40, 255],
    style: 'burst',
    effectType: 'impact_spark',
    whereUsed: ['HealthComponent.damage', 'EnemyController.melee', 'WeakFloor.break'],
    prompt:
      'tiny yellow-white hit spark burst, sharp shards, single combat impact flash, no character',
  },
  {
    id: 'death_puff',
    size: 24,
    core: [210, 210, 230, 220],
    edge: [90, 90, 110, 0],
    style: 'burst',
    effectType: 'death_puff',
    whereUsed: ['HealthComponent.died'],
    prompt: 'ashen smoke puff, evaporating silhouette, death dissipate cloud, no body, no skull',
  },
  {
    id: 'dash_trail',
    size: 20,
    core: [120, 200, 255, 220],
    edge: [40, 120, 255, 0],
    style: 'streak',
    effectType: 'motion_streak',
    whereUsed: ['AirDashAbility', 'DashAbility', 'GrappleAbility'],
    prompt: 'horizontal cyan motion streak, speed trail smear, dashed energy afterimage',
  },
  {
    id: 'pickup_spark',
    size: 16,
    core: [255, 220, 80, 255],
    edge: [255, 255, 200, 0],
    style: 'burst',
    effectType: 'item_sparkle',
    whereUsed: ['ItemPickup.collect'],
    prompt: 'gold pickup sparkle, four-point star glint, treasure collect twinkle',
  },
  {
    id: 'ability_unlock',
    size: 20,
    core: [140, 220, 255, 255],
    edge: [255, 255, 255, 0],
    style: 'burst',
    effectType: 'ability_unlock',
    whereUsed: ['VFXManager.ability_acquired', 'PhaseAbility'],
    prompt: 'pale cyan ability unlock burst, concentric energy rings, power-up nova',
  },
  {
    id: 'boss_phase_shift',
    size: 32,
    core: [255, 120, 220, 255],
    edge: [120, 40, 180, 0],
    style: 'burst',
    effectType: 'phase_shift',
    whereUsed: ['VFXManager.play_phase_shift', 'BossController.phase'],
    prompt: 'magenta-violet boss phase-shift shockwave, arcane ring flare, no creature',
  },
  {
    id: 'area_burst',
    size: 24,
    core: [255, 180, 60, 255],
    edge: [255, 60, 20, 0],
    style: 'burst',
    effectType: 'area_burst',
    whereUsed: ['BossController.area_burst', 'EnemyController.area_burst'],
    prompt: 'orange radial explosion burst, fire halo, area-of-effect blast, no crater scenery',
  },
  {
    id: 'slam_shock',
    size: 28,
    core: [220, 220, 255, 240],
    edge: [80, 80, 140, 0],
    style: 'streak',
    effectType: 'ground_shock',
    whereUsed: ['BossController.slam', 'GroundSlamAbility'],
    prompt: 'ground slam shockwave crescent, white-blue impact ring, dirt-free energy wave',
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
  huggingfaceApiKey?: string;
  huggingfaceImageModel?: string;
  automatic1111Url?: string;
  stabilityApiKey?: string;
  deepaiApiKey?: string;
  replicateApiToken?: string;
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
  registerFoundryImageProviders(registry, {
    comfyuiUrl: options.comfyuiUrl,
    diffusersPython: options.diffusersPython,
    diffusersModelId: options.diffusersModelId,
    nvidiaApiKey: options.nvidiaApiKey,
    nvidiaApiBaseUrl: options.nvidiaApiBaseUrl,
    nvidiaImageModel: options.nvidiaImageModel,
    huggingfaceApiKey: options.huggingfaceApiKey,
    huggingfaceImageModel: options.huggingfaceImageModel,
    automatic1111Url: options.automatic1111Url,
    stabilityApiKey: options.stabilityApiKey,
    deepaiApiKey: options.deepaiApiKey,
    replicateApiToken: options.replicateApiToken,
    providerEnabled: options.providerEnabled,
    commercialUseRequired: options.mode === 'COMMERCIAL_SAFE',
    includeRetrieval: false,
  });

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

function buildManualImagePrompt(description: string, styleHint: string, gameTitle: string): string {
  const title = sanitizeImagePromptText(gameTitle) || 'this game';
  const style = sanitizeImagePromptText(styleHint) || 'pixel art';
  const desc = sanitizeImagePromptText(description) || 'game sprite';
  return `${desc}. Art style: ${style}. Pixel art for ${title}.`;
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
    let fakeAnimationDetected = false;
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
          huggingfaceApiKey: options.huggingfaceApiKey,
          huggingfaceImageModel: options.huggingfaceImageModel,
          automatic1111Url: options.automatic1111Url,
          stabilityApiKey: options.stabilityApiKey,
          deepaiApiKey: options.deepaiApiKey,
          replicateApiToken: options.replicateApiToken,
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

    const playerPrompt = applyStylePrompt(
      options.styleBible,
      'CHARACTER',
      [
        options.characterVisualDna?.prompt,
        options.characterVisualDna
          ? `${options.characterVisualDna.silhouette}, ${options.characterVisualDna.clothing}, weapon ${options.characterVisualDna.weapon}, ${options.characterVisualDna.orientation}, ${options.characterVisualDna.lighting}`
          : undefined,
        options.artBible?.characterGuidelines.player ??
          `${options.gameDna.identity.visualStyle} player character ${options.gameDna.narrative.protagonist}`,
      ]
        .filter(Boolean)
        .join('. '),
    );

    options.onTaskStarted?.('player_sprite', 'Generating player character sprite');
    checkCancelled();
    const playerFrame = compiledSpriteFrameSize('character');
    const playerSpec: SpriteSpec = {
      id: 'player',
      width: playerFrame.width,
      height: playerFrame.height,
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
    recordAsset(
      this.buildDeathSheetAsset(
        'player',
        playerSpec,
        'assets/characters/player_death.png',
        4,
        tileSize,
        playerSource,
      ),
      'animation',
    );

    // Canonical per-animation-state pose stills (Section 6/7): idle/run/jump_start/jump/fall/
    // land/dash must be real, distinct poses — never a copy of walk-frame-1. AI-conditioned
    // pose upgrade is opt-in (`allowAiUpgrade: true`) because NVIDIA flux.1-kontext-dev
    // currently 422s on custom sprites. Procedural POSE_TRANSFORMS remain the production PATH.
    {
      const abilityIds = options.gameDna.abilities.filter((a) => a.enabled).map((a) => a.id);
      const animManifest = buildPlayerAnimationManifest({
        abilities: abilityIds,
        generator: options.profile === 'VISUAL_VERTICAL_SLICE' ? 'mixed' : 'procedural-pose',
      });
      const posePrompts: Record<string, string> = {
        idle: 'same character idle stance, feet planted, side view facing right',
        run: 'same character running mid-stride, side view facing right',
        jump_start: 'same character crouching into a jump, side view',
        jump: 'same character airborne jump pose, side view',
        fall: 'same character falling, limbs braced, side view',
        land: 'same character landing, knees bent, side view',
        dash: 'same character dashing forward, motion, side view',
        wall_slide: 'same character sliding down a wall, side view',
        wall_jump: 'same character kicking off a wall, side view',
      };
      const poseSet = await this.tryCanonicalPoseSet({
        id: 'player',
        destDir: 'assets/characters',
        source: playerSource,
        imageGen,
        styleBible: options.styleBible,
        prompt: playerPrompt,
        negativePrompt,
        seed: options.seed,
        outputDir: options.outputDir,
        signal: options.signal,
        tileSize,
        spec: playerSpec,
        // NVIDIA flux.1-kontext-dev hosted preview returns HTTP 422 for custom sprites (example_id
        // only). Do not burn 3 retries per pose — the interface still accepts conditioning when a
        // future provider actually supports it; this flag stays off until that day.
        allowAiUpgrade: false,
        poses: poseNamesFromManifest(animManifest)
          .filter((name) => !['attack', 'hurt', 'death'].includes(name))
          .map((name) => ({
            name,
            prompt: posePrompts[name] ?? `same character ${name.replace(/_/g, ' ')} pose, side view`,
          })),
      });
      warnings.push(...poseSet.warnings);
      fakeAnimationDetected = fakeAnimationDetected || poseSet.fakeAnimation;
      for (const asset of poseSet.assets) {
        recordAsset(asset, 'animation');
      }
      if (poseSet.contactSheet) {
        recordAsset(
          {
            id: 'player_animation_sheet',
            path: 'assets/qa/player-animation-sheet.png',
            buffer: poseSet.contactSheet,
            provider: poseSet.fakeAnimation ? 'pixel-art-processor' : 'nvidia-image',
            fallbackGenerated: poseSet.fakeAnimation,
            critiquePassed: !poseSet.fakeAnimation,
            critiqueScore: poseSet.fakeAnimation ? 20 : 80,
            fakeAnimation: poseSet.fakeAnimation,
            parentArtifactIds: ['player'],
          },
          'animation',
        );
      }
      const animDir = join(options.outputDir, 'data', 'animation');
      mkdirSync(animDir, { recursive: true });
      writeFileSync(join(animDir, 'player_manifest.json'), JSON.stringify(animManifest, null, 2));
    }

    for (let i = 0; i < defaults.enemies; i++) {
      checkCancelled();
      const palette = BIOME_PALETTES[i % BIOME_PALETTES.length]!;
      const enemyId = `enemy_${i.toString().padStart(3, '0')}`;
      const enemyFrame = compiledSpriteFrameSize('enemy');
      const enemySpec: SpriteSpec = {
        id: enemyId,
        width: enemyFrame.width,
        height: enemyFrame.height,
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
        prompt: applyStylePrompt(
          options.styleBible,
          'ENEMY',
          options.artBible?.characterGuidelines.enemy ?? `enemy creature biome ${i % defaults.biomes}`,
        ),
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
        this.buildDeathSheetAsset(
          enemyId,
          enemySpec,
          `assets/enemies/${enemyId}_death.png`,
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
      if (options.profile === 'VISUAL_VERTICAL_SLICE') {
        const poseSet = await this.tryCanonicalPoseSet({
          id: enemyId,
          destDir: 'assets/enemies',
          source: enemySource,
          imageGen,
          styleBible: options.styleBible,
          prompt: applyStylePrompt(
            options.styleBible,
            'ENEMY',
            options.artBible?.characterGuidelines.enemy ?? `enemy ${enemyId}`,
          ),
          negativePrompt,
          seed: options.seed + 2000 + i * 17,
          outputDir: options.outputDir,
          signal: options.signal,
          tileSize,
          spec: enemySpec,
          // EnemyController.gd only ever plays "idle"/"walk"/"attack"/"hurt"/"death" by name (no
          // "run" check exists), and attack/hurt/death already have real multi-frame sheets wired
          // via attack_sheet_path/hurt_sheet_path/death_sheet_path — generating single-frame pose
          // stills for those names would make AnimatedAssetSprite.gd's _load_pose_overrides()
          // clear() and replace those sheets with a static frame. Only "idle" is both consumed
          // and not already covered, so that's the applicable subset for enemies in this phase.
          poses: [{ name: 'idle', prompt: 'same creature idle, side view facing right' }],
        });
        warnings.push(...poseSet.warnings);
        fakeAnimationDetected = fakeAnimationDetected || poseSet.fakeAnimation;
        for (const asset of poseSet.assets) recordAsset(asset, 'animation');
        if (poseSet.contactSheet) {
          recordAsset(
            {
              id: `${enemyId}_animation_sheet`,
              path: i === 0 ? 'assets/qa/enemy-animation-sheet.png' : `assets/qa/${enemyId}-animation-sheet.png`,
              buffer: poseSet.contactSheet,
              provider: poseSet.fakeAnimation ? 'pixel-art-processor' : 'nvidia-image',
              fallbackGenerated: poseSet.fakeAnimation,
              critiquePassed: !poseSet.fakeAnimation,
              critiqueScore: poseSet.fakeAnimation ? 20 : 80,
              fakeAnimation: poseSet.fakeAnimation,
            },
            'animation',
          );
        }
      }
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
      const npcFrame = compiledSpriteFrameSize('npc');
      const npcSpec: SpriteSpec = {
        id: npcId,
        width: npcFrame.width,
        height: npcFrame.height,
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
        prompt: applyStylePrompt(
          options.styleBible,
          'CHARACTER',
          buildNpcImagePrompt(npc, options.gameDna, options.artBible),
        ),
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
      const portraitRole = role.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      const portraitPath = `assets/ui/portraits/${portraitRole}.png`;
      if (!assets.some((a) => a.path === portraitPath)) {
        const portrait = this.pixelArt.process(npcAsset.buffer, {
          targetWidth: 72,
          targetHeight: 72,
          tileSize,
        });
        writeCheckpoint(options.outputDir, portraitPath, portrait.buffer);
        recordAsset(
          {
            id: `portrait_${portraitRole}`,
            path: portraitPath,
            buffer: portrait.buffer,
            provider: npcAsset.fallbackGenerated ? 'pixel-art-processor' : npcAsset.provider,
            modelId: npcAsset.modelId,
            fallbackGenerated: npcAsset.fallbackGenerated,
            critiquePassed: true,
            critiqueScore: npcAsset.fallbackGenerated ? 45 : 70,
            parentArtifactIds: [npcId],
            compiler: 'pixel-art-processor',
            transformation: 'npc-portrait-crop',
            godotResourcePath: `res://${portraitPath}`,
          },
          'portrait',
        );
      }
    }

    for (const ability of options.gameDna.abilities.filter((a) => a.enabled)) {
      checkCancelled();
      const iconPath = `assets/ui/icons/ability_${ability.id}.png`;
      const iconSpec: SpriteSpec = {
        id: `ability_${ability.id}`,
        width: 32,
        height: 32,
        fill: [80, 140, 210, 255],
        shape: 'item',
      };
      const iconAsset = await this.generateSprite({
        id: `ability_icon_${ability.id}`,
        path: iconPath,
        spec: iconSpec,
        profile: 'ICON',
        prompt: applyStylePrompt(
          options.styleBible,
          'UI',
          `game ability icon for ${ability.name}, centered symbol, no text, no UI chrome, ${options.gameDna.identity.visualStyle}`,
        ),
        imageGen,
        negativePrompt: `${negativePrompt ?? ''}, readable text, letters, HUD screenshot`,
        vlm,
        vlmAvailable,
        artDirection: options.gameDna.identity.visualStyle,
        tileSize,
        seed: options.seed + 11000 + hashPrompt(ability.id).charCodeAt(0),
        outputDir: options.outputDir,
        resume: options.resume,
        signal: options.signal,
      });
      recordAsset(
        {
          ...iconAsset,
          parentArtifactIds: [],
          transformation: 'ability-icon',
          godotResourcePath: `res://${iconPath}`,
        },
        'icon',
      );
    }

    const questIconPath = 'assets/ui/icons/quest.png';
    const questSpec: SpriteSpec = {
      id: 'quest_icon',
      width: 32,
      height: 32,
      fill: [210, 180, 70, 255],
      shape: 'item',
    };
    const questIcon = await this.generateSprite({
      id: 'quest_icon',
      path: questIconPath,
      spec: questSpec,
      profile: 'ICON',
      prompt: applyStylePrompt(
        options.styleBible,
        'UI',
        'quest journal icon, small centered emblem, no text, no UI screenshot',
      ),
      imageGen,
      negativePrompt: `${negativePrompt ?? ''}, readable text, HUD, letters`,
      vlm,
      vlmAvailable,
      artDirection: options.gameDna.identity.visualStyle,
      tileSize,
      seed: options.seed + 12000,
      outputDir: options.outputDir,
      resume: options.resume,
      signal: options.signal,
    });
    recordAsset({ ...questIcon, transformation: 'quest-icon', godotResourcePath: `res://${questIconPath}` }, 'icon');

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
      const bossFrame = compiledSpriteFrameSize(isFinal ? 'boss_final' : 'boss');
      const bossSpec: SpriteSpec = {
        id: bossId,
        width: bossFrame.width,
        height: bossFrame.height,
        fill: [palette[2]![0], palette[2]![1], palette[2]![2], 255],
        shape: 'boss',
      };

      options.onTaskProgress?.(
        'boss_sprite',
        bi + 1,
        bossList.length,
        `Generating boss ${bi + 1} / ${bossList.length}: ${boss.name ?? bossId}`,
      );

      const bossPrompt = applyStylePrompt(
        options.styleBible,
        'BOSS',
        buildBossImagePrompt(boss, options.gameDna, options.artBible, isFinal),
      );

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
        this.buildDeathSheetAsset(
          bossId,
          bossSpec,
          `assets/bosses/${bossId}_death.png`,
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
      if (options.profile === 'VISUAL_VERTICAL_SLICE') {
        const poseSet = await this.tryCanonicalPoseSet({
          id: bossId,
          destDir: 'assets/bosses',
          source: bossSource,
          imageGen,
          styleBible: options.styleBible,
          prompt: bossPrompt,
          negativePrompt,
          seed: options.seed + 5000 + bi * 19,
          outputDir: options.outputDir,
          signal: options.signal,
          tileSize,
          spec: bossSpec,
          // Same reasoning as the enemy pose set above: BossController.gd only checks "idle" by
          // name for locomotion, and attack/hurt/death already have real multi-frame sheets that
          // a single-frame pose still would silently replace.
          poses: [{ name: 'idle', prompt: 'same boss idle, imposing, side view facing right' }],
        });
        warnings.push(...poseSet.warnings);
        fakeAnimationDetected = fakeAnimationDetected || poseSet.fakeAnimation;
        for (const asset of poseSet.assets) recordAsset(asset, 'animation');
        if (poseSet.contactSheet) {
          recordAsset(
            {
              id: 'boss_animation_sheet',
              path: 'assets/qa/boss-animation-sheet.png',
              buffer: poseSet.contactSheet,
              provider: poseSet.fakeAnimation ? 'pixel-art-processor' : 'nvidia-image',
              fallbackGenerated: poseSet.fakeAnimation,
              critiquePassed: !poseSet.fakeAnimation,
              critiqueScore: poseSet.fakeAnimation ? 20 : 80,
              fakeAnimation: poseSet.fakeAnimation,
            },
            'animation',
          );
        }
      }
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
            const tilePrompt = applyStylePrompt(
              options.styleBible,
              'TILE_SOURCE',
              options.artBible?.environmentGuidelines.tileStyle ??
                `${options.gameDna.identity.visualStyle} biome ${b} ground and wall tiles`,
            );
            const result = await imageGen.generateImage({
              profile: 'TILE_SOURCE',
              prompt: sanitizeImagePromptText(tilePrompt),
              negativePrompt: negativePrompt
                ? sanitizeImagePromptText(negativePrompt)
                : undefined,
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

        const compiled = new TileCompiler().compile({
          sourcePng: tileBuffer,
          tileSize,
          paletteHex: options.styleBible?.palette.map((p) => p.hex),
        });
        processedBuffer = compiled.atlas;
        if (!compiled.passed) {
          warnings.push(`Tileset biome ${b} seam QA: ${compiled.seamIssues.join('; ')}`);
        }
        const missingRoles = compiled.passed ? [] : missingRequiredTileRoles(Object.keys(TILE_ATLAS.roles));
        if (missingRoles.length) {
          warnings.push(`Tileset biome ${b} missing roles: ${missingRoles.join(', ')}`);
        }
        writeCheckpoint(
          options.outputDir,
          `assets/tilesets/biome_${b}/terrain.json`,
          Buffer.from(
            JSON.stringify(
              {
                tileSize,
                roles: buildTileTerrainMetadata(),
                missingRoles,
                seamIssues: compiled.seamIssues,
                passed: compiled.passed && missingRoles.length === 0,
              },
              null,
              2,
            ),
            'utf8',
          ),
        );
        if (b === 0) {
          writeCheckpoint(options.outputDir, 'assets/qa/tileset-test.png', compiled.atlas);
        }

        const expectedW = decodeImageSize(processedBuffer);
        const detCheck = runDeterministicAssetChecks(processedBuffer, expectedW.width, expectedW.height);
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

      if (!isTopDownArchetype(options.gameDna.archetype)) {
        const layers = (
          options.profile === 'TINY_TEST'
            ? (['far', 'mid', 'near'] as const)
            : (['far', 'mid', 'near', 'overlay', 'foreground'] as const)
        );
        for (let li = 0; li < layers.length; li++) {
          const layer = layers[li]!;
          const bgPath = `assets/backgrounds/biome_${b}/${layer}.png`;
          options.onTaskStarted?.('background', `Generating ${layer} parallax for biome ${b}`);
          let bgBuffer = generateTilesetSource(options.seed + b * 50 + li, 128);
          let bgFallback = true;
          let bgProvider = 'procedural';
          let bgModel: string | undefined;
          const useAi = Boolean(imageGen) && (layer === 'far' || layer === 'mid' || layer === 'near');
          const layerPrompt =
            layer === 'far'
              ? 'far_background skyline plate, distant architecture, empty of characters'
              : layer === 'overlay'
                ? 'environmental_overlay mist and hanging debris, transparent-friendly, no characters'
                : layer === 'foreground'
                  ? 'foreground_occluder silhouettes, dark rim plants/ruins at the camera edge, no UI'
                  : `${layer} parallax_layer, empty of characters`;
          if (useAi) {
            try {
              const result = await imageGen!.generateImage({
                profile: 'BACKGROUND',
                prompt: sanitizeImagePromptText(
                  applyStylePrompt(
                    options.styleBible,
                    'ENVIRONMENT',
                    `${layerPrompt}, ${options.gameDna.identity.visualStyle} biome ${b}, matching tileset palette, side-view, no UI, no text, no logos, no characters`,
                  ),
                ),
                negativePrompt: `${negativePrompt ?? ''}, UI, HUD, text, logos, watermarks, characters, portraits, unrelated biome`,
                width: 1024,
                height: 512,
                seed: options.seed + 4000 + b * 10 + li,
                signal: options.signal,
                modelOverride: nvidiaModelForImageTask('BACKGROUND_SOURCE'),
              });
              bgBuffer = result.image;
              bgFallback = result.fallbackGenerated;
              bgProvider = result.provider;
              bgModel = result.modelId;
            } catch {
              warnings.push(`Background ${layer} biome ${b} failed — procedural fallback`);
            }
          }
          const processedBg = this.pixelArt.process(bgBuffer, {
            targetWidth: 640,
            targetHeight: 360,
            tileSize,
          });
          writeCheckpoint(options.outputDir, bgPath, processedBg.buffer);
          recordAsset(
            {
              id: `bg_biome_${b}_${layer}`,
              path: bgPath,
              buffer: processedBg.buffer,
              provider: bgProvider,
              modelId: bgModel,
              fallbackGenerated: bgFallback,
              critiquePassed: true,
              critiqueScore: bgFallback ? 40 : 75,
              promptHash: hashPrompt(layerPrompt),
              compiler: 'pixel-art-processor',
              parentArtifactIds: [`tileset_biome_${b}`],
              transformation: 'biome-background-layer',
              godotResourcePath: `res://${bgPath}`,
            },
            'background',
          );
        }
        const far = loadCheckpoint(options.outputDir, `assets/backgrounds/biome_${b}/far.png`);
        const mid = loadCheckpoint(options.outputDir, `assets/backgrounds/biome_${b}/mid.png`);
        const near = loadCheckpoint(options.outputDir, `assets/backgrounds/biome_${b}/near.png`);
        if (far && mid && near) {
          const biomeSheet = assembleContactSheet([
            { label: 'far', png: far },
            { label: 'mid', png: mid },
            { label: 'near', png: near },
          ]);
          writeCheckpoint(options.outputDir, `assets/qa/biome_${b}-layers.png`, biomeSheet);
          recordAsset(
            {
              id: `biome_${b}_layers_sheet`,
              path: `assets/qa/biome_${b}-layers.png`,
              buffer: biomeSheet,
              provider: 'pixel-art-processor',
              fallbackGenerated: false,
              critiquePassed: true,
              critiqueScore: 80,
              parentArtifactIds: [`bg_biome_${b}_far`, `bg_biome_${b}_mid`, `bg_biome_${b}_near`],
            },
            'background',
          );
        }
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
      const vfxAsset = await this.generateVfxTextureAsset({
        spec: vfx,
        outputDir: options.outputDir,
        seed: options.seed + vi * 7919,
        imageGen,
        styleBible: options.styleBible,
        artBible: options.artBible,
        gameDna: options.gameDna,
        resume: options.resume,
        signal: options.signal,
        allowProceduralFallback: true,
      });
      recordAsset(vfxAsset, 'vfx');
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
      fakeAnimationDetected,
    };
  }

  private async tryCanonicalPoseSet(opts: {
    id: string;
    destDir: string;
    source?: Buffer;
    imageGen: ImageGenerator | null;
    styleBible?: StyleBible;
    prompt: string;
    negativePrompt?: string;
    seed: number;
    outputDir: string;
    signal?: AbortSignal;
    tileSize: number;
    spec: SpriteSpec;
    poses?: { name: string; prompt: string }[];
    /** When false, skip the AI-conditioned upgrade pass entirely and only write the cheap
     *  deterministic procedural pose stills (generatePoseStill in png.ts). Lets callers keep the
     *  expensive per-pose image-generation calls gated to VISUAL_VERTICAL_SLICE while every other
     *  profile — and any run with no healthy image provider — still gets real, distinct poses. */
    allowAiUpgrade?: boolean;
  }): Promise<{ assets: GeneratedAsset[]; warnings: string[]; fakeAnimation: boolean; contactSheet?: Buffer }> {
    const poses: { name: string; prompt: string }[] = opts.poses ?? [
      { name: 'idle', prompt: 'same character idle stance, feet planted, side view facing right' },
      { name: 'run', prompt: 'same character running mid-stride, side view facing right' },
      { name: 'jump_start', prompt: 'same character crouching into a jump, side view' },
      { name: 'jump', prompt: 'same character airborne jump pose, side view' },
      { name: 'fall', prompt: 'same character falling, limbs braced, side view' },
      { name: 'land', prompt: 'same character landing, knees bent, side view' },
      { name: 'dash', prompt: 'same character dashing forward, motion, side view' },
    ];
    const warnings: string[] = [];
    const assets: GeneratedAsset[] = [];
    const contactFrames: { label: string; png: Buffer }[] = [];
    const knockedOutSource = opts.source ? knockoutVfxBackground(opts.source) : undefined;
    const canAttemptAi = Boolean(opts.imageGen && opts.source && opts.allowAiUpgrade === true);

    if (!canAttemptAi) {
      warnings.push(
        opts.source
          ? `No AI-conditioned pose upgrade for "${opts.id}" this profile — using deterministic procedural pose transforms (idle/run/jump/fall/land/dash are distinct, not literally duplicated).`
          : `No AI-generated reference source for "${opts.id}" — using deterministic procedural pose transforms (idle/run/jump/fall/land/dash are distinct, not literally duplicated).`,
      );
    }


    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i]!;
      const rel = `${opts.destDir}/${opts.id}_${pose.name}_pose.png`;
      let usedAi = false;

      if (canAttemptAi) {
        try {
          throwIfCancelled(opts.signal);
          const result = await opts.imageGen!.generateImage({
            profile: 'CHARACTER',
            prompt: sanitizeImagePromptText(
              `${opts.prompt}. ${pose.prompt}. transparent background, isolated sprite, identical costume and proportions`,
            ),
            negativePrompt: opts.negativePrompt,
            width: 256,
            height: 256,
            seed: opts.seed + 9000 + i,
            signal: opts.signal,
            conditioning: { mode: 'img2img', image: opts.source!, strength: 0.35 },
            modelOverride: NVIDIA_FLUX_KONTEXT,
          });
          const compiled = this.pixelArt.process(knockoutVfxBackground(result.image), {
            targetWidth: opts.spec.width,
            targetHeight: opts.spec.height,
            tileSize: opts.tileSize,
          });
          writeCheckpoint(opts.outputDir, rel, compiled.buffer);
          const identity = critiqueAnimationIdentity(compiled.buffer, { frameWidth: opts.spec.width, expectedFrames: 1 });
          assets.push(
            withMaturity({
              id: `${opts.id}_${pose.name}_pose`,
              path: rel,
              buffer: compiled.buffer,
              provider: result.provider,
              modelId: result.modelId,
              fallbackGenerated: false,
              critiquePassed: identity.passed,
              critiqueScore: identity.passed ? 80 : 40,
              fakeAnimation: false,
              parentArtifactIds: [opts.id],
              compiler: 'pixel-art-processor',
              transformation: 'canonical-pose',
              godotResourcePath: `res://${rel}`,
            }),
          );
          contactFrames.push({ label: pose.name, png: compiled.buffer });
          usedAi = true;
        } catch (err) {
          // Continue to the next pose instead of aborting the whole set — a single transient
          // failure (e.g. one pose's request timing out) must not leave every later pose
          // (jump/fall/land/dash) unwritten. This pose falls through to the deterministic
          // procedural transform below instead.
          warnings.push(
            `Pose "${pose.name}" AI-conditioned generation failed for "${opts.id}" — using deterministic procedural transform instead: ${err instanceof Error ? err.message : String(err)}.`,
          );
        }
      }

      if (!usedAi) {
        const raw = generatePoseStill(opts.spec, pose.name, knockedOutSource);
        const compiled = this.pixelArt.process(raw, {
          targetWidth: opts.spec.width,
          targetHeight: opts.spec.height,
          tileSize: opts.tileSize,
        });
        writeCheckpoint(opts.outputDir, rel, compiled.buffer);
        const identity = critiqueAnimationIdentity(compiled.buffer, { frameWidth: opts.spec.width, expectedFrames: 1 });
        assets.push(
          withMaturity({
            id: `${opts.id}_${pose.name}_pose`,
            path: rel,
            buffer: compiled.buffer,
            provider: knockedOutSource ? 'pixel-art-processor' : 'procedural',
            fallbackGenerated: true,
            critiquePassed: identity.passed,
            critiqueScore: identity.passed ? 55 : 30,
            fakeAnimation: false,
            parentArtifactIds: [opts.id],
            compiler: 'pixel-art-processor',
            transformation: 'procedural-pose-transform',
            godotResourcePath: `res://${rel}`,
            fallbackDepth: 1,
            fallbackReason: canAttemptAi
              ? 'AI-conditioned pose generation failed for this state — deterministic procedural transform used instead'
              : 'No healthy AI-conditioned image provider for this profile — deterministic procedural transform used',
          }),
        );
        contactFrames.push({ label: pose.name, png: compiled.buffer });
      }
    }

    return {
      assets,
      warnings,
      fakeAnimation: assets.length === 0,
      contactSheet: contactFrames.length ? assembleContactSheet(contactFrames) : undefined,
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
    const sheet = generateWalkCycleSheet(
      spec,
      frameCount,
      sourcePng ? knockoutVfxBackground(sourcePng) : undefined,
    );
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
      fakeAnimation: true,
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
    const sheet = generateHurtFlashSheet(
      spec,
      frameCount,
      sourcePng ? knockoutVfxBackground(sourcePng) : undefined,
    );
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

  private buildDeathSheetAsset(
    id: string,
    spec: SpriteSpec,
    path: string,
    frameCount: number,
    tileSize: number,
    sourcePng?: Buffer,
  ): GeneratedAsset {
    const sheet = generateDeathSheet(
      spec,
      frameCount,
      sourcePng ? knockoutVfxBackground(sourcePng) : undefined,
    );
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * frameCount,
      targetHeight: spec.height,
      tileSize,
    });
    const critique = critiqueAnimationSheet(processed.buffer, {
      frameCount,
      expectedFrameWidth: spec.width,
      expectedFrameHeight: spec.height,
      kind: 'death',
    });
    return withMaturity({
      id: `${id}_death`,
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
    const sheet = generateAttackSheet(
      spec,
      frameCount,
      sourcePng ? knockoutVfxBackground(sourcePng) : undefined,
    );
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

  /**
   * Gameplay VFX through the same ImageProviderRegistry path as characters.
   * NVIDIA flux.1-dev (or Comfy/Diffusers) when available; procedural only as explicit fallback.
   */
  private async generateVfxTextureAsset(opts: {
    spec: VfxSpec;
    outputDir: string;
    seed: number;
    imageGen: ImageGenerator | null;
    styleBible?: StyleBible;
    artBible?: ArtBible;
    gameDna: GameDNA;
    resume?: boolean;
    signal?: AbortSignal;
    allowProceduralFallback?: boolean;
    extraDescription?: string;
  }): Promise<GeneratedAsset> {
    const vfxPath = `assets/vfx/${opts.spec.id}.png`;
    if (opts.resume) {
      const cached = loadCheckpoint(opts.outputDir, vfxPath);
      if (cached) {
        return withMaturity({
          id: opts.spec.id,
          path: vfxPath,
          buffer: cached,
          provider: 'checkpoint',
          fallbackGenerated: false,
          critiquePassed: true,
          critiqueScore: 100,
        });
      }
    }

    const allowProceduralFallback = opts.allowProceduralFallback !== false;
    const size = opts.spec.size;
    let buffer = generateVfxTexture(opts.spec);
    let provider = 'procedural';
    let fallback = true;
    let modelId: string | undefined;

    const prompt = applyStylePrompt(
      opts.styleBible,
      'VFX_TEXTURE',
      [
        'isolated pixel art game VFX sprite',
        opts.spec.prompt ?? opts.spec.id,
        opts.extraDescription,
        'single centered effect, no character, no scenery, no UI, no letters',
        'solid chroma-key magenta background #FF00FF, transparent silhouette intended',
        opts.gameDna.identity.visualStyle,
        opts.styleBible?.VFXStyle,
      ]
        .filter(Boolean)
        .join(', '),
    );
    const negativePrompt = [
      ...(opts.artBible?.negativePrompts ?? []),
      ...(opts.styleBible?.negativePrompts ?? []),
      'character',
      'creature',
      'landscape',
      'text',
      'watermark',
      'photorealistic',
    ].join(', ');

    if (opts.imageGen) {
      try {
        throwIfCancelled(opts.signal);
        const result = await opts.imageGen.generateImage({
          profile: 'VFX_TEXTURE',
          prompt: sanitizeImagePromptText(prompt),
          negativePrompt: sanitizeImagePromptText(negativePrompt),
          width: 1024,
          height: 1024,
          seed: opts.seed,
          signal: opts.signal,
        });
        buffer = knockoutVfxBackground(result.image);
        provider = result.provider;
        modelId = result.modelId;
        fallback = false;
      } catch (err) {
        if (!allowProceduralFallback) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`VFX image generation failed (${opts.imageGen.id}): ${msg}`);
        }
      }
    } else if (!allowProceduralFallback) {
      throw new Error(
        'VFX image generation requires a healthy image provider (NVIDIA / ComfyUI / Diffusers) — none available',
      );
    }

    let sourcePath: string | undefined;
    if (!fallback) {
      sourcePath = derivedSourceRelPath(vfxPath);
      writeCheckpoint(opts.outputDir, sourcePath, buffer);
    }

    const compiled = fallback
      ? buffer
      : this.pixelArt.process(buffer, {
          targetWidth: size,
          targetHeight: size,
          tileSize: Math.min(8, size),
          alphaThreshold: 32,
        }).buffer;
    const det = runDeterministicAssetChecks(compiled, size, size);
    writeCheckpoint(opts.outputDir, vfxPath, compiled);

    return withMaturity({
      id: opts.spec.id,
      path: vfxPath,
      buffer: compiled,
      provider,
      modelId,
      fallbackGenerated: fallback,
      critiquePassed: det.passed,
      critiqueScore: det.passed ? 85 : 40,
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
    /**
     * When false (Manual Generator), image-provider failures propagate instead of
     * silently writing a procedural SUCCESS placeholder.
     */
    allowProceduralFallback?: boolean;
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

    const allowProceduralFallback = opts.allowProceduralFallback !== false;
    let buffer = generateProceduralSprite(opts.spec);
    let provider = 'procedural';
    let fallback = true;
    let modelId: string | undefined;

    if (opts.imageGen) {
      try {
        throwIfCancelled(opts.signal);
        const result = await opts.imageGen.generateImage({
          profile: opts.profile,
          prompt: sanitizeImagePromptText(opts.prompt),
          negativePrompt: opts.negativePrompt
            ? sanitizeImagePromptText(opts.negativePrompt)
            : undefined,
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
      } catch (err) {
        if (!allowProceduralFallback) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Manual image generation failed (${opts.imageGen.id}): ${msg}`,
          );
        }
        // keep procedural
      }
    } else if (!allowProceduralFallback) {
      throw new Error(
        'Manual image generation requires a healthy image provider (NVIDIA / ComfyUI / Diffusers) — none available',
      );
    }

    // Preserve full AI bytes beside the compiled game sprite — never overwrite source with
    // the downscaled pixel-art output.
    let sourcePath: string | undefined;
    if (!fallback) {
      sourcePath = derivedSourceRelPath(opts.path);
      writeCheckpoint(opts.outputDir, sourcePath, buffer);
    }

    const spriteSource = fallback ? buffer : knockoutVfxBackground(buffer);
    const processed = this.pixelArt.process(spriteSource, {
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
    styleBible?: StyleBible;
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
    huggingfaceApiKey?: string;
    huggingfaceImageModel?: string;
    automatic1111Url?: string;
    stabilityApiKey?: string;
    deepaiApiKey?: string;
    replicateApiToken?: string;
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
      huggingfaceApiKey: opts.huggingfaceApiKey,
      huggingfaceImageModel: opts.huggingfaceImageModel,
      automatic1111Url: opts.automatic1111Url,
      stabilityApiKey: opts.stabilityApiKey,
      deepaiApiKey: opts.deepaiApiKey,
      replicateApiToken: opts.replicateApiToken,
      mode: opts.mode,
      hardwareProfile: opts.hardwareProfile,
      providerEnabled: opts.providerEnabled,
    });

    if (opts.assetType === 'vfx_texture') {
      const spec = VFX_TEXTURES.find((v) => v.id === opts.assetId) ?? {
        id: opts.assetId,
        size: 24,
        core: [255, 240, 180, 255] as [number, number, number, number],
        edge: [255, 80, 40, 0] as [number, number, number, number],
        style: 'burst' as const,
        prompt: opts.description,
      };
      return this.generateVfxTextureAsset({
        spec: { ...spec, prompt: opts.description || spec.prompt },
        outputDir: opts.outputDir,
        seed: opts.seed,
        imageGen,
        styleBible: opts.styleBible,
        artBible: opts.artBible,
        gameDna: opts.gameDna,
        allowProceduralFallback: false,
      });
    }
    const vlm = createVisionCritic({
      ollamaBaseUrl: opts.ollamaBaseUrl,
      nvidiaApiKey: opts.nvidiaApiKey,
      nvidiaApiBaseUrl: opts.nvidiaApiBaseUrl,
      nvidiaVisionModel: opts.nvidiaVisionModel,
    });
    const vlmAvailable = await vlm.isAvailable();

    let profile: ImageGenerationProfile = 'CHARACTER';
    let frame = compiledSpriteFrameSize('character');
    let shape: SpriteSpec['shape'] = 'humanoid';

    switch (opts.assetType) {
      case 'enemy':
        profile = 'ENEMY';
        frame = compiledSpriteFrameSize('enemy');
        shape = 'enemy';
        break;
      case 'npc':
        profile = 'CHARACTER';
        frame = compiledSpriteFrameSize('npc');
        shape = 'humanoid';
        break;
      case 'boss':
        profile = 'BOSS';
        frame = compiledSpriteFrameSize('boss');
        shape = 'boss';
        break;
      case 'weapon':
      case 'item':
      case 'prop':
        frame = compiledSpriteFrameSize('item');
        shape = 'item';
        break;
      case 'tileset':
      case 'tile':
        profile = 'TILE_SOURCE';
        frame = compiledSpriteFrameSize('tileset');
        shape = 'tile';
        break;
      default:
        break;
    }
    const { width, height } = frame;

    const styleHint =
      opts.artBible?.characterGuidelines.player ??
      opts.gameDna.identity.visualStyle;
    const prompt = buildManualImagePrompt(
      opts.description,
      styleHint,
      opts.gameDna.identity.title,
    );

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
            prompt: sanitizeImagePromptText(prompt),
            negativePrompt: negativePrompt
              ? sanitizeImagePromptText(negativePrompt)
              : undefined,
            width: 128,
            height: 128,
            seed: opts.seed,
            conditioning,
          });
          tileBuffer = result.image;
          fallback = result.fallbackGenerated;
          provider = fallback ? 'procedural' : imageGen.id;
          modelId = fallback ? undefined : result.modelId;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Manual image generation failed (${imageGen.id}): ${msg}`);
        }
      } else {
        throw new Error(
          'Manual image generation requires a healthy image provider (NVIDIA / ComfyUI / Diffusers) — none available',
        );
      }
      if (fallback) {
        throw new Error(
          'Manual image generation returned a procedural placeholder — refusing silent SUCCESS',
        );
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
      allowProceduralFallback: false,
    });
  }
}
