import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type { GameDNA, ArtBible, StyleBible, CharacterVisualDNA, VisualDNA, BiomeVisualDNA, EnvironmentKit, FoundryAssetType, VisualReferenceLibrary, VisualReferenceAssetRole, VisualReferenceTemplate } from '@metroforge/schemas';
import {
  resolveVisualReferenceTemplate,
  roleForArchetype,
  templateFillAccent,
  templateTilesetStyle,
  templateBackgroundPalette,
  templatePropFillAccent,
  buildTemplatePrompt,
  checkTemplateTokenBudget,
  resolveConditioning,
  type ConditioningCapableRegistration,
} from './visual-templates/index.js';
import { partitionTilesetFeatures } from './png.js';
import { partitionBackgroundFeatures } from './parallax-strip.js';
import { partitionPropFeatures } from './prop-art.js';
import {
  generateProceduralSprite,
  generateTilesetSource,
  generateWalkCycleSheet,
  generateRunCycleSheet,
  generateHurtFlashSheet,
  generateAttackSheet,
  generateDeathSheet,
  generateVfxTexture,
  knockoutVfxBackground,
  decodePngRgba,
  generatePoseStill,
  pickEnemyArchetype,
  computeFrameQualityMetrics,
  generateProgressionSheet,
  type SpriteSpec,
  type VfxSpec,
  type FrameQualityMetrics,
  type AttackArcKind,
} from './png.js';
import { PLAYER_ANIMATION_SPEC, buildAnimationMetadataSidecar, type PlayerAnimationDefinition } from './player-animation-spec.js';
import { BOSS_ANIMATION_SPEC, buildBossAnimationSidecar } from './boss-animation-spec.js';
import { PixelArtProcessor } from './pixel-art-processor.js';
import {
  generateParallaxStrip,
  farPlateLooksLikeOutdoorLandscape,
  PARALLAX_LAYER_PROMPTS,
  PARALLAX_STRIP_SIZE,
} from './parallax-strip.js';
import { ImageProviderRegistry } from './image-router.js';
import { registerFoundryImageProviders } from './foundry/register.js';
import { LegacyAssetGenerationGateway } from './gateway/legacy-gateway.js';
import { createAssetGenerationGateway } from './gateway/index.js';
import type { AssetGenerationGateway, AssetGenerationBackend } from './gateway/types.js';
import type { VisionCritic } from './vision-critic-factory.js';
import { createVisionCritic } from './vision-critic-factory.js';
import { runDeterministicAssetChecks } from './vlm-critic.js';
import { critiqueAnimationSheet, critiqueTilesetSheet, type AnimationKind } from './animation-critic.js';
import { TileCompiler, TILE_ATLAS } from './tile-compiler.js';
import { assembleContactSheet, critiqueAnimationIdentity } from './sprite-qa.js';
import { nvidiaModelForImageTask } from './image-task.js';
import { buildPlayerAnimationManifest, poseNamesFromManifest } from './animation-manifest.js';
import {
  buildTileTerrainMetadata,
  buildGroundTerrainTresText,
  GROUND_TERRAIN_ID,
  GROUND_TERRAIN_MASK_ROLES,
  GROUND_TERRAIN_SET_ID,
  missingRequiredTileRoles,
} from './tile-roles.js';
import { createHash } from 'node:crypto';
import type { ImageGenerationProfile } from './types/vision.js';
import type { ImageGenerator, ImageConditioning } from './types/image-gen.js';
import type { GenerationMode, GenerationProfile } from '@metroforge/shared';
import {
  PROFILE_DEFAULTS,
  throwIfCancelled,
  inferAssetMaturity,
  critiqueEffectivelyPassed,
  isNonProductionMaturity,
  isTopDownArchetype,
} from '@metroforge/shared';
import type { AssetMaturity, AssetSourceType } from '@metroforge/shared';
import { applyVisualStyleContract, buildVisualStyleContract, compileVisualPrompt } from '@metroforge/procedural';
import { wrapIdentityProvider, capabilitiesFromRegistration, selectAnimationTier } from './identity/provider.js';
import { writeCharacterIdentityPack } from './identity/pack.js';
import { generateUiPanel, generateUiIcon, UI_FOUNDRY_ASSETS } from './ui-foundry.js';
import {
  generatePropSprite,
  WORLD_INTERACTABLE_ASSETS,
  interactablePalette,
  npcActorPalette,
  environmentDecorationPalette,
} from './prop-art.js';
import {
  AUTHORED_COURIER_PROVIDER,
  loadAuthoredCourierPng,
  loadAuthoredMasonryPng,
  loadAuthoredBiomePng,
  loadAuthoredCastPng,
  loadAuthoredFoundryTileset,
  shouldUseFoundryCourierKit,
  foundryBiomeStem,
} from './authored-kit.js';
import { sanitizeImagePromptText } from './sanitize-image-prompt.js';
import { runAssetPipelineV2 } from './pipeline-v2/orchestrator.js';

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
  /** Final-use deterministic generator intent; maturity still requires visual validation. */
  proceduralProduction?: boolean;
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
  negativePromptHash?: string;
  styleFingerprint?: string;
  requestedProvider?: string;
  requestedModel?: string;
  generationTimestamp?: string;
  parentArtifactIds?: string[];
  compiler?: string;
  godotResourcePath?: string;
  repairCount?: number;
  transformation?: string;
  sourceLicense?: string;
  derivedLicense?: string;
  /** Production-standard §20 frame-quality metrics — present for multi-frame sheets that compute
   *  them (currently the run cycle; see buildRunSheetAsset). Absent for single-frame assets. */
  frameQuality?: FrameQualityMetrics;
  /** Which AssetGenerationGateway backend was consulted for this asset's raw bytes — set whether
   *  or not that attempt actually succeeded (a procedural-fallback asset can still say 'foundry'
   *  here, meaning Foundry was tried and had no eligible/healthy provider). 'legacy' everywhere
   *  by default; 'foundry' only for a call site explicitly migrated to AssetFoundry. Absent only
   *  when no provider was even configured (skipImageGen, or no imageGen and no gateway at all). */
  generationBackend?: 'legacy' | 'foundry';
  /** Foundry's own QA verdict, captured for observability/provenance — does not replace
   *  critiquePassed/critiqueScore above, which always come from AssetPipeline's own deterministic
   *  checks + VLM critique regardless of backend. */
  foundryQaPassed?: boolean;
  foundryQaScore?: number;
  foundryLicense?: { commercialUse: boolean; status: string; reason: string };
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
      return { width: 160, height: 160 };
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
  visualDNA?: VisualDNA,
  category?: 'player' | 'npc' | 'enemy' | 'boss' | 'tileset' | 'background' | 'ui' | 'icon' | 'portrait' | 'vfx' | 'prop',
): string {
  if (visualDNA && category) {
    return compileVisualPrompt({
      visualDNA,
      category: category === 'tileset' ? 'tileset' : category === 'background' ? 'background' : category === 'icon' ? 'icon' : category,
      subject: prompt,
      role: capability,
      technicalSpec: {
        width: visualDNA.resolution.tileSize * 2,
        height: visualDNA.resolution.tileSize * 2,
        transparentBackground: category !== 'background' && category !== 'tileset',
        tileSize: visualDNA.resolution.tileSize,
      },
      variantSeed: visualDNA.seed,
    }).prompt;
  }
  if (!styleBible) return prompt;
  const prefix = styleBible.promptPrefixes?.[capability];
  const extras = [prefix, styleBible.lighting].filter(Boolean).join(', ');
  return applyVisualStyleContract(prompt, styleBible, extras || undefined);
}

function applyStyleNegativePrompt(styleBible: StyleBible | undefined, extra?: string): string | undefined {
  const fragments = [
    extra,
    styleBible ? buildVisualStyleContract(styleBible).negativeFragment : undefined,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return fragments.length ? fragments.join(', ') : undefined;
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
  visualDNA?: VisualDNA;
  biomeVisualDNAs?: BiomeVisualDNA[];
  environmentKits?: EnvironmentKit[];
  /** Fourteenth-session visual reference/template library (docs/asset-pipeline/reference-library/,
   *  loaded via loadVisualReferenceLibrary()). Optional and additive — omitting it reproduces
   *  every existing generation path unchanged. When present, categories with a matching template
   *  (currently: enemy archetypes mapped through pickEnemyArchetype -> roleForArchetype) use the
   *  template's prompt/palette instead of the generic BIOME_PALETTES rotation, enforce the
   *  template's tokenizer budget, and record which template/version/seed produced each asset in
   *  <outputDir>/reports/visual-template-provenance.json. */
  visualReferenceLibrary?: VisualReferenceLibrary;
  /** Which provider registration to check for reference-image conditioning support when a
   *  visualReferenceLibrary template is resolved. Optional — when omitted, conditioning is never
   *  attempted and the resolution is recorded as disclosed-unsupported (no provider selected). */
  visualReferenceProvider?: ConditioningCapableRegistration;
  /** Repository root containing docs/asset-pipeline/reference-library/ — needed to read a
   *  template's reference image bytes for conditioning. Defaults to process.cwd(). Only consulted
   *  when visualReferenceLibrary is set. */
  visualReferenceLibraryRoot?: string;
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
  pollinationsBaseUrl?: string;
  pollinationsModel?: string;
  pollinationsApiKey?: string;
  /** Registers the free, keyless Pollinations provider as a routing candidate. Off by default —
   *  see registerFoundryImageProviders' enablePollinations doc for why this isn't unconditional. */
  enablePollinations?: boolean;
  /** AssetFoundry production-integration migration seam. Default 'legacy' — behaviorally
   *  identical to every prior release. Only the player key-art generateSprite() call currently
   *  honors this (see the first-migrated-category note in generate()); every other category
   *  stays on the legacy single-provider-per-run resolver regardless of this setting until it is
   *  explicitly migrated too. */
  assetGenerationBackend?: AssetGenerationBackend;
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
  /** procedural-only (default when absent): baseline only, never calls NVIDIA NIM.
   *  nvidia-enhanced: always attempts the post-baseline NIM enhancement pass for the P0 asset
   *  slice (player/enemies/boss/backgrounds/checkpoint/pickup/gate), falling back per-asset on
   *  any failure — never blocks generation.
   *  auto: attempts the pass only when NIM health-checks as reachable first. */
  visualMode?: 'procedural-only' | 'nvidia-enhanced' | 'auto';
  /** Injectable for tests / alternate deployments; defaults to a real NvidiaImageEditProvider /
   *  NvidiaImageProvider pair when visualMode !== 'procedural-only' and neither is supplied. */
  visualEnhancementEditor?: import('./types/image-edit.js').ImageEditor;
  visualEnhancementGenerator?: ImageGenerator;
  /** Routing constraint for image-provider selection — LOCAL_ONLY excludes any registered
   *  provider that isn't local. Remote providers are never rejected for low local VRAM. */
  mode?: GenerationMode;
  /** When LOW_RESOURCE, ImageProviderRegistry prefers remote/hosted image providers. */
  hardwareProfile?: string;
  /** Measured hardware snapshot used for VRAM-aware local GPU routing. Remote providers ignore this. */
  hardware?: {
    profile?: string;
    ramMb?: number;
    vramMb?: number;
    freeVramMb?: number;
  };
  qualityProfile?: import('@metroforge/schemas').AssetQualityProfile;
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
  /** Present whenever visualMode !== 'procedural-only' was requested — always honest about what
   *  was attempted vs actually enhanced vs fell back, never faked. */
  visualEnhancement?: import('./visual-enhancement/types.js').VisualEnhancementSummary;
}

const NPC_ROLES = ['quest_giver', 'merchant', 'lore', 'neutral'] as const;

const BIOME_PALETTES: [number, number, number][][] = [
  [[40, 45, 55], [70, 75, 90], [100, 130, 200], [180, 100, 80]],
  [[30, 50, 35], [55, 90, 60], [90, 160, 100], [200, 180, 60]],
  [[50, 30, 60], [90, 50, 110], [160, 80, 180], [240, 200, 255]],
  [[55, 40, 30], [100, 70, 45], [180, 120, 60], [220, 200, 160]],
  [[25, 35, 50], [45, 65, 90], [80, 140, 180], [200, 220, 240]],
];

export interface VisualTemplateProvenanceEntry {
  assetId: string;
  assetRole: VisualReferenceAssetRole;
  templateId: string;
  styleVersion: string;
  biome: string;
  seed: number;
  prompt: string;
  negativePrompt: string;
  tokenBudget: { tokenCount: number; maxTokens: number; overflow: boolean; estimated: boolean };
  conditioningDisclosure?: string;
  conditioningAttached: boolean;
  /** Actual conditioning mode used ('ip_adapter' | 'controlnet_canny' | 'img2img'), or 'none' when
   *  not attached — fifteenth-session addition, always present (never inferred after the fact). */
  conditioningMode: string;
  /** The real image provider id that produced the final asset bytes (e.g. 'procedural',
   *  'diffusers', 'nvidia-image') — filled in by finalizeVisualTemplateProvenance() once
   *  generation actually completes; 'pending' would indicate a caller forgot to finalize it, so
   *  every real call site below finalizes before this leaves the function. */
  provider: string;
  modelId?: string;
  /** template.environmentFeatures the live renderer actually applied — empty for roles (player,
   *  enemy, boss) that don't use environment features. */
  appliedFeatures: string[];
  /** template.environmentFeatures the live renderer does not support — disclosed explicitly
   *  rather than silently dropped (fifteenth-session requirement). */
  unsupportedFeatures: string[];
}

/** Extracts the trailing integer from a `biome_<N>`-style id (the real, confirmed convention from
 *  packages/procedural/src/{bibles,content,world}.ts) for index-rotation into the reference
 *  library's biome list. Falls back to 0 for an unrecognized id rather than throwing — a biome id
 *  the generator changes format for is a soft "always index 0", not a hard failure. */
function biomeIndexFromId(biomeId: string): number {
  const match = /(\d+)\s*$/.exec(biomeId);
  return match ? Number(match[1]) : 0;
}

function libraryBiomeForIndex(library: VisualReferenceLibrary, index: number): string {
  return library.biomes[index % library.biomes.length]!.biome;
}

/** Shared core behind every resolveXVisualTemplate() helper below: resolves the (role, biome)
 * template, builds its prompt (through the same buildTemplatePrompt/StyleBible composition used
 * elsewhere), checks its tokenizer budget, and resolves conditioning — everything that's the same
 * regardless of which asset category is asking. Each category-specific wrapper adds only its own
 * palette/feature adapter (templateFillAccent / templateTilesetStyle / templateBackgroundPalette /
 * templatePropFillAccent) on top. Returns undefined when no library is configured or no template
 * covers this (role, biome), so callers fall back to existing (unchanged) behavior.
 *
 * Biome selection is by index rotation through the library's biome list (library.biomes[i %
 * length]), mirroring BIOME_PALETTES' own existing index-rotation convention — it does not attempt
 * to semantically match a real generated biome's theme/name to one of the library's three named
 * biomes. A real semantic mapping (e.g. via BiomeVisualDNA.theme keywords) is a disclosed
 * follow-up, not implemented in this pass.
 */
async function resolveTemplateCore(
  library: VisualReferenceLibrary,
  assetRole: VisualReferenceAssetRole,
  biome: string,
  assetId: string,
  seed: number,
  styleBible: StyleBible | undefined,
  provider: ConditioningCapableRegistration | undefined,
  repoRoot: string,
): Promise<{ template: VisualReferenceTemplate; prompt: string; provenance: VisualTemplateProvenanceEntry } | undefined> {
  const template = resolveVisualReferenceTemplate(library, { assetRole, biome });
  if (!template) return undefined;

  const { prompt, negativePrompt } = buildTemplatePrompt(template, { styleBible });
  const tokenBudget = await checkTemplateTokenBudget(prompt, negativePrompt);
  const conditioning = resolveConditioning(repoRoot, template, provider);

  return {
    template,
    prompt,
    provenance: {
      assetId,
      assetRole,
      templateId: template.id,
      styleVersion: template.styleVersion,
      biome,
      seed,
      prompt,
      negativePrompt,
      tokenBudget: {
        tokenCount: tokenBudget.tokenCount,
        maxTokens: tokenBudget.maxTokens,
        overflow: tokenBudget.overflow,
        estimated: tokenBudget.estimated,
      },
      conditioningDisclosure: conditioning.disclosure,
      conditioningAttached: Boolean(conditioning.conditioning),
      conditioningMode: conditioning.conditioning?.mode ?? 'none',
      provider: 'pending',
      appliedFeatures: [],
      unsupportedFeatures: [],
    },
  };
}

/** Fills in the real provider/model once a template-driven generation call actually completes —
 * mutates the provenance record in place (it was already pushed into the run's provenance list by
 * reference), so every real call site must call this before the asset is considered done. */
function finalizeVisualTemplateProvenance(
  provenance: VisualTemplateProvenanceEntry,
  provider: string,
  modelId: string | undefined,
): void {
  provenance.provider = provider;
  provenance.modelId = modelId;
}

async function resolveEnemyVisualTemplate(
  library: VisualReferenceLibrary | undefined,
  archetype: import('./png.js').EnemyArchetype,
  biomeIndex: number,
  assetId: string,
  seed: number,
  styleBible: StyleBible | undefined,
  provider: ConditioningCapableRegistration | undefined,
  repoRoot: string,
): Promise<{ fill: [number, number, number, number]; accent: [number, number, number, number]; prompt: string; provenance: VisualTemplateProvenanceEntry } | undefined> {
  if (!library || library.biomes.length === 0) return undefined;
  const role = roleForArchetype(archetype);
  if (!role) return undefined;
  const biome = libraryBiomeForIndex(library, biomeIndex);
  const core = await resolveTemplateCore(library, role, biome, assetId, seed, styleBible, provider, repoRoot);
  if (!core) return undefined;
  const { fill, accent } = templateFillAccent(core.template);
  return { fill, accent, prompt: core.prompt, provenance: core.provenance };
}

async function resolveTerrainVisualTemplate(
  library: VisualReferenceLibrary | undefined,
  biomeIndex: number,
  assetId: string,
  seed: number,
  styleBible: StyleBible | undefined,
  provider: ConditioningCapableRegistration | undefined,
  repoRoot: string,
): Promise<{ style: ReturnType<typeof templateTilesetStyle>; prompt: string; provenance: VisualTemplateProvenanceEntry } | undefined> {
  if (!library || library.biomes.length === 0) return undefined;
  const biome = libraryBiomeForIndex(library, biomeIndex);
  const core = await resolveTemplateCore(library, 'terrain', biome, assetId, seed, styleBible, provider, repoRoot);
  if (!core) return undefined;
  const rawStyle = templateTilesetStyle(core.template);
  const { supported, unsupported } = partitionTilesetFeatures(rawStyle.features);
  core.provenance.appliedFeatures = supported;
  core.provenance.unsupportedFeatures = unsupported;
  return { style: { ...rawStyle, features: supported }, prompt: core.prompt, provenance: core.provenance };
}

async function resolveBackgroundVisualTemplate(
  library: VisualReferenceLibrary | undefined,
  biomeIndex: number,
  assetId: string,
  seed: number,
  styleBible: StyleBible | undefined,
  provider: ConditioningCapableRegistration | undefined,
  repoRoot: string,
): Promise<{ palette: [number, number, number][]; features: string[]; prompt: string; provenance: VisualTemplateProvenanceEntry } | undefined> {
  if (!library || library.biomes.length === 0) return undefined;
  const biome = libraryBiomeForIndex(library, biomeIndex);
  const core = await resolveTemplateCore(library, 'background', biome, assetId, seed, styleBible, provider, repoRoot);
  if (!core) return undefined;
  const palette = templateBackgroundPalette(core.template);
  const { supported, unsupported } = partitionBackgroundFeatures(core.template.environmentFeatures);
  core.provenance.appliedFeatures = supported;
  core.provenance.unsupportedFeatures = unsupported;
  return { palette, features: supported, prompt: core.prompt, provenance: core.provenance };
}

async function resolvePropVisualTemplate(
  library: VisualReferenceLibrary | undefined,
  biomeIndex: number,
  assetId: string,
  seed: number,
  styleBible: StyleBible | undefined,
  provider: ConditioningCapableRegistration | undefined,
  repoRoot: string,
): Promise<{ fill: string; accent: string; features: string[]; prompt: string; provenance: VisualTemplateProvenanceEntry } | undefined> {
  if (!library || library.biomes.length === 0) return undefined;
  const biome = libraryBiomeForIndex(library, biomeIndex);
  const core = await resolveTemplateCore(library, 'prop', biome, assetId, seed, styleBible, provider, repoRoot);
  if (!core) return undefined;
  const { fill, accent } = templatePropFillAccent(core.template);
  const { supported, unsupported } = partitionPropFeatures(core.template.environmentFeatures);
  core.provenance.appliedFeatures = supported;
  core.provenance.unsupportedFeatures = unsupported;
  return { fill, accent, features: supported, prompt: core.prompt, provenance: core.provenance };
}

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
  {
    id: 'landing_dust',
    size: 18,
    core: [210, 190, 150, 230],
    edge: [90, 70, 50, 0],
    style: 'burst',
    effectType: 'landing_dust',
    whereUsed: ['PlayerController.land'],
    prompt: 'small dusty landing puff at the feet, beige grit burst, no character, no shockwave scenery',
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
  pollinationsBaseUrl?: string;
  pollinationsModel?: string;
  pollinationsApiKey?: string;
  enablePollinations?: boolean;
  mode?: GenerationMode;
  hardwareProfile?: string;
  hardware?: AssetPipelineOptions['hardware'];
  qualityProfile?: AssetPipelineOptions['qualityProfile'];
  providerEnabled?: Record<string, boolean>;
}): Promise<{
  generator: ImageGenerator | null;
  warnings: string[];
  fallbackDepth: number;
  fallbackReason?: string;
  selectedProvider?: string;
  registry: ImageProviderRegistry;
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
    pollinationsBaseUrl: options.pollinationsBaseUrl,
    pollinationsModel: options.pollinationsModel,
    pollinationsApiKey: options.pollinationsApiKey,
    enablePollinations: options.enablePollinations,
    providerEnabled: options.providerEnabled,
    commercialUseRequired: options.mode === 'COMMERCIAL_SAFE',
    includeRetrieval: false,
  });

  const selected = await registry.selectHealthy({
    mode: options.mode,
    hardwareProfile: options.hardwareProfile,
    hardware: options.hardware,
    qualityProfile: options.qualityProfile,
  });
  if (selected.generator) {
    return {
      generator: selected.generator,
      warnings: selected.warnings,
      fallbackDepth: selected.fallbackDepth,
      fallbackReason: selected.fallbackReason,
      selectedProvider: selected.selectedProvider,
      registry,
    };
  }
  return {
    generator: null,
    warnings: [...selected.warnings, 'using procedural assets'],
    fallbackDepth: selected.fallbackDepth,
    fallbackReason: selected.fallbackReason,
    selectedProvider: undefined,
    registry,
  };
}

const PROFILE_TO_FOUNDRY_ASSET_TYPE: Partial<Record<ImageGenerationProfile, FoundryAssetType>> = {
  CHARACTER: 'player',
  ENEMY: 'enemy',
  BOSS: 'boss',
  NPC: 'npc',
  PORTRAIT: 'portrait',
  ITEM: 'item',
  WEAPON: 'weapon',
  ICON: 'icon',
  BACKGROUND: 'background',
  TILE_SOURCE: 'tileset',
  VFX_TEXTURE: 'vfx',
  UI_ART: 'ui',
};

/** Best-effort FoundryAssetType for a generateSprite() call that didn't specify one explicitly —
 *  used only when a gateway is actually in play (opts.gateway set), so an unmapped profile never
 *  affects the (far more common) legacy-only call sites. */
function foundryAssetTypeForProfile(profile: ImageGenerationProfile): FoundryAssetType {
  return PROFILE_TO_FOUNDRY_ASSET_TYPE[profile] ?? 'texture';
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
    proceduralProduction: asset.proceduralProduction,
  });
  const proceduralProduction = inferred.maturity === 'PROCEDURAL_PRODUCTION';
  return {
    ...asset,
    critiquePassed: asset.critiquePassed ?? false,
    critiqueScore: asset.critiqueScore ?? 0,
    maturity: proceduralProduction ? inferred.maturity : (asset.maturity ?? inferred.maturity),
    productionReady: proceduralProduction ? true : (asset.productionReady ?? inferred.productionReady),
    sourceType: asset.sourceType ?? inferred.sourceType,
    productionAllowed: asset.productionAllowed ?? (inferred.productionReady || !asset.fallbackGenerated),
  };
}

export function proceduralProductionIntent(
  asset: Pick<GeneratedAsset, 'path' | 'provider' | 'critiquePassed'>,
  assetType: string,
): boolean {
  const normalizedPath = asset.path.replace(/\\/g, '/').toLowerCase();
  if (
    asset.provider !== 'procedural' ||
    asset.critiquePassed !== true ||
    normalizedPath.includes('/qa/') ||
    normalizedPath.includes('/debug/') ||
    normalizedPath.includes('/sfx/') ||
    normalizedPath.includes('/audio/')
  ) {
    return false;
  }

  const shippingAssetTypes = new Set([
    'tile',
    'tileset',
    'prop',
    'player',
    'enemy',
    'boss',
    'background',
    'ui',
    'portrait',
    'vfx',
    'npc',
    'animation',
    'character',
    'interactive',
  ]);

  return shippingAssetTypes.has(assetType);
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

/**
 * Path-based assetType inference — used both to resume a checkpointed generation and to
 * re-evaluate an already-generated project's manifest (see reclassify-asset-maturity.ts).
 * Must stay in sync with the assetType vocabulary `proceduralProductionIntent()`'s
 * `shippingAssetTypes` actually checks — a path this misses silently falls to 'texture',
 * which is never whitelisted there, so a resumed/reclassified asset can never reach
 * PROCEDURAL_PRODUCTION regardless of quality.
 */
export function inferAssetTypeFromPath(path: string): string {
  if (path.includes('/vfx/')) return 'vfx';
  if (path.includes('/tilesets/')) return path.includes('/tiles/') ? 'tile' : 'tileset';
  if (path.includes('/bosses/')) return 'boss';
  if (path.includes('/enemies/')) return 'enemy';
  if (path.includes('/npcs/')) {
    return path.includes('_walk') ? 'animation' : 'npc';
  }
  if (path.includes('/characters/')) return path.includes('_walk') || path.includes('_hurt') || path.includes('_attack') ? 'animation' : 'player';
  if (path.includes('/ui/portraits/')) return 'portrait';
  if (path.includes('/ui/')) return 'ui';
  if (path.includes('/props/') || path.includes('/architecture/')) return 'prop';
  if (path.includes('/backgrounds/')) return 'background';
  if (path.includes('/generated/')) return 'interactive';
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

  /** Character/enemy/NPC/boss compile: punch studio, crop the actor, fill the game frame. */
  private compileActorFrame(
    sourcePng: Buffer,
    targetWidth: number,
    targetHeight: number,
    tileSize?: number,
  ) {
    return this.pixelArt.process(sourcePng, {
      targetWidth,
      targetHeight,
      tileSize,
      skipQuantize: true,
      fitOpaque: true,
    });
  }

  async generate(options: AssetPipelineOptions): Promise<AssetPipelineResult> {
    const assets: GeneratedAsset[] = [];
    const warnings: string[] = [];
    let fakeAnimationDetected = false;
    const checkCancelled = () => throwIfCancelled(options.signal);
    /** Fourteenth-session visual-reference-template selections — flushed to
     *  <outputDir>/reports/visual-template-provenance.json at the end of generate() when
     *  non-empty, recording template id/version/seed/prompt/tokenBudget/conditioning-disclosure
     *  per asset, per this milestone's "record the selected template version and seed with
     *  outputs" and "disclose" requirements. */
    const visualTemplateProvenance: VisualTemplateProvenanceEntry[] = [];
    const recordAsset = (asset: Omit<GeneratedAsset, 'maturity' | 'productionReady' | 'sourceType'> &
      Partial<Pick<GeneratedAsset, 'maturity' | 'productionReady' | 'sourceType'>>, assetType: string) => {
      const finalized = withMaturity({
        ...asset,
        proceduralProduction: asset.proceduralProduction ?? proceduralProductionIntent(asset as GeneratedAsset, assetType),
      });
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
        const degraded = cachedAssets.some((a) => isNonProductionMaturity(a.maturity));
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
    const negativePrompt = applyStyleNegativePrompt(
      options.styleBible,
      options.artBible?.negativePrompts.join(', '),
    );

    const imageRoute = options.skipImageGen
      ? {
          generator: null as ImageGenerator | null,
          warnings: [] as string[],
          fallbackDepth: 0,
          fallbackReason: 'Image generation skipped',
          selectedProvider: undefined as string | undefined,
          registry: new ImageProviderRegistry(),
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
          pollinationsBaseUrl: options.pollinationsBaseUrl,
          pollinationsModel: options.pollinationsModel,
          pollinationsApiKey: options.pollinationsApiKey,
          enablePollinations: options.enablePollinations,
          mode: options.mode,
          hardwareProfile: options.hardwareProfile,
          hardware: options.hardware,
          qualityProfile: options.qualityProfile,
          providerEnabled: options.providerEnabled,
        });
    const imageGen = imageRoute.generator;
    const providerWarnings = imageRoute.warnings;
    warnings.push(...providerWarnings);

    // AssetFoundry production integration seam (first migrated category: player key art — see
    // Phase 5 of the migration). Default 'legacy' reconstructs a gateway that behaves exactly
    // like the pre-migration inline call; every other generateSprite() call site in this method
    // omits `gateway` entirely and is unaffected by this setting regardless of its value.
    const playerGateway = createAssetGenerationGateway(options.assetGenerationBackend ?? 'legacy', {
      registry: imageRoute.registry,
      legacyImageGen: imageGen,
    });

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
      options.visualDNA,
      'player',
    );

    options.onTaskStarted?.('player_sprite', 'Generating player character sprite');
    checkCancelled();
    const playerFrame = compiledSpriteFrameSize('character');
    const playerSpec: SpriteSpec = {
      id: 'player',
      width: playerFrame.width,
      height: playerFrame.height,
      fill: [62, 48, 38, 255],
      accent: [204, 108, 52, 255],
      shape: 'humanoid',
    };
    // Foundry visual slice (and foundry-themed gens) ship a hand-authored courier still — prefer
    // it over procedural/AI generation for the base portrait. Animation sheets stay on the V2
    // pipeline path below (the authored kit ships 4-frame strips; re-authoring it to the V2
    // frame counts is tracked as follow-up in docs/debug/TOPDOWN_GENRE_MILESTONE.md).
    const useCourierKit = shouldUseFoundryCourierKit({
      profile: options.profile,
      gameDna: options.gameDna,
      characterVisualDna: options.characterVisualDna,
    });
    const authoredPlayer = useCourierKit
      ? this.materializeAuthoredCourier({
          id: 'player',
          path: 'assets/characters/player.png',
          filename: 'player.png',
          width: playerFrame.width,
          height: playerFrame.height,
          outputDir: options.outputDir,
        })
      : null;
    const playerAsset =
      authoredPlayer ??
      (await this.generateSprite({
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
        foundryAssetType: 'player',
        gateway: playerGateway,
        mode: options.mode,
      }));
    recordAsset(playerAsset, 'player');
    if (options.visualDNA) {
      writeCharacterIdentityPack({
        outputDir: options.outputDir,
        characterId: 'player',
        role: 'player',
        source: playerAsset.buffer,
        visualDNA: options.visualDNA,
        characterDna: options.characterVisualDna,
        animationTier: selectAnimationTier({
          hasSource: !playerAsset.fallbackGenerated,
          identityProviderAvailable: Boolean(imageGen && imageGen.id !== 'nvidia-image'),
        }),
      });
    }

    // Reuse the real generated still as the animation source (matches the NPC/boss path below) —
    // previously these three always ran off generateProceduralSprite(spec)'s flat placeholder
    // shape even when playerAsset.buffer held real AI art, so a player with a real portrait could
    // still have visually disconnected placeholder walk/attack/hurt frames.
    const playerSource = playerAsset.fallbackGenerated ? undefined : playerAsset.buffer;
    // Authored courier 4-frame strips win over the V2 generated sheets for the Foundry slice.
    // AnimatedAssetSprite.gd derives frame count from real sheet width, so a 4-frame authored
    // strip animates correctly even though PLAYER_ANIMATION_SPEC declares more.
    const authoredSheet = (
      filename: string,
      path: string,
      kind: AnimationKind,
    ): GeneratedAsset | null => {
      if (!useCourierKit) return null;
      const raw = loadAuthoredCourierPng(filename);
      if (!raw) return null;
      const decoded = decodePngRgba(raw);
      const frames = Math.max(1, Math.round(decoded.width / playerFrame.width));
      return this.materializeAuthoredCourier({
        id: path.split('/').pop()!.replace('.png', ''),
        path,
        filename,
        width: decoded.width,
        height: decoded.height,
        outputDir: options.outputDir,
        animationKind: kind,
        frameCount: frames,
        expectedFrameWidth: playerFrame.width,
      });
    };
    const walkDef = PLAYER_ANIMATION_SPEC.walk!;
    recordAsset(
      authoredSheet('player_walk.png', 'assets/characters/player_walk.png', 'walk') ??
        this.buildWalkSheetAsset(
          'player',
          playerSpec,
          'assets/characters/player_walk.png',
          walkDef.frameCount,
          tileSize,
          playerSource,
        ),
      'animation',
    );
    const attackDef = PLAYER_ANIMATION_SPEC.attack!;
    recordAsset(
      authoredSheet('player_attack.png', 'assets/characters/player_attack.png', 'attack') ??
        this.buildAttackSheetAsset(
          'player',
          playerSpec,
          'assets/characters/player_attack.png',
          attackDef.frameCount,
          tileSize,
          playerSource,
          attackDef.arcKind,
          'attack',
        ),
      'animation',
    );
    // Combo continuation hits (production pass §17) — distinct arcs (upward/downward), not a
    // rotate/recolor of attack_1. Genuinely wired into PlayerController.gd's combo system below,
    // not generated-but-dead: eliminates the exact "ASSET_EXISTS_NOT_USED" defect this pass
    // found and fixed for `walk`/`swim`/`wall_jump`, applied proactively here instead of reactively.
    const attack2Def = PLAYER_ANIMATION_SPEC.attack_2!;
    recordAsset(
      authoredSheet('player_attack_2.png', 'assets/characters/player_attack_2.png', 'attack_2') ??
        this.buildAttackSheetAsset(
          'player',
          playerSpec,
          'assets/characters/player_attack_2.png',
          attack2Def.frameCount,
          tileSize,
          playerSource,
          attack2Def.arcKind,
          'attack_2',
        ),
      'animation',
    );
    const attack3Def = PLAYER_ANIMATION_SPEC.attack_3!;
    recordAsset(
      authoredSheet('player_attack_3.png', 'assets/characters/player_attack_3.png', 'attack_3') ??
        this.buildAttackSheetAsset(
          'player',
          playerSpec,
          'assets/characters/player_attack_3.png',
          attack3Def.frameCount,
          tileSize,
          playerSource,
          attack3Def.arcKind,
          'attack_3',
        ),
      'animation',
    );
    const hurtDef = PLAYER_ANIMATION_SPEC.hurt!;
    recordAsset(
      authoredSheet('player_hurt.png', 'assets/characters/player_hurt.png', 'hurt') ??
        this.buildHurtSheetAsset(
          'player',
          playerSpec,
          'assets/characters/player_hurt.png',
          hurtDef.frameCount,
          tileSize,
          playerSource,
        ),
      'animation',
    );
    const deathDef = PLAYER_ANIMATION_SPEC.death!;
    recordAsset(
      authoredSheet('player_death.png', 'assets/characters/player_death.png', 'death') ??
        this.buildDeathSheetAsset(
          'player',
          playerSpec,
          'assets/characters/player_death.png',
          deathDef.frameCount,
          tileSize,
          playerSource,
        ),
      'animation',
    );
    // Genuine multi-frame run cycle (production standard §22/§25) — a real 12-frame animated
    // sheet, not the single static pose still every other locomotion state still uses. Excluded
    // from the pose-still list below for the same reason attack/hurt/death are: a real sheet
    // already exists for this animation name, and AnimatedAssetSprite.gd's pose-override loader
    // would otherwise clobber it with one static frame.
    const runDef = PLAYER_ANIMATION_SPEC.run!;
    recordAsset(
      authoredSheet('player_run.png', 'assets/characters/player_run.png', 'run') ??
        this.buildRunSheetAsset(
          'player',
          playerSpec,
          'assets/characters/player_run.png',
          runDef.frameCount,
          tileSize,
          playerSource,
        ),
      'animation',
    );

    // Every remaining locomotion/transition state (idle, jump_start, jump, fall, land, dash,
    // wall_slide, wall_jump, swim) — real multi-frame sheets via the shared progression-sheet
    // generator family, not the single static pose still these previously fell back to. Player
    // animation production pass: turns "one proven multi-frame animation plus 12 static poses"
    // into every state having a genuine clip.
    const progressionStates: Array<[keyof typeof PLAYER_ANIMATION_SPEC, string]> = [
      ['idle', 'assets/characters/player_idle.png'],
      ['jump_start', 'assets/characters/player_jump_start.png'],
      ['jump', 'assets/characters/player_jump.png'],
      ['fall', 'assets/characters/player_fall.png'],
      ['land', 'assets/characters/player_land.png'],
      ['dash', 'assets/characters/player_dash.png'],
      ['wall_slide', 'assets/characters/player_wall_slide.png'],
      ['wall_jump', 'assets/characters/player_wall_jump.png'],
      ['swim', 'assets/characters/player_swim.png'],
    ];
    const progressionDefs: PlayerAnimationDefinition[] = [walkDef, runDef, attackDef, attack2Def, attack3Def, hurtDef, deathDef];
    for (const [key, path] of progressionStates) {
      const def = PLAYER_ANIMATION_SPEC[key]!;
      progressionDefs.push(def);
      recordAsset(
        authoredSheet(`player_${key}.png`, path, key as AnimationKind) ??
          this.buildProgressionSheetAsset('player', def, playerSpec, path, tileSize, playerSource),
        'animation',
      );
    }
    {
      const animSidecarDir = join(options.outputDir, 'assets', 'characters');
      mkdirSync(animSidecarDir, { recursive: true });
      const sidecar = buildAnimationMetadataSidecar(progressionDefs);
      if (useCourierKit) {
        for (const def of progressionDefs) {
          const raw = loadAuthoredCourierPng(`player_${def.name}.png`);
          if (!raw) continue;
          const decoded = decodePngRgba(raw);
          const frames = Math.max(1, Math.round(decoded.width / playerFrame.width));
          const specDuration = def.frameCount / Math.max(1, def.fps);
          const fps = Math.max(6, Math.round(frames / specDuration));
          sidecar[def.name] = { frameCount: frames, fps, loop: def.loop };
        }
      }
      writeFileSync(
        join(animSidecarDir, 'player_animations.json'),
        JSON.stringify(sidecar, null, 2),
      );
    }

    // Canonical per-animation-state pose stills (Section 6/7): legacy AI-upgrade path, now purely
    // additive — every state above already has a real procedural multi-frame sheet, so the
    // generalized "production sheet wins over pose" rule in AnimatedAssetSprite.gd means any pose
    // still produced here (e.g. from a future AI provider) is only ever used if that provider's
    // pose is later promoted to a full sheet; it never regresses a state that already has one.
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
        useAuthoredCourier: useCourierKit,
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
        allowAiUpgrade: Boolean(imageGen && imageGen.id !== 'nvidia-image' && playerSource),
        // Every name in PLAYER_ANIMATION_SPEC already has a real procedural multi-frame sheet
        // generated above — filtering by the spec's own keys (not a hand-maintained list) means a
        // newly-added spec entry never has to be re-added here separately.
        poses: poseNamesFromManifest(animManifest)
          .filter((name) => !(name in PLAYER_ANIMATION_SPEC))
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
      const enemyId = `enemy_${i.toString().padStart(3, '0')}`;
      const archetype = pickEnemyArchetype(enemyId);
      const visualTemplate = await resolveEnemyVisualTemplate(
        options.visualReferenceLibrary,
        archetype,
        i % defaults.biomes,
        enemyId,
        options.seed + i,
        options.styleBible,
        options.visualReferenceProvider,
        options.visualReferenceLibraryRoot ?? process.cwd(),
      );
      if (visualTemplate) visualTemplateProvenance.push(visualTemplate.provenance);
      const palette = BIOME_PALETTES[i % BIOME_PALETTES.length]!;
      const enemyFrame = compiledSpriteFrameSize('enemy');
      const enemySpec: SpriteSpec = {
        id: enemyId,
        width: enemyFrame.width,
        height: enemyFrame.height,
        fill: visualTemplate?.fill ?? [palette[2]![0], palette[2]![1], palette[2]![2], 255],
        accent: visualTemplate?.accent,
        enemyArchetype: archetype,
        shape: 'enemy',
      };

      options.onTaskProgress?.(
        'enemy_sprite',
        i + 1,
        defaults.enemies,
        `Generating enemy ${i + 1} / ${defaults.enemies}`,
      );

      const authoredEnemy = useCourierKit
        ? this.materializeAuthoredCourier({
            id: enemyId,
            path: `assets/enemies/${enemyId}.png`,
            filename: `${enemyId}.png`,
            width: enemyFrame.width,
            height: enemyFrame.height,
            outputDir: options.outputDir,
          })
        : null;
      const enemyAsset = authoredEnemy ?? (await this.generateSprite({
        id: enemyId,
        path: `assets/enemies/${enemyId}.png`,
        spec: enemySpec,
        profile: 'ENEMY',
        prompt:
          visualTemplate?.prompt ??
          applyStylePrompt(
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
      }));
      if (visualTemplate) finalizeVisualTemplateProvenance(visualTemplate.provenance, enemyAsset.provider, enemyAsset.modelId);
      recordAsset(enemyAsset, 'enemy');

      const enemySource = enemyAsset.fallbackGenerated ? undefined : enemyAsset.buffer;
      const authoredEnemySheet = (filename: string, path: string, kind: AnimationKind): GeneratedAsset | null =>
        useCourierKit
          ? this.materializeAuthoredCourier({
              id: path.split('/').pop()!.replace('.png', ''),
              path,
              filename,
              width: enemyFrame.width * 4,
              height: enemyFrame.height,
              outputDir: options.outputDir,
              animationKind: kind,
              frameCount: 4,
              expectedFrameWidth: enemyFrame.width,
            })
          : null;
      recordAsset(
        authoredEnemySheet(`${enemyId}_walk.png`, `assets/enemies/${enemyId}_walk.png`, 'walk') ??
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
        authoredEnemySheet(`${enemyId}_hurt.png`, `assets/enemies/${enemyId}_hurt.png`, 'hurt') ??
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
        authoredEnemySheet(`${enemyId}_death.png`, `assets/enemies/${enemyId}_death.png`, 'death') ??
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
        authoredEnemySheet(`${enemyId}_attack.png`, `assets/enemies/${enemyId}_attack.png`, 'attack') ??
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
      for (const extra of [`${enemyId}_idle.png`, `${enemyId}_fly.png`]) {
        const extraAsset = authoredEnemySheet(extra, `assets/enemies/${extra}`, extra.endsWith('fly.png') ? 'idle' : 'idle');
        if (extraAsset) recordAsset(extraAsset, 'animation');
      }
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
      const npcFrame = compiledSpriteFrameSize('npc');
      // Soot-iron courier-family silhouette with a small role accent — not a full-body role
      // flood (quest_giver used to paint the whole NPC mustard, which read as a pickup).
      const npcColors = npcActorPalette(
        role,
        options.visualDNA?.palette ?? { global: options.characterVisualDna?.palette },
      );
      const npcSpec: SpriteSpec = {
        id: npcId,
        width: npcFrame.width,
        height: npcFrame.height,
        fill: npcColors.fill,
        accent: npcColors.accent,
        shape: 'humanoid',
      };

      options.onTaskProgress?.(
        'npc_sprite',
        ni + 1,
        npcList.length,
        `Generating NPC ${ni + 1} / ${npcList.length}: ${npc.name ?? npcId}`,
      );

      // Foundry visual slice ships a hand-authored foundry-tender still for npc_000 (the shrine
      // tender / Wanderer companion). Prefer it over generation for the base portrait.
      const authoredNpc =
        useCourierKit && npcId === 'npc_000'
          ? this.materializeAuthoredCourier({
              id: npcId,
              path: `assets/npcs/${npcId}.png`,
              filename: 'npc_000.png',
              width: npcSpec.width,
              height: npcSpec.height,
              outputDir: options.outputDir,
            })
          : null;
      const npcAsset =
        authoredNpc ??
        (await this.generateSprite({
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
        }));
      recordAsset(npcAsset, 'npc');
      recordAsset(
        (useCourierKit && npcId === 'npc_000'
          ? this.materializeAuthoredCourier({
              id: `${npcId}_walk`,
              path: `assets/npcs/${npcId}_walk.png`,
              filename: 'npc_000_walk.png',
              width: npcSpec.width * 4,
              height: npcSpec.height,
              outputDir: options.outputDir,
              animationKind: 'walk',
              frameCount: 4,
              expectedFrameWidth: npcSpec.width,
            })
          : null) ??
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
      if (useCourierKit && npcId === 'npc_000') {
        for (const extra of ['idle', 'talk', 'listen'] as const) {
          const extraAsset = this.materializeAuthoredCourier({
            id: `${npcId}_${extra}`,
            path: `assets/npcs/${npcId}_${extra}.png`,
            filename: `npc_000_${extra}.png`,
            width: npcSpec.width * 4,
            height: npcSpec.height,
            outputDir: options.outputDir,
            animationKind: extra === 'idle' ? 'idle' : 'walk',
            frameCount: 4,
            expectedFrameWidth: npcSpec.width,
          });
          if (extraAsset) recordAsset(extraAsset, 'animation');
        }
      }
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
            // A portrait crop of procedural NPC art carries no new content beyond the parent's
            // pixels — it should inherit the parent's *actual* provenance/critique evidence
            // rather than a fabricated placeholder score. Previously this always recorded
            // provider:'pixel-art-processor' + a hardcoded critiqueScore (45/70) whenever the
            // parent was a fallback, which permanently pinned the portrait to PLACEHOLDER even
            // after the parent itself was promoted to PROCEDURAL_PRODUCTION on real evidence.
            provider: npcAsset.provider,
            modelId: npcAsset.modelId,
            fallbackGenerated: npcAsset.fallbackGenerated,
            critiquePassed: npcAsset.fallbackGenerated ? npcAsset.critiquePassed : true,
            critiqueScore: npcAsset.fallbackGenerated ? npcAsset.critiqueScore : 70,
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
      // Ability icons are the first category migrated onto pipeline v2's explicit
      // request → plan → generation → normalization → processing → compilation → validation →
      // manifest flow (see pipeline-v2/orchestrator.ts) — smallest-boundary migration so the
      // rest of asset-pipeline.ts (player/enemy/boss/npc/tileset/background) stays untouched.
      const { manifest: v2Manifest } = await runAssetPipelineV2([
        {
          id: `ability_icon_${ability.id}`,
          category: 'ability_icon',
          runtimeUse: 'HUD ability slot icon',
          artDirection: `${options.gameDna.identity.visualStyle}, centered symbol for "${ability.name}", no text, no UI chrome`,
          seed: options.seed + 11000 + hashPrompt(ability.id).charCodeAt(0),
        },
      ]);
      const v2Entry = v2Manifest[0]!;
      writeCheckpoint(options.outputDir, iconPath, v2Entry.buffer);
      recordAsset(
        {
          id: v2Entry.assetId,
          path: iconPath,
          buffer: v2Entry.buffer,
          provider: v2Entry.provider,
          fallbackGenerated: v2Entry.generationExecutionPath === 'procedural_fallback',
          critiquePassed: v2Entry.validation.passed,
          critiqueScore: v2Entry.validation.passed ? 70 : 0,
          parentArtifactIds: [],
          compiler: 'asset_pipeline_v2',
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

      const authoredBoss = useCourierKit
        ? this.materializeAuthoredCourier({
            id: bossId,
            path: `assets/bosses/${bossId}.png`,
            filename: `${bossId}.png`,
            width: bossFrame.width,
            height: bossFrame.height,
            outputDir: options.outputDir,
          })
        : null;
      const bossAsset = authoredBoss ?? (await this.generateSprite({
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
      }));
      recordAsset(bossAsset, 'boss');

      const bossSource = bossAsset.fallbackGenerated ? undefined : bossAsset.buffer;
      const authoredBossSheet = (filename: string, path: string, kind: AnimationKind): GeneratedAsset | null =>
        useCourierKit
          ? this.materializeAuthoredCourier({
              id: path.split('/').pop()!.replace('.png', ''),
              path,
              filename,
              width: bossFrame.width * 4,
              height: bossFrame.height,
              outputDir: options.outputDir,
              animationKind: kind === 'idle' ? 'idle' : kind,
              frameCount: 4,
              expectedFrameWidth: bossFrame.width,
            })
          : null;
      recordAsset(
        authoredBossSheet(`${bossId}_walk.png`, `assets/bosses/${bossId}_walk.png`, 'walk') ??
          this.buildWalkSheetAsset(
            bossId,
            bossSpec,
            `assets/bosses/${bossId}_walk.png`,
            BOSS_ANIMATION_SPEC.walk!.frameCount,
            tileSize,
            bossSource,
          ),
        'animation',
      );
      recordAsset(
        authoredBossSheet(`${bossId}_hurt.png`, `assets/bosses/${bossId}_hurt.png`, 'hurt') ??
          this.buildHurtSheetAsset(
            bossId,
            bossSpec,
            `assets/bosses/${bossId}_hurt.png`,
            BOSS_ANIMATION_SPEC.hurt!.frameCount,
            tileSize,
            bossSource,
          ),
        'animation',
      );
      recordAsset(
        authoredBossSheet(`${bossId}_death.png`, `assets/bosses/${bossId}_death.png`, 'death') ??
          this.buildDeathSheetAsset(
            bossId,
            bossSpec,
            `assets/bosses/${bossId}_death.png`,
            BOSS_ANIMATION_SPEC.death!.frameCount,
            tileSize,
            bossSource,
          ),
        'animation',
      );
      recordAsset(
        authoredBossSheet(`${bossId}_attack.png`, `assets/bosses/${bossId}_attack.png`, 'attack') ??
          this.buildAttackSheetAsset(
            bossId,
            bossSpec,
            `assets/bosses/${bossId}_attack.png`,
            BOSS_ANIMATION_SPEC.attack!.frameCount,
            tileSize,
            bossSource,
          ),
        'animation',
      );
      const bossCombatProgression = ['idle', 'telegraph', 'recovery', 'attack_projectile', 'attack_burst'] as const;
      for (const clip of bossCombatProgression) {
        const def = BOSS_ANIMATION_SPEC[clip]!;
        const kind: AnimationKind = clip === 'attack_projectile' || clip === 'attack_burst' ? 'attack' : 'idle';
        recordAsset(
          authoredBossSheet(`${bossId}_${clip}.png`, `assets/bosses/${bossId}_${clip}.png`, kind) ??
            this.buildProgressionSheetAsset(
              bossId,
              def,
              bossSpec,
              `assets/bosses/${bossId}_${clip}.png`,
              tileSize,
              bossSource,
            ),
          'animation',
        );
      }
      {
        const animSidecarDir = join(options.outputDir, 'assets', 'bosses');
        mkdirSync(animSidecarDir, { recursive: true });
        writeFileSync(
          join(animSidecarDir, `${bossId}_animations.json`),
          JSON.stringify(buildBossAnimationSidecar(), null, 2),
        );
      }
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
      const terrainVisualTemplate = await resolveTerrainVisualTemplate(
        options.visualReferenceLibrary,
        b,
        `tileset_biome_${b}`,
        options.seed + b * 100,
        options.styleBible,
        options.visualReferenceProvider,
        options.visualReferenceLibraryRoot ?? process.cwd(),
      );
      if (terrainVisualTemplate) visualTemplateProvenance.push(terrainVisualTemplate.provenance);

      let processedBuffer: Buffer;
      let critiquePassed: boolean;
      let critiqueScore: number;
      let provider: string;
      let fallback: boolean;
      let modelId: string | undefined;

      const authoredMasonry =
        !cachedTileset &&
        shouldUseFoundryCourierKit({
          profile: options.profile,
          gameDna: options.gameDna,
          characterVisualDna: options.characterVisualDna,
        })
          ? loadAuthoredFoundryTileset(b, tileSize)
          : null;

      if (cachedTileset) {
        processedBuffer = cachedTileset;
        critiquePassed = true;
        critiqueScore = 100;
        provider = 'checkpoint';
        fallback = false;
        modelId = undefined;
      } else if (authoredMasonry) {
        // Hand-authored 32px foundry masonry atlas (256×192) — the Foundry visual slice's
        // deliberate modular kit, in place of the procedural compiler output.
        processedBuffer = authoredMasonry;
        critiquePassed = true;
        critiqueScore = 82;
        provider = AUTHORED_COURIER_PROVIDER;
        fallback = false;
        modelId = undefined;
        writeCheckpoint(
          options.outputDir,
          `assets/tilesets/biome_${b}/terrain.json`,
          Buffer.from(
            JSON.stringify(
              {
                tileSize,
                roles: buildTileTerrainMetadata(),
                missingRoles: [],
                seamIssues: [],
                passed: true,
                styleFingerprint: options.visualDNA?.styleFingerprint,
                provider: AUTHORED_COURIER_PROVIDER,
              },
              null,
              2,
            ),
            'utf8',
          ),
        );
        if (b === 0) writeCheckpoint(options.outputDir, 'assets/qa/tileset-test.png', processedBuffer);
        writeCheckpoint(options.outputDir, tilesetPath, processedBuffer);
      } else {
        let tileBuffer = generateTilesetSource(options.seed + b * 100, 128, terrainVisualTemplate?.style);
        fallback = true;
        provider = 'procedural';
        modelId = undefined;

        if (imageGen) {
          try {
            checkCancelled();
            const tilePrompt =
              terrainVisualTemplate?.prompt ??
              applyStylePrompt(
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
                terrainSets: [{ id: GROUND_TERRAIN_SET_ID, terrain: GROUND_TERRAIN_ID, name: 'ground', maskRoles: GROUND_TERRAIN_MASK_ROLES }],
                missingRoles,
                seamIssues: compiled.seamIssues,
                passed: compiled.passed && missingRoles.length === 0,
                styleFingerprint: options.visualDNA?.styleFingerprint,
              },
              null,
              2,
            ),
            'utf8',
          ),
        );
        writeCheckpoint(
          options.outputDir,
          `assets/tilesets/biome_${b}/terrain.tres`,
          Buffer.from(buildGroundTerrainTresText(b, tileSize), 'utf8'),
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
      if (terrainVisualTemplate) finalizeVisualTemplateProvenance(terrainVisualTemplate.provenance, provider, modelId);

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
          sourceType: authoredMasonry ? 'manual' : undefined,
          compiler: authoredMasonry ? 'authored-original' : undefined,
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
            provider: fallback ? 'procedural' : authoredMasonry ? provider : 'pixel-art-processor',
            fallbackGenerated: fallback,
            critiquePassed: true,
            critiqueScore: 100,
            sourceType: authoredMasonry ? 'manual' : undefined,
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
          const dim = PARALLAX_STRIP_SIZE[layer];
          const authoredBgName =
            (layer === 'foreground' || layer === 'near') && b === 0
              ? `pouring_${layer}.png`
              : (layer === 'foreground' || layer === 'near') && b === 1
                ? `quench_${layer}.png`
                : (layer === 'foreground' || layer === 'near') && b === 2
                  ? `cooling_${layer}.png`
                  : b === 1 && (layer === 'far' || layer === 'mid')
                    ? `quench_${layer}.png`
                    : b === 2 && (layer === 'far' || layer === 'mid')
                      ? `cooling_${layer}.png`
                      : null;
          const authoredBgRaw =
            useCourierKit && authoredBgName ? loadAuthoredBiomePng(authoredBgName) : null;
          if (authoredBgRaw) {
            const processedBg = this.pixelArt.process(authoredBgRaw, {
              targetWidth: dim.width,
              targetHeight: dim.height,
              tileSize,
              skipQuantize: true,
            });
            writeCheckpoint(options.outputDir, bgPath, processedBg.buffer);
            recordAsset(
              {
                id: `bg_biome_${b}_${layer}`,
                path: bgPath,
                buffer: processedBg.buffer,
                provider: AUTHORED_COURIER_PROVIDER,
                fallbackGenerated: false,
                critiquePassed: true,
                critiqueScore: 82,
                sourceType: 'manual',
              },
              'background',
            );
            continue;
          }
          const backgroundVisualTemplate = await resolveBackgroundVisualTemplate(
            options.visualReferenceLibrary,
            b,
            `background_biome_${b}_${layer}`,
            options.seed + b * 50 + li,
            options.styleBible,
            options.visualReferenceProvider,
            options.visualReferenceLibraryRoot ?? process.cwd(),
          );
          if (backgroundVisualTemplate) visualTemplateProvenance.push(backgroundVisualTemplate.provenance);
          const bgPalette = backgroundVisualTemplate?.palette ?? BIOME_PALETTES[b % BIOME_PALETTES.length];
          const bgFeatures = backgroundVisualTemplate?.features;
          let bgBuffer = generateParallaxStrip(
            layer,
            options.seed + b * 50 + li,
            dim.width,
            dim.height,
            bgPalette,
            bgFeatures,
          );
          let bgFallback = true;
          let bgProvider = 'procedural';
          let bgModel: string | undefined;
          const useAi = Boolean(imageGen) && layer === 'far';
          const layerPrompt = backgroundVisualTemplate?.prompt ?? PARALLAX_LAYER_PROMPTS[layer];
          if (useAi) {
            try {
              const result = await imageGen!.generateImage({
                profile: 'BACKGROUND',
                prompt: sanitizeImagePromptText(
                  backgroundVisualTemplate
                    ? layerPrompt
                    : applyStylePrompt(
                        options.styleBible,
                        'ENVIRONMENT',
                        `${layerPrompt}, ${options.gameDna.identity.visualStyle} ${options.gameDna.identity.tone ?? ''} citadel-or-biome interiors matching the tileset palette, side-view night beyond windows, no UI, no text, no logos, no characters`,
                      ),
                ),
                negativePrompt: `${negativePrompt ?? ''}, UI, HUD, text, logos, watermarks, characters, people, person, human, explorer, warden, portraits, pine trees, conifer forest, mountain range, lake vista, alpine woodland, outdoor landscape photography, shoreline, nature vista, unrelated biome, floating plates`,
                width: 1024,
                height: 512,
                seed: options.seed + 4000 + b * 10 + li,
                signal: options.signal,
                modelOverride: nvidiaModelForImageTask('BACKGROUND_SOURCE'),
              });
              const processedBg = this.pixelArt.process(result.image, {
                targetWidth: dim.width,
                targetHeight: dim.height,
                tileSize,
                alphaThreshold: 8,
                skipQuantize: true,
              });
              bgBuffer = processedBg.buffer;
              bgFallback = result.fallbackGenerated;
              bgProvider = result.provider;
              bgModel = result.modelId;
              if (layer === 'far' && farPlateLooksLikeOutdoorLandscape(bgBuffer)) {
                warnings.push(
                  `Background far biome ${b} looked like outdoor landscape (pines/figures) — procedural citadel fallback`,
                );
                bgBuffer = generateParallaxStrip(layer, options.seed + b * 50 + li, dim.width, dim.height, bgPalette, bgFeatures);
                bgFallback = true;
                bgProvider = 'procedural';
                bgModel = undefined;
              }
            } catch {
              warnings.push(`Background ${layer} biome ${b} failed — procedural strip fallback`);
            }
          }
          if (backgroundVisualTemplate) finalizeVisualTemplateProvenance(backgroundVisualTemplate.provenance, bgProvider, bgModel);
          writeCheckpoint(options.outputDir, bgPath, bgBuffer);
          recordAsset(
            {
              id: `bg_biome_${b}_${layer}`,
              path: bgPath,
              buffer: bgBuffer,
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

    // World interactables (pickup / save shrine / ability altar). These replace the old ColorRect
    // stubs the merged WorldPropSprite-based scenes (SavePoint/AbilityPickup/ItemPickup .tscn)
    // reference; without them those scenes fall back to a flat fallback_color. Foundry authored
    // masonry supplies the ability altar art when the courier kit applies.
    options.onTaskStarted?.('world_interactables', 'Generating world interactable sprites');
    {
      const useCourierKit = shouldUseFoundryCourierKit({
        profile: options.profile,
        gameDna: options.gameDna,
        characterVisualDna: options.characterVisualDna,
      });
      const { fill: interactFill, accent: interactAccent } = interactablePalette(
        options.visualDNA?.palette,
      );
      for (const spec of WORLD_INTERACTABLE_ASSETS) {
        checkCancelled();
        const authoredAbility =
          useCourierKit && spec.id === 'world_ability' ? loadAuthoredMasonryPng('ability.png') : null;
        const buffer =
          authoredAbility ??
          generatePropSprite({
            width: spec.width,
            height: spec.height,
            fill: interactFill,
            accent: interactAccent,
            family: spec.family,
            seed: options.seed + hashPrompt(spec.id).charCodeAt(0),
          });
        writeCheckpoint(options.outputDir, spec.path, buffer);
        recordAsset(
          {
            id: spec.id,
            path: spec.path,
            buffer,
            provider: authoredAbility ? AUTHORED_COURIER_PROVIDER : 'procedural',
            fallbackGenerated: !authoredAbility,
            critiquePassed: true,
            critiqueScore: authoredAbility ? 82 : 70,
            styleFingerprint: options.visualDNA?.styleFingerprint,
            compiler: authoredAbility ? 'authored-original' : 'prop-art',
            transformation: 'world-interactable',
            godotResourcePath: `res://${spec.path}`,
            sourceType: authoredAbility ? 'manual' : undefined,
          },
          'prop',
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

    if (options.visualDNA) {
      options.onTaskStarted?.('ui_foundry', 'Generating UI art foundry assets');
      const uiFill = options.visualDNA.palette.ui[0] ?? '#141820';
      const uiBorder = options.visualDNA.palette.highlights[0] ?? '#dce6f0';
      const uiAccent = options.visualDNA.palette.accents[0] ?? '#5a8cdc';
      for (const spec of UI_FOUNDRY_ASSETS) {
        const buffer =
          spec.kind === 'icon'
            ? generateUiIcon({ size: spec.width, fill: uiFill, accent: uiAccent, kind: spec.id })
            : generateUiPanel({
                width: spec.width,
                height: spec.height,
                fill: uiFill,
                border: uiBorder,
                accent: uiAccent,
              });
        writeCheckpoint(options.outputDir, spec.path, buffer);
        recordAsset(
          {
            id: spec.id,
            path: spec.path,
            buffer,
            provider: 'procedural',
            fallbackGenerated: true,
            critiquePassed: true,
            critiqueScore: 70,
            styleFingerprint: options.visualDNA.styleFingerprint,
            compiler: 'ui-foundry',
            transformation: 'visual-dna-ui',
            godotResourcePath: `res://${spec.path}`,
          },
          'ui',
        );
      }
      // Real AI generation is only attempted for VISUAL_VERTICAL_SLICE — every other profile
      // (TINY_TEST/SMALL/MEDIUM/LARGE/RELEASE_CANDIDATE) keeps the original all-procedural
      // prop path untouched, matching the `allowAiUpgrade` gating convention used for pose
      // upgrades elsewhere in this file.
      const attemptAiProps = options.profile === 'VISUAL_VERTICAL_SLICE' && Boolean(imageGen);
      // One real NVIDIA round-trip per distinct prop *family*, not per prop instance —
      // `kit.props` for VISUAL_VERTICAL_SLICE cycles a small (~4 name) motif pool
      // (see packages/procedural/src/visual/environment-kit.ts), so in practice this caps
      // at ~4 calls per biome; MAX_AI_PROP_FAMILIES is a hard backstop in case a future
      // biome motif pack grows the pool.
      const MAX_AI_PROP_FAMILIES = 6;

      for (const kit of options.environmentKits ?? []) {
        const propBudget = kit.props.slice(0, options.profile === 'TINY_TEST' ? 4 : kit.props.length);
        const familyAssets = new Map<string, GeneratedAsset>();
        let aiFamiliesAttempted = 0;

        for (const prop of propBudget) {
          checkCancelled();
          const rel = `assets/props/${kit.biomeId}/${prop.id}.png`;
          const family = prop.family.includes('moss') || prop.family.includes('plant') ? 'debris' : prop.family;
          const familyKey = `${kit.biomeId}:${family}`;
          const propIndex = Number(prop.id.replace(/.*_prop_/, '')) || 0;
          const authoredPropRaw =
            useCourierKit ? loadAuthoredBiomePng(`${foundryBiomeStem(kit.biomeId)}_prop_${propIndex % 4}.png`) : null;

          let familyAsset = familyAssets.get(familyKey);
          if (authoredPropRaw) {
            const processedProp = this.pixelArt.process(authoredPropRaw, {
              targetWidth: 32,
              targetHeight: 32,
              skipQuantize: true,
            });
            writeCheckpoint(options.outputDir, rel, processedProp.buffer);
            familyAsset = withMaturity({
              id: prop.id,
              path: rel,
              buffer: processedProp.buffer,
              provider: AUTHORED_COURIER_PROVIDER,
              fallbackGenerated: false,
              critiquePassed: true,
              critiqueScore: 82,
              sourceType: 'manual',
              compiler: 'authored-courier',
              transformation: 'authored-original',
              godotResourcePath: `res://${rel}`,
            });
            familyAssets.set(`${kit.biomeId}:${prop.id}`, familyAsset);
          } else if (!familyAsset) {
            const useAiForThisFamily = attemptAiProps && aiFamiliesAttempted < MAX_AI_PROP_FAMILIES;
            if (useAiForThisFamily) aiFamiliesAttempted++;
            const familySeed = options.seed + hashPrompt(familyKey).charCodeAt(0);
            const propVisualTemplate = await resolvePropVisualTemplate(
              options.visualReferenceLibrary,
              biomeIndexFromId(kit.biomeId),
              `${kit.biomeId}_prop_family_${family.replace(/\s+/g, '_')}`,
              familySeed,
              options.styleBible,
              options.visualReferenceProvider,
              options.visualReferenceLibraryRoot ?? process.cwd(),
            );
            if (propVisualTemplate) visualTemplateProvenance.push(propVisualTemplate.provenance);
            familyAsset = await this.generatePropFamilyAsset({
              id: `${kit.biomeId}_prop_family_${family.replace(/\s+/g, '_')}`,
              path: rel,
              family,
              fill: propVisualTemplate?.fill ?? environmentDecorationPalette(options.visualDNA.palette).fill,
              accent: propVisualTemplate?.accent ?? environmentDecorationPalette(options.visualDNA.palette).accent,
              width: 32,
              height: 32,
              imageGen: useAiForThisFamily ? imageGen : null,
              prompt:
                propVisualTemplate?.prompt ??
                applyStylePrompt(
                  options.styleBible,
                  'PROP',
                  `${family} environmental prop, small isolated game object, ${kit.biomeId} biome, ${options.gameDna.identity.visualStyle}`,
                  options.visualDNA,
                  'prop',
                ),
              negativePrompt: `${negativePrompt ?? ''}, character, creature, text, watermark, full scene, landscape`,
              seed: familySeed,
              outputDir: options.outputDir,
              resume: options.resume,
              signal: options.signal,
              features: propVisualTemplate?.features,
            });
            if (propVisualTemplate) finalizeVisualTemplateProvenance(propVisualTemplate.provenance, familyAsset.provider, familyAsset.modelId);
            familyAssets.set(familyKey, familyAsset);
          } else if (familyAsset.path !== rel) {
            // Reuse the family's generated bytes for this instance's own checkpoint file —
            // no additional image-generation call.
            writeCheckpoint(options.outputDir, rel, familyAsset.buffer);
          }

          recordAsset(
            {
              ...familyAsset,
              id: prop.id,
              path: rel,
              styleFingerprint: kit.styleFingerprint,
              compiler: familyAsset.fallbackGenerated ? 'prop-art' : 'nvidia-prop-family',
              transformation: 'environment-kit-prop',
              godotResourcePath: `res://${rel}`,
            },
            'prop',
          );
        }

        // Macro architecture (arches, pillars, statues, gears, pipes) — wall-mounted at a much
        // bigger scale than the floor props above (see room-assembler.ts's ARCH_SCALE placement).
        // kit.architecture cycles a small pool of ~4 unique families before repeating, so the
        // first 4 entries already cover the pool; matches room-assembler.ts's hardcoded
        // `biome_${i}_arch_${0..3}.png` convention with zero extra plumbing, the same pattern
        // props already use.
        for (const arch of kit.architecture.slice(0, 4)) {
          checkCancelled();
          const rel = `assets/architecture/${kit.biomeId}/${arch.id}.png`;
          const archIndex = Number(arch.id.replace(/.*_arch_/, '')) || 0;
          const authoredArchRaw =
            useCourierKit ? loadAuthoredBiomePng(`${foundryBiomeStem(kit.biomeId)}_arch_${archIndex % 4}.png`) : null;
          if (authoredArchRaw) {
            const processedArch = this.pixelArt.process(authoredArchRaw, {
              targetWidth: 48,
              targetHeight: 112,
              skipQuantize: true,
            });
            writeCheckpoint(options.outputDir, rel, processedArch.buffer);
            recordAsset(
              {
                id: arch.id,
                path: rel,
                buffer: processedArch.buffer,
                provider: AUTHORED_COURIER_PROVIDER,
                fallbackGenerated: false,
                critiquePassed: true,
                critiqueScore: 82,
                sourceType: 'manual',
                compiler: 'authored-courier',
                transformation: 'authored-original',
                godotResourcePath: `res://${rel}`,
                styleFingerprint: kit.styleFingerprint,
              },
              'prop',
            );
            continue;
          }
          const familyAsset = await this.generatePropFamilyAsset({
            id: `${kit.biomeId}_architecture_family_${arch.family.replace(/\s+/g, '_')}`,
            path: rel,
            family: arch.family,
            fill: environmentDecorationPalette(options.visualDNA.palette).fill,
            accent: environmentDecorationPalette(options.visualDNA.palette).accent,
            width: 48,
            height: 112,
            imageGen: null,
            prompt: applyStylePrompt(
              options.styleBible,
              'PROP',
              `${arch.family} architectural silhouette, tall wall-mounted structure, ${kit.biomeId} biome, ${options.gameDna.identity.visualStyle}`,
              options.visualDNA,
              'prop',
            ),
            negativePrompt: `${negativePrompt ?? ''}, character, creature, text, watermark, full scene, landscape`,
            seed: options.seed + hashPrompt(`${kit.biomeId}:${arch.family}`).charCodeAt(0),
            outputDir: options.outputDir,
            resume: options.resume,
            signal: options.signal,
          });
          recordAsset(
            {
              ...familyAsset,
              id: arch.id,
              path: rel,
              styleFingerprint: kit.styleFingerprint,
              compiler: 'prop-art',
              transformation: 'environment-kit-architecture',
              godotResourcePath: `res://${rel}`,
            },
            'prop',
          );
        }
      }
    }

    const interactiveSpecs: Array<{
      id: string;
      family: 'checkpoint' | 'pickup' | 'gate' | 'chest' | 'portal';
      shape: 'checkpoint' | 'ability_pickup' | 'ability_gate' | 'chest_closed' | 'chest_open' | 'portal';
      fill: [number, number, number, number];
      accent: [number, number, number, number];
    }> = [
      { id: 'interactive_checkpoint', family: 'checkpoint', shape: 'checkpoint', fill: [44, 77, 105, 255], accent: [88, 224, 210, 255] },
      { id: 'interactive_ability_pickup', family: 'pickup', shape: 'ability_pickup', fill: [54, 75, 132, 255], accent: [246, 208, 82, 255] },
      { id: 'interactive_ability_gate', family: 'gate', shape: 'ability_gate', fill: [45, 58, 91, 255], accent: [246, 208, 82, 255] },
      // No world-object family previously existed for a chest at all — every generated project's
      // chest/pickup container rendered as a hand-drawn ColorRect square in whichever template
      // instantiated it, regardless of what art actually got generated. Two states (not a recolor
      // of one shape) so a closed vs. opened chest is readable at a glance, matching the same
      // deterministic-procedural-baseline guarantee the three specs above already give: these exist
      // even with every AI provider unavailable.
      { id: 'interactive_chest_closed', family: 'chest', shape: 'chest_closed', fill: [92, 60, 36, 255], accent: [246, 208, 82, 255] },
      { id: 'interactive_chest_open', family: 'chest', shape: 'chest_open', fill: [92, 60, 36, 255], accent: [246, 208, 82, 255] },
      // Same gap as chest: no inter-area/dungeon-entrance portal marker existed either. A single
      // state (a portal has no locked/unlocked concept the way a gate does) is enough here.
      { id: 'interactive_portal', family: 'portal', shape: 'portal', fill: [58, 46, 82, 255], accent: [150, 110, 226, 255] },
    ];
    for (const spec of interactiveSpecs) {
      const path = `assets/generated/${spec.family}/${spec.id}.png`;
      const buffer = generateProceduralSprite({
        id: spec.id,
        width: 32,
        height: 32,
        fill: spec.fill,
        accent: spec.accent,
        shape: spec.shape,
      });
      writeCheckpoint(options.outputDir, path, buffer);
      recordAsset(
        {
          id: spec.id,
          path,
          buffer,
          provider: 'procedural',
          fallbackGenerated: true,
          critiquePassed: true,
          critiqueScore: 82,
          proceduralProduction: true,
          compiler: 'interactive-procedural-art',
          transformation: 'visual-dna-interactive',
          godotResourcePath: `res://${path}`,
        },
        spec.family,
      );
    }
    if (useCourierKit) {
      const barrierRaw = loadAuthoredBiomePng('foundry_phase_barrier.png');
      if (barrierRaw) {
        const barrierPath = 'assets/generated/gate/foundry_phase_barrier.png';
        const processedBarrier = this.pixelArt.process(barrierRaw, {
          targetWidth: 48,
          targetHeight: 160,
          skipQuantize: true,
        });
        writeCheckpoint(options.outputDir, barrierPath, processedBarrier.buffer);
        recordAsset(
          {
            id: 'foundry_phase_barrier',
            path: barrierPath,
            buffer: processedBarrier.buffer,
            provider: AUTHORED_COURIER_PROVIDER,
            fallbackGenerated: false,
            critiquePassed: true,
            critiqueScore: 82,
            sourceType: 'manual',
            compiler: 'authored-courier',
            transformation: 'authored-original',
            godotResourcePath: `res://${barrierPath}`,
          },
          'gate',
        );
      }
    }

    const visualEnhancement = await this.runVisualEnhancement(options, assets);
    // The pipeline caller (packages/generation/src/pipeline.ts) rebuilds its Godot texture-write
    // map from *this* returned assets[] array's .buffer fields — it doesn't re-read disk. Without
    // this patch, a genuinely successful enhancement (already written to disk above) gets silently
    // clobbered back to the pre-enhancement procedural bytes the moment the caller re-writes every
    // texture from its stale in-memory copy. Patch every activated asset's buffer/provenance to
    // match what's actually on disk now.
    if (visualEnhancement) {
      for (const outcome of visualEnhancement.outcomes) {
        if (!outcome.succeeded || !outcome.activatedPath) continue;
        try {
          const buffer = readFileSync(join(options.outputDir, ...outcome.activatedPath.split('/')));
          const target = assets.find((a) => a.path === outcome.activatedPath);
          if (target) {
            target.buffer = buffer;
            target.provider = outcome.provider ?? target.provider;
            target.modelId = outcome.model;
            target.fallbackGenerated = false;
            target.sourceType = 'ai_generated';
            target.maturity = 'QA_REVIEW';
            target.productionReady = false;
            target.proceduralProduction = false;
            target.productionAllowed = true;
            target.transformation = `nvidia-nim-visual-enhancement:${outcome.plan.replacementStrategy}`;
          } else {
            // Truly-novel asset (checkpoint/pickup/gate) — no pre-existing entry to patch, so it
            // was never going to reach generation_manifest.json / get a Godot .import sidecar
            // written at all. Append it so the enhancement is actually wired, not just on disk.
            assets.push(
              withMaturity({
                id: outcome.plan.assetId,
                path: outcome.activatedPath,
                buffer,
                provider: outcome.provider ?? 'unknown',
                modelId: outcome.model,
                fallbackGenerated: false,
                sourceType: 'ai_generated',
                transformation: `nvidia-nim-visual-enhancement:${outcome.plan.replacementStrategy}`,
                godotResourcePath: `res://${outcome.activatedPath}`,
              }),
            );
          }
        } catch {
          /* file genuinely missing — leave assets[] as-is, already correct (procedural stays active) */
        }
      }
    }

    if (visualTemplateProvenance.length > 0) {
      const reportsDir = join(options.outputDir, 'reports');
      mkdirSync(reportsDir, { recursive: true });
      writeFileSync(
        join(reportsDir, 'visual-template-provenance.json'),
        JSON.stringify(
          {
            styleVersion: options.visualReferenceLibrary?.styleVersion,
            libraryId: options.visualReferenceLibrary?.id,
            entries: visualTemplateProvenance,
          },
          null,
          2,
        ),
      );
    }

    return {
      assets,
      visualEnhancement,
      warnings,
      degraded:
        !imageGen ||
        assets.some((a) => isNonProductionMaturity(a.maturity)),
      fallbackDepth: imageRoute.fallbackDepth + (imageGen ? 0 : 1),
      fallbackReason: imageRoute.fallbackReason,
      selectedProvider: imageRoute.selectedProvider ?? imageGen?.id,
      fakeAnimationDetected,
    };
  }

  /**
   * Post-baseline NVIDIA NIM enhancement pass. Only reached when visualMode !== 'procedural-only'
   * (the default) — procedural-only projects never construct an NVIDIA provider or touch the
   * network from this method at all, matching the non-negotiable "must not destabilize the
   * guaranteed procedural path" requirement. Every plan resolves through runVisualEnhancementPass,
   * which never throws — a NIM failure here degrades to the already-written procedural asset, it
   * never fails the overall generation.
   */
  private async runVisualEnhancement(
    options: AssetPipelineOptions,
    assets: GeneratedAsset[],
  ): Promise<import('./visual-enhancement/types.js').VisualEnhancementSummary | undefined> {
    const visualMode = options.visualMode ?? 'procedural-only';
    if (visualMode === 'procedural-only') return undefined;

    const { planAssetReplacements, runVisualEnhancementPass } = await import('./visual-enhancement/index.js');
    const plans = planAssetReplacements({
      projectSlug: options.gameDna.identity.title ?? options.outputDir,
      generationId: `${options.seed}`,
      baselineAssets: assets.map((a) => ({
        id: a.id,
        path: a.path,
        absolutePath: join(options.outputDir, ...a.path.split('/')),
      })),
      biomeCount: options.biomeVisualDNAs?.length ?? 0,
    });
    if (plans.length === 0) return { visualMode, attempted: 0, enhanced: 0, fallenBack: 0, skipped: 0, outcomes: [] };

    // Tests/callers may inject a single editor/generator directly (legacy path, still fully
    // supported) — when they do, skip building the real multi-provider chain entirely so an
    // injected mock never silently gets a live NVIDIA/Pollinations provider tacked on beside it.
    if (options.visualEnhancementEditor || options.visualEnhancementGenerator) {
      return runVisualEnhancementPass({
        visualMode,
        plans,
        storageRoot: options.outputDir,
        editor: options.visualEnhancementEditor,
        generator: options.visualEnhancementGenerator,
        promptContext: {
          gameStyleLabel: options.gameDna.identity.visualStyle,
          tone: options.gameDna.identity.tone,
          visualDNA: options.visualDNA,
        },
      });
    }

    // Real multi-provider chain. NVIDIA stays first choice (priority 0) for both capabilities;
    // Pollinations is generation-only (no reference-image/edit input on its free public API — see
    // pollinations-image.ts's doc comment) so it only ever competes for generate-from-spec plans
    // (backgrounds, checkpoint/pickup/gate icons), never for character/enemy/boss edits. One
    // provider being down (see the Candidate 06 report's NVIDIA hosted-inference reliability
    // findings) no longer stalls the whole pass — see VisualProviderExecutionPolicy/circuit
    // breaker in replace.ts.
    const { NvidiaImageEditProvider } = await import('./providers/nvidia-image-edit.js');
    const { NvidiaImageProvider } = await import('./providers/nvidia-image.js');
    const { PollinationsImageProvider } = await import('./providers/pollinations-image.js');
    const { NVIDIA_MODEL_CATALOG } = await import('./foundry/nvidia-catalog.js');
    const { resolveCapabilityDeployment } = await import('./providers/nvidia-nim.js');

    // NvidiaImageEditProvider's own constructor falls back to process.env.NVIDIA_IMAGE_MODEL
    // (the *generation*-only model) before its catalog-driven edit default when
    // NVIDIA_IMAGE_EDIT_MODEL isn't set — a real bug the visual_enhancement_report.json
    // diagnostics caught: every edit request failed UNSUPPORTED_CAPABILITY because it was
    // silently trying to edit with black-forest-labs/flux.1-dev (generation-only). And
    // nvidiaSelectModelForImageTask('IMAGE_EDIT') alone isn't deployment-aware — it picked
    // qwen/qwen-image-edit-2511 (nimAvailable only, hostedAvailable:false) even when running in
    // 'hosted' mode (no NVIDIA_NIM_BASE_URL configured), producing a real HTTP 404 (the model
    // genuinely doesn't exist at the hosted endpoint) — a second, deeper bug behind the first.
    // Filter the catalog by what's actually available at the *current* deployment mode instead.
    const editDeployment = resolveCapabilityDeployment('IMAGE_EDIT');
    const deploymentEditModel = NVIDIA_MODEL_CATALOG.filter(
      (m) =>
        m.status === 'enabled' &&
        m.imageTaskKinds?.includes('IMAGE_EDIT') &&
        (editDeployment.mode === 'nim' ? m.nimAvailable : m.hostedAvailable),
    ).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
    const nvidiaEdit = new NvidiaImageEditProvider({
      apiKey: options.nvidiaApiKey,
      imageApiBaseUrl: options.nvidiaApiBaseUrl,
      modelId: process.env.NVIDIA_IMAGE_EDIT_MODEL ?? deploymentEditModel?.modelId,
    });
    const nvidiaGen = new NvidiaImageProvider({
      apiKey: options.nvidiaApiKey,
      baseUrl: options.nvidiaApiBaseUrl,
      modelId: options.nvidiaImageModel,
    });
    const pollinationsGen = new PollinationsImageProvider();
    const { HuggingFaceImageProvider } = await import('./providers/huggingface-image.js');
    // Reference-image editing chain, per the Candidate 06C task: NVIDIA first (kept preferred),
    // Hugging Face as the live fallback when configured. HUGGINGFACE_API_KEY is empty in this
    // environment — huggingfaceEdit.editImage() fails fast (AUTH, no network call) rather than
    // silently no-opping, so the chain still falls through to procedural correctly whenever a real
    // key isn't configured, and activates automatically the moment one is. Pollinations does NOT
    // join this chain — its free public API has no reference-image/edit input (see
    // pollinations-image.ts's doc comment) and stays generation-only.
    const huggingfaceEdit = new HuggingFaceImageProvider({ apiKey: options.huggingfaceApiKey });

    const editorChain: import('./visual-enhancement/types.js').VisualProviderCandidate[] = [
      { providerId: 'nvidia-image-edit', capability: 'IMAGE_EDIT' as const, editor: nvidiaEdit, priority: 0, outputCapabilities: [] },
      { providerId: 'huggingface-image', capability: 'IMAGE_EDIT' as const, editor: huggingfaceEdit, priority: 1, outputCapabilities: ['transparent_sprite', 'alpha_output', 'fixed_dimensions'] },
    ];
    const generatorChain: import('./visual-enhancement/types.js').VisualProviderCandidate[] = [
      { providerId: 'nvidia-image', capability: 'IMAGE_GENERATION' as const, generator: nvidiaGen, priority: 0, outputCapabilities: ['full_frame_image', 'fixed_dimensions'] },
      { providerId: 'pollinations-image', capability: 'IMAGE_GENERATION' as const, generator: pollinationsGen, priority: 1, outputCapabilities: ['full_frame_image'] },
    ];

    let providerHealthy: boolean | undefined;
    if (visualMode === 'auto') {
      // "Healthy" for auto mode means at least one configured provider is reachable — NVIDIA
      // being down must not silently disable Pollinations too.
      const [nvidiaOk, pollinationsOk] = await Promise.all([
        nvidiaGen.checkHealth().catch(() => false),
        pollinationsGen.checkHealth().catch(() => false),
      ]);
      providerHealthy = nvidiaOk || pollinationsOk;
    }

    return runVisualEnhancementPass({
      visualMode,
      plans,
      storageRoot: options.outputDir,
      editorChain,
      generatorChain,
      providerHealthy,
      promptContext: {
        gameStyleLabel: options.gameDna.identity.visualStyle,
        tone: options.gameDna.identity.tone,
        visualDNA: options.visualDNA,
      },
    });
  }

  private async tryCanonicalPoseSet(opts: {
    id: string;
    destDir: string;
    source?: Buffer;
    /** Prefer hand-authored `<id>_<pose>_pose.png` from the foundry courier kit over the
     *  deterministic procedural transform, when the file exists. */
    useAuthoredCourier?: boolean;
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
    const actorStill = knockedOutSource
      ? this.compileActorFrame(knockedOutSource, opts.spec.width, opts.spec.height, opts.tileSize).buffer
      : undefined;
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
        const identityProvider = wrapIdentityProvider(
          opts.imageGen,
          capabilitiesFromRegistration({
            provider: opts.imageGen!,
            local: false,
            priority: 0,
            family: opts.imageGen!.id.includes('nvidia') ? 'nvidia' : opts.imageGen!.id,
            supportsReferenceImages: opts.imageGen!.id !== 'nvidia-image',
            capabilities:
              opts.imageGen!.id === 'nvidia-image'
                ? ['image-generation']
                : ['image-generation', 'image-editing'],
          }),
        );
        if (!identityProvider.supportsReferenceImage()) {
          warnings.push(
            `Identity-preserving pose provider unavailable for "${opts.id}" (custom reference unsupported) — deterministic poses, no Kontext retries.`,
          );
        } else {
        try {
          throwIfCancelled(opts.signal);
          const result = await identityProvider.generatePose({
            prompt: sanitizeImagePromptText(
              `${opts.prompt}. ${pose.prompt}. transparent background, isolated sprite, identical costume and proportions`,
            ),
            negativePrompt: opts.negativePrompt,
            width: 256,
            height: 256,
            seed: opts.seed + 9000 + i,
            signal: opts.signal,
            referenceImage: opts.source!,
            poseName: pose.name,
            posePrompt: pose.prompt,
          });
          const compiled = this.compileActorFrame(
            knockoutVfxBackground(result.image),
            opts.spec.width,
            opts.spec.height,
            opts.tileSize,
          );
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
      }

      if (!usedAi && opts.useAuthoredCourier) {
        const authoredRaw = loadAuthoredCourierPng(`${opts.id}_${pose.name}_pose.png`);
        if (authoredRaw) {
          const compiled = this.pixelArt.process(authoredRaw, {
            targetWidth: opts.spec.width,
            targetHeight: opts.spec.height,
            skipQuantize: true,
          });
          writeCheckpoint(opts.outputDir, rel, compiled.buffer);
          assets.push(
            withMaturity({
              id: `${opts.id}_${pose.name}_pose`,
              path: rel,
              buffer: compiled.buffer,
              provider: AUTHORED_COURIER_PROVIDER,
              fallbackGenerated: false,
              critiquePassed: true,
              critiqueScore: 82,
              sourceType: 'manual',
              fakeAnimation: false,
              parentArtifactIds: [opts.id],
              compiler: 'authored-courier',
              transformation: 'authored-original',
              godotResourcePath: `res://${rel}`,
              productionAllowed: true,
            }),
          );
          contactFrames.push({ label: pose.name, png: compiled.buffer });
          usedAi = true;
        }
      }

      if (!usedAi) {
        const raw = generatePoseStill(opts.spec, pose.name, actorStill);
        const compiled = this.pixelArt.process(raw, {
          targetWidth: opts.spec.width,
          targetHeight: opts.spec.height,
          tileSize: opts.tileSize,
          skipQuantize: true,
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

  /**
   * Load a hand-authored foundry courier PNG (still or frame strip) and process it into place,
   * with no procedural fallback. Missing files return null so callers fall through to generation.
   * Used for the Foundry visual slice's authored Wanderer / foundry-tender art.
   */
  private materializeAuthoredCourier(opts: {
    id: string;
    path: string;
    filename: string;
    width: number;
    height: number;
    outputDir: string;
    animationKind?: AnimationKind;
    frameCount?: number;
    expectedFrameWidth?: number;
  }): GeneratedAsset | null {
    const raw = loadAuthoredCourierPng(opts.filename) ?? loadAuthoredCastPng(opts.filename);
    if (!raw) return null;
    const processed = this.pixelArt.process(raw, {
      targetWidth: opts.width,
      targetHeight: opts.height,
      skipQuantize: true,
    });
    const det = runDeterministicAssetChecks(processed.buffer, opts.width, opts.height);
    let critiquePassed = det.passed;
    let critiqueScore = det.passed ? 82 : 40;
    let fakeAnimation = false;
    if (opts.animationKind && opts.frameCount && opts.expectedFrameWidth) {
      const critique = critiqueAnimationSheet(processed.buffer, {
        frameCount: opts.frameCount,
        expectedFrameWidth: opts.expectedFrameWidth,
        expectedFrameHeight: opts.height,
        kind: opts.animationKind,
      });
      const identity = critiqueAnimationIdentity(processed.buffer, {
        frameWidth: opts.expectedFrameWidth,
        expectedFrames: opts.frameCount,
        kind: opts.animationKind,
      });
      critiquePassed = det.passed && critique.passed && !identity.fakeAnimation;
      critiqueScore = identity.fakeAnimation ? 20 : critique.score;
      fakeAnimation = identity.fakeAnimation;
    }
    writeCheckpoint(opts.outputDir, opts.path, processed.buffer);
    return withMaturity({
      id: opts.id,
      path: opts.path,
      buffer: processed.buffer,
      provider: AUTHORED_COURIER_PROVIDER,
      fallbackGenerated: false,
      critiquePassed,
      critiqueScore,
      sourceType: 'manual',
      fakeAnimation,
      compiler: 'authored-courier',
      transformation: 'authored-original',
      godotResourcePath: `res://${opts.path}`,
      productionAllowed: true,
      generationTimestamp: new Date().toISOString(),
    });
  }

  private buildWalkSheetAsset(
    id: string,
    spec: SpriteSpec,
    path: string,
    frameCount: number,
    tileSize: number,
    sourcePng?: Buffer,
  ): GeneratedAsset {
    const still = sourcePng
      ? this.compileActorFrame(
          knockoutVfxBackground(sourcePng),
          spec.width,
          spec.height,
          tileSize,
        ).buffer
      : undefined;
    const sheet = generateWalkCycleSheet(spec, frameCount, still);
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * frameCount,
      targetHeight: spec.height,
      tileSize,
      skipQuantize: true,
    });
    const critique = critiqueAnimationSheet(processed.buffer, {
      frameCount,
      expectedFrameWidth: spec.width,
      expectedFrameHeight: spec.height,
      kind: 'walk',
    });
    const identity = critiqueAnimationIdentity(processed.buffer, {
      frameWidth: spec.width,
      expectedFrames: frameCount,
      kind: 'walk',
    });
    return withMaturity({
      id: `${id}_walk`,
      path,
      buffer: processed.buffer,
      provider: sourcePng ? 'pixel-art-processor' : 'procedural',
      fallbackGenerated: !sourcePng,
      critiquePassed: critique.passed && !identity.fakeAnimation,
      critiqueScore: identity.fakeAnimation ? 20 : critique.score,
      fakeAnimation: identity.fakeAnimation,
    });
  }

  /**
   * Genuine multi-frame run-cycle sheet (production standard §20/§22/§25) — a distinct clip from
   * the walk sheet (generateRunCycleSheet, not a relabeled generateWalkCycleSheet call), gated on
   * real frame-quality metrics (§20: uniqueFrameRatio/duplicateFrameRatio/meanSilhouetteDelta) in
   * addition to the existing animation-consistency critique. A sheet that fails the quality bar is
   * still returned (never silently dropped — the pipeline's existing critiquePassed/maturity gate
   * decides what happens to a failing asset) but is honestly marked as such.
   */
  private buildRunSheetAsset(
    id: string,
    spec: SpriteSpec,
    path: string,
    frameCount: number,
    tileSize: number,
    sourcePng?: Buffer,
  ): GeneratedAsset {
    const still = sourcePng
      ? this.compileActorFrame(
          knockoutVfxBackground(sourcePng),
          spec.width,
          spec.height,
          tileSize,
        ).buffer
      : undefined;
    const sheet = generateRunCycleSheet(spec, frameCount, still);
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * frameCount,
      targetHeight: spec.height,
      tileSize,
      skipQuantize: true,
    });
    const critique = critiqueAnimationSheet(processed.buffer, {
      frameCount,
      expectedFrameWidth: spec.width,
      expectedFrameHeight: spec.height,
      kind: 'run',
    });
    const identity = critiqueAnimationIdentity(processed.buffer, {
      frameWidth: spec.width,
      expectedFrames: frameCount,
      kind: 'run',
    });
    let frameQuality: FrameQualityMetrics | undefined;
    let frameQualityPassed = true;
    try {
      const decoded = decodePngRgba(processed.buffer);
      frameQuality = computeFrameQualityMetrics(decoded.rgba, spec.width, spec.height, frameCount);
      // Thresholds from the production standard (§20): uniqueFrameRatio >= 0.80 and
      // duplicateFrameRatio <= 0.20 are the same threshold stated two ways — checking both here
      // guards against a future edit accidentally decoupling them. meanSilhouetteDelta > 0 rules
      // out a "technically distinct bytes, visually static" strip (e.g. a 1px color-only wobble).
      frameQualityPassed =
        frameQuality.uniqueFrameRatio >= 0.8 &&
        frameQuality.duplicateFrameRatio <= 0.2 &&
        frameQuality.meanSilhouetteDelta > 0;
    } catch {
      frameQualityPassed = false;
    }
    return withMaturity({
      id: `${id}_run`,
      path,
      buffer: processed.buffer,
      provider: sourcePng ? 'pixel-art-processor' : 'procedural',
      fallbackGenerated: !sourcePng,
      critiquePassed: critique.passed && !identity.fakeAnimation && frameQualityPassed,
      critiqueScore: identity.fakeAnimation || !frameQualityPassed ? 20 : critique.score,
      fakeAnimation: identity.fakeAnimation,
      frameQuality,
    });
  }

  /**
   * Shared generator family for every locomotion/transition state that isn't a bespoke
   * walk/run/attack/hurt/death cycle (idle, jump_start, jump, fall, land, dash, wall_slide,
   * wall_jump, swim) — animates the reference frame toward (and, for looping states, back from)
   * that state's POSE_TRANSFORMS target via generateProgressionSheet, gated on the same
   * frame-quality metrics as the run cycle but against the per-clip minUniqueFrameRatio from
   * PLAYER_ANIMATION_SPEC instead of one hardcoded 0.8 threshold (a static pose-derived clip has
   * a lower achievable ceiling than a full walk/run cycle).
   */
  private buildProgressionSheetAsset(
    id: string,
    def: PlayerAnimationDefinition,
    spec: SpriteSpec,
    path: string,
    tileSize: number,
    sourcePng?: Buffer,
  ): GeneratedAsset {
    const still = sourcePng
      ? this.compileActorFrame(
          knockoutVfxBackground(sourcePng),
          spec.width,
          spec.height,
          tileSize,
        ).buffer
      : undefined;
    const sheet = generateProgressionSheet(spec, def.poseKey ?? def.name, def.frameCount, still, {
      mode: def.mode === 'progression-oscillate' ? 'oscillate' : 'ramp',
      tintPulse: def.poseKey === 'boss_idle' ? 16 : def.poseKey === 'boss_telegraph' ? 22 : def.name === 'idle' ? 6 : undefined,
    });
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * def.frameCount,
      targetHeight: spec.height,
      tileSize,
      skipQuantize: true,
    });
    const critique = critiqueAnimationSheet(processed.buffer, {
      frameCount: def.frameCount,
      expectedFrameWidth: spec.width,
      expectedFrameHeight: spec.height,
      kind: def.name as AnimationKind,
    });
    let frameQuality: FrameQualityMetrics | undefined;
    let frameQualityPassed = true;
    try {
      const decoded = decodePngRgba(processed.buffer);
      frameQuality = computeFrameQualityMetrics(decoded.rgba, spec.width, spec.height, def.frameCount);
      frameQualityPassed =
        frameQuality.uniqueFrameRatio >= def.minUniqueFrameRatio &&
        !frameQuality.chaoticMotion &&
        frameQuality.alphaBoundsConsistency >= 0.6;
    } catch {
      frameQualityPassed = false;
    }
    return withMaturity({
      id: `${id}_${def.name}`,
      path,
      buffer: processed.buffer,
      provider: sourcePng ? 'pixel-art-processor' : 'procedural',
      fallbackGenerated: !sourcePng,
      critiquePassed: critique.passed && frameQualityPassed,
      critiqueScore: frameQualityPassed ? critique.score : 20,
      frameQuality,
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
    const still = sourcePng
      ? this.compileActorFrame(
          knockoutVfxBackground(sourcePng),
          spec.width,
          spec.height,
          tileSize,
        ).buffer
      : undefined;
    const sheet = generateHurtFlashSheet(spec, frameCount, still);
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * frameCount,
      targetHeight: spec.height,
      tileSize,
      skipQuantize: true,
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
    const still = sourcePng
      ? this.compileActorFrame(
          knockoutVfxBackground(sourcePng),
          spec.width,
          spec.height,
          tileSize,
        ).buffer
      : undefined;
    const sheet = generateDeathSheet(spec, frameCount, still);
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * frameCount,
      targetHeight: spec.height,
      tileSize,
      skipQuantize: true,
      // generateDeathSheet fades to 45% alpha on the final frame on purpose (never fully
      // invisible) — the default alpha-cleanup binarizes at a 128 threshold, which rounds
      // that faded frame down to fully transparent, wiping the whole frame to nothing.
      preserveAlphaGradient: true,
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
    arcKind: AttackArcKind = 'horizontal',
    animName: 'attack' | 'attack_2' | 'attack_3' = 'attack',
  ): GeneratedAsset {
    const still = sourcePng
      ? this.compileActorFrame(
          knockoutVfxBackground(sourcePng),
          spec.width,
          spec.height,
          tileSize,
        ).buffer
      : undefined;
    const sheet = generateAttackSheet(spec, frameCount, still, arcKind);
    const processed = this.pixelArt.process(sheet, {
      targetWidth: spec.width * frameCount,
      targetHeight: spec.height,
      tileSize,
      skipQuantize: true,
    });
    const critique = critiqueAnimationSheet(processed.buffer, {
      frameCount,
      expectedFrameWidth: spec.width,
      expectedFrameHeight: spec.height,
      kind: animName,
    });
    return withMaturity({
      id: `${id}_${animName}`,
      path,
      buffer: processed.buffer,
      provider: sourcePng ? 'pixel-art-processor' : 'procedural',
      fallbackGenerated: !sourcePng,
      critiquePassed: critique.passed,
      critiqueScore: critique.score,
    });
  }

  /**
   * One real image-generation round-trip per *prop family* (e.g. "lantern"), reused across
   * every instance of that family placed in a biome — not one call per individual prop.
   * A prop family typically repeats 2-3x within a kit (`generateEnvironmentKit` cycles a
   * ~4-name motif pool), so this keeps the AI-attempt count proportional to distinct art,
   * matching how a real asset kit would ship: the same lantern sprite reused wherever a
   * lantern is placed, not an independent render per placement.
   *
   * `imageGen` is expected to already be `null` when the caller has decided not to attempt
   * AI for this family (budget exhausted or non-VISUAL_VERTICAL_SLICE profile) — this method
   * always falls back gracefully to `generatePropSprite` (the prop-shaped procedural
   * generator, not the generic character/icon procedural fallback `generateSprite` uses).
   */
  private async generatePropFamilyAsset(opts: {
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
    /** Optional biome material dressing (see PROP_SUPPORTED_FEATURES) for the procedural fallback
     *  — see generatePropSprite's own doc comment. Omitted -> unchanged existing behavior. */
    features?: readonly string[];
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

    let buffer = generatePropSprite({
      width: opts.width,
      height: opts.height,
      fill: opts.fill,
      accent: opts.accent,
      family: opts.family,
      seed: opts.seed,
      features: opts.features,
    });
    let provider = 'procedural';
    let fallback = true;
    let modelId: string | undefined;
    let fallbackErrorMessage: string | undefined;

    if (opts.imageGen) {
      try {
        throwIfCancelled(opts.signal);
        const result = await opts.imageGen.generateImage({
          profile: 'ICON',
          prompt: sanitizeImagePromptText(opts.prompt),
          negativePrompt: opts.negativePrompt ? sanitizeImagePromptText(opts.negativePrompt) : undefined,
          width: opts.width * 4,
          height: opts.height * 4,
          seed: opts.seed,
          signal: opts.signal,
        });
        buffer = result.image;
        provider = result.provider;
        modelId = result.modelId;
        fallback = false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Same diagnosability fix as the character/VFX paths (d72869f/e1681b9): keep the
        // real error instead of silently falling back with no trace of why.
        fallbackErrorMessage = `${opts.imageGen.id}: ${msg}`;
      }
    }

    let sourcePath: string | undefined;
    if (!fallback) {
      sourcePath = derivedSourceRelPath(opts.path);
      writeCheckpoint(opts.outputDir, sourcePath, buffer);
    }

    const compiled = fallback
      ? buffer
      : this.pixelArt.process(knockoutVfxBackground(buffer), {
          targetWidth: opts.width,
          targetHeight: opts.height,
          tileSize: Math.min(8, opts.width),
          alphaThreshold: 32,
          skipQuantize: true,
          fitOpaque: true,
        }).buffer;

    const det = runDeterministicAssetChecks(compiled, opts.width, opts.height);
    writeCheckpoint(opts.outputDir, opts.path, compiled);

    return withMaturity({
      id: opts.id,
      path: opts.path,
      buffer: compiled,
      provider,
      modelId,
      fallbackGenerated: fallback,
      critiquePassed: det.passed,
      critiqueScore: det.passed ? 80 : 40,
      sourceType: fallback ? undefined : 'compiled',
      sourcePath,
      fallbackDepth: fallback ? 1 : 0,
      fallbackReason: fallback
        ? (fallbackErrorMessage ??
            (opts.imageGen
              ? 'Image provider unavailable or failed — procedural placeholder'
              : 'AI prop generation not attempted for this profile/budget — procedural placeholder'))
        : undefined,
      selectedProvider: provider,
      selectedModel: modelId,
      requestedCapability: 'IMAGE_GENERATION',
      productionAllowed: !fallback,
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
    let fallbackErrorMessage: string | undefined;

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
        const msg = err instanceof Error ? err.message : String(err);
        if (!allowProceduralFallback) {
          throw new Error(`VFX image generation failed (${opts.imageGen.id}): ${msg}`);
        }
        fallbackErrorMessage = `${opts.imageGen.id}: ${msg}`;
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
      : knockoutVfxBackground(
          this.pixelArt.process(buffer, {
            targetWidth: size,
            targetHeight: size,
            tileSize: Math.min(8, size),
            alphaThreshold: 32,
            skipQuantize: true,
          }).buffer,
        );
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
      fallbackReason: fallback
        ? (fallbackErrorMessage ?? 'Image provider unavailable or failed — procedural placeholder')
        : undefined,
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
    /** Foundry capability taxonomy type for this asset, when known — drives Foundry request
     *  construction and is otherwise unused. Falls back to a profile-derived guess. */
    foundryAssetType?: FoundryAssetType;
    /** Migration seam (AssetFoundry production integration): when omitted, defaults to a
     *  LegacyAssetGenerationGateway wrapping opts.imageGen — behaviorally identical to the
     *  pre-migration inline call. Only explicitly-migrated call sites pass a real gateway. */
    gateway?: AssetGenerationGateway;
    /** Routing policy — only consulted for the canonical Foundry request (the legacy gateway
     *  already had its provider chosen upstream via registry.selectHealthy({mode}), so this has
     *  no effect there). Without this, FREE_ONLY/LOCAL_ONLY/COMMERCIAL_SAFE would silently never
     *  reach Foundry routing for a migrated call site. */
    mode?: GenerationMode;
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
    let fallbackErrorMessage: string | undefined;
    let foundryQaPassed: boolean | undefined;
    let foundryQaScore: number | undefined;
    let foundryLicense: { commercialUse: boolean; status: string; reason: string } | undefined;
    // Recorded whether generation succeeded or fell back to procedural — proves *which gateway
    // was actually consulted* even in an offline/no-credentials environment where every real
    // attempt ends in a procedural fallback. This is what the production-slice regression test
    // asserts on: it would read 'legacy' if the pipeline ever silently reverted to the pre-
    // migration resolver for a call site that explicitly passed a Foundry gateway.
    let gatewayBackendAttempted: 'legacy' | 'foundry' | undefined;

    // Every raw-generation attempt goes through an AssetGenerationGateway — never a fork between
    // "inline legacy call" and "gateway call". When opts.gateway is omitted (every call site not
    // explicitly migrated to Foundry), this wraps opts.imageGen exactly as the inline call used
    // to, so behavior is provably unchanged for every unmigrated category.
    const gateway = opts.gateway ?? new LegacyAssetGenerationGateway(opts.imageGen);
    if (opts.imageGen || opts.gateway) {
      throwIfCancelled(opts.signal);
      gatewayBackendAttempted = gateway.backend;
      const outcome = await gateway.generate({
        id: opts.id,
        assetType: opts.foundryAssetType ?? foundryAssetTypeForProfile(opts.profile),
        path: opts.path,
        prompt: opts.prompt,
        negativePrompt: opts.negativePrompt,
        width: opts.spec.width,
        height: opts.spec.height,
        seed: opts.seed,
        visualStyle: opts.artDirection,
        pixelArt: true,
        transparentBackground: true,
        commercialUseRequired: opts.mode === 'COMMERCIAL_SAFE',
        freeOnly: opts.mode === 'FREE_ONLY',
        localOnly: opts.mode === 'LOCAL_ONLY' || opts.mode === 'OFFLINE',
        signal: opts.signal,
        conditioning: opts.conditioning,
      });
      if (outcome.ok) {
        buffer = outcome.buffer;
        provider = outcome.provider;
        modelId = outcome.modelId;
        fallback = false;
        if (outcome.backend === 'foundry') {
          foundryQaPassed = outcome.qaPassed;
          foundryQaScore = outcome.qaScore;
          foundryLicense = outcome.license;
        }
      } else {
        if (!allowProceduralFallback) {
          throw new Error(
            `Manual image generation failed (${provider === 'procedural' ? gateway.backend : provider}): ${outcome.message}`,
          );
        }
        // keep procedural, but preserve *why* so the manifest can be diagnosed later —
        // previously this catch discarded the real error entirely, leaving every fallback
        // asset (player/boss/enemy included) with an identical generic reason no matter
        // whether the cause was a rate limit, a content-policy rejection, a timeout, or a
        // malformed request.
        fallbackErrorMessage = `${gateway.backend} (${outcome.failureClass}): ${outcome.message}`;
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
    const processed = this.compileActorFrame(
      spriteSource,
      opts.spec.width,
      opts.spec.height,
      opts.tileSize,
    );

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
      sourceType: fallback ? undefined : 'compiled',
      sourcePath,
      fallbackDepth: fallback ? 1 : 0,
      fallbackReason: fallback
        ? (fallbackErrorMessage ?? 'Image provider unavailable or failed — procedural placeholder')
        : undefined,
      selectedProvider: provider,
      selectedModel: modelId,
      requestedCapability: 'IMAGE_GENERATION',
      productionAllowed: !fallback,
      promptHash: hashPrompt(opts.prompt),
      requestedProvider: opts.imageGen?.id,
      requestedModel: undefined,
      generationTimestamp: new Date().toISOString(),
      generationBackend: gatewayBackendAttempted,
      foundryQaPassed,
      foundryQaScore,
      foundryLicense,
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

    const processed = this.compileActorFrame(
      knockoutVfxBackground(opts.sourcePng),
      opts.targetWidth,
      opts.targetHeight,
      opts.tileSize,
    );
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
    pollinationsBaseUrl?: string;
    pollinationsModel?: string;
    pollinationsApiKey?: string;
    enablePollinations?: boolean;
    ollamaBaseUrl?: string;
    providerEnabled?: Record<string, boolean>;
  }): Promise<GeneratedAsset> {
    const tileSize = opts.gameDna.technical.tileSize;
    const negativePrompt = applyStyleNegativePrompt(
      opts.styleBible,
      opts.artBible?.negativePrompts.join(', '),
    );
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
      pollinationsBaseUrl: opts.pollinationsBaseUrl,
      pollinationsModel: opts.pollinationsModel,
      pollinationsApiKey: opts.pollinationsApiKey,
      enablePollinations: opts.enablePollinations,
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
        frame = compiledSpriteFrameSize(
          opts.assetId === 'boss_final' || opts.assetId.includes('final') ? 'boss_final' : 'boss',
        );
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
    const prompt = applyStylePrompt(
      opts.styleBible,
      opts.assetType === 'tileset' || opts.assetType === 'tile'
        ? 'TILE_SOURCE'
        : opts.assetType === 'background'
          ? 'BACKGROUND'
          : opts.assetType === 'ui_icon' || opts.assetType === 'ui_panel' || opts.assetType === 'portrait'
            ? 'UI'
            : 'CHARACTER',
      buildManualImagePrompt(opts.description, styleHint, opts.gameDna.identity.title),
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
