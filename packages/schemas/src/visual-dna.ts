import { z } from 'zod';

export const VISUAL_DNA_VERSION = 1 as const;

export const AnimationGenerationTierSchema = z.enum([
  'PROCEDURAL_FALLBACK',
  'DETERMINISTIC_DERIVED',
  'AI_KEYFRAME_ASSISTED',
  'AI_IDENTITY_PRESERVED',
  'HUMAN_APPROVED',
]);

export type AnimationGenerationTier = z.infer<typeof AnimationGenerationTierSchema>;

export const VisualDefectSchema = z.enum([
  'PLAYER_TOO_SMALL',
  'PLAYER_LOW_CONTRAST',
  'TILE_REPETITION_HIGH',
  'BACKGROUND_TOO_FLAT',
  'PARALLAX_LAYERS_TOO_SIMILAR',
  'PROP_DENSITY_LOW',
  'LIGHTING_TOO_DARK',
  'UI_LOW_CONTRAST',
  'ENEMY_SILHOUETTE_WEAK',
  'PALETTE_INCOHERENT',
  'ASSET_STYLE_MISMATCH',
  'WALLPAPER_CAPTURE',
  'MATERIAL_LANGUAGE_MISMATCH',
]);

export type VisualDefect = z.infer<typeof VisualDefectSchema>;

export const AutomatedVisualVerdictSchema = z.enum([
  'AUTOMATED_VISUAL_FAIL',
  'AUTOMATED_VISUAL_PASS_HUMAN_REVIEW_REQUIRED',
  'HUMAN_APPROVED',
  'HUMAN_REJECTED',
]);

export type AutomatedVisualVerdict = z.infer<typeof AutomatedVisualVerdictSchema>;

export const VisualCategorySchema = z.enum([
  'player',
  'npc',
  'enemy',
  'boss',
  'tileset',
  'terrain',
  'prop',
  'decoration',
  'foreground',
  'background',
  'parallax',
  'ui',
  'hud',
  'icon',
  'portrait',
  'vfx',
  'lighting',
  'ambient',
]);

export type VisualCategory = z.infer<typeof VisualCategorySchema>;

export const PaletteRolesSchema = z.object({
  global: z.array(z.string()),
  shadows: z.array(z.string()),
  highlights: z.array(z.string()),
  accents: z.array(z.string()),
  ui: z.array(z.string()),
});

export type PaletteRoles = z.infer<typeof PaletteRolesSchema>;

export const LightingLanguageSchema = z.object({
  key: z.string(),
  fill: z.string(),
  ambient: z.string(),
  accent: z.string(),
  direction: z.string(),
  contrast: z.string(),
  sources: z.array(z.string()),
  fogColor: z.string().optional(),
  fogAlpha: z.number().min(0).max(1).optional(),
});

export type LightingLanguage = z.infer<typeof LightingLanguageSchema>;

export const MaterialLanguageSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.enum(['masonry', 'metal', 'organic', 'glass', 'water', 'fabric', 'energy', 'debris']),
  albedo: z.string(),
  roughness: z.string(),
  edgeTreatment: z.string(),
  forbidden: z.array(z.string()).default([]),
});

export type MaterialLanguage = z.infer<typeof MaterialLanguageSchema>;

export const ArchitectureLanguageSchema = z.object({
  silhouette: z.string(),
  motifs: z.array(z.string()),
  scale: z.string(),
  openings: z.string(),
  ruinLevel: z.enum(['intact', 'weathered', 'collapsed', 'overgrown']),
});

export type ArchitectureLanguage = z.infer<typeof ArchitectureLanguageSchema>;

export const CharacterVisualLanguageSchema = z.object({
  silhouette: z.string(),
  proportions: z.string(),
  clothing: z.string(),
  hair: z.string(),
  weapon: z.string(),
  distinctiveFeatures: z.array(z.string()),
  outline: z.string(),
  readAtGameScale: z.string(),
});

export type CharacterVisualLanguage = z.infer<typeof CharacterVisualLanguageSchema>;

export const CompositionRulesSchema = z.object({
  focalHierarchy: z.array(z.string()),
  foregroundCoverage: z.number().min(0).max(1),
  emptySpaceMax: z.number().min(0).max(1),
  playerScreenHeightMin: z.number().min(0).max(1),
  contrastAgainstBackground: z.string(),
});

export type CompositionRules = z.infer<typeof CompositionRulesSchema>;

export const ParallaxMotionSchema = z.object({
  far: z.number(),
  mid: z.number(),
  near: z.number(),
});

export type ParallaxMotion = z.infer<typeof ParallaxMotionSchema>;

export const UiVisualLanguageSchema = z.object({
  frameStyle: z.string(),
  meterStyle: z.string(),
  iconStyle: z.string(),
  panelStyle: z.string(),
  fontHint: z.string(),
  cornerRadiusPx: z.number().int().nonnegative(),
  borderPx: z.number().int().positive(),
});

export type UiVisualLanguage = z.infer<typeof UiVisualLanguageSchema>;

export const VfxVisualLanguageSchema = z.object({
  hit: z.string(),
  dash: z.string(),
  landing: z.string(),
  pickup: z.string(),
  ability: z.string(),
  scale: z.string(),
});

export type VfxVisualLanguage = z.infer<typeof VfxVisualLanguageSchema>;

export const ArtStyleDefinitionSchema = z.object({
  id: z.string(),
  label: z.string(),
  renderingFamily: z.enum([
    'modern-pixel',
    'hand-painted',
    'illustrated',
    'gothic',
    'painterly',
    'cel-shaded',
  ]),
  edgeTreatment: z.string(),
  shadingSteps: z.number().int().positive(),
  textureDensity: z.enum(['sparse', 'medium', 'dense']),
});

export type ArtStyleDefinition = z.infer<typeof ArtStyleDefinitionSchema>;

export const VisualDNASchema = z.object({
  version: z.literal(VISUAL_DNA_VERSION),
  gameId: z.string().optional(),
  styleFingerprint: z.string(),
  artStyle: ArtStyleDefinitionSchema,
  renderingStyle: z.string(),
  resolution: z.object({
    referenceWidth: z.number().int().positive(),
    referenceHeight: z.number().int().positive(),
    basePixelsPerUnit: z.number().positive().optional(),
    spriteScale: z.number().positive(),
    tileSize: z.number().int().positive(),
  }),
  palette: PaletteRolesSchema,
  lighting: LightingLanguageSchema,
  materials: z.array(MaterialLanguageSchema),
  architecture: ArchitectureLanguageSchema,
  characters: CharacterVisualLanguageSchema,
  enemies: CharacterVisualLanguageSchema,
  bosses: CharacterVisualLanguageSchema,
  environments: z.object({
    terrainRead: z.string(),
    propScale: z.string(),
    density: z.string(),
  }),
  backgrounds: z.object({
    far: z.string(),
    mid: z.string(),
    near: z.string(),
    motion: ParallaxMotionSchema,
  }),
  props: z.object({
    families: z.array(z.string()),
    storytellingBias: z.string(),
  }),
  vfx: VfxVisualLanguageSchema,
  ui: UiVisualLanguageSchema,
  composition: CompositionRulesSchema,
  forbiddenPatterns: z.array(z.string()),
  promptAnchors: z.array(z.string()),
  seed: z.number().int(),
});

export type VisualDNA = z.infer<typeof VisualDNASchema>;

export const BiomeVisualDNASchema = z.object({
  biomeId: z.string(),
  displayName: z.string(),
  styleFingerprint: z.string(),
  parentFingerprint: z.string(),
  paletteOverrides: PaletteRolesSchema,
  architecture: ArchitectureLanguageSchema,
  terrainMaterials: z.array(MaterialLanguageSchema),
  organicMaterials: z.array(MaterialLanguageSchema),
  atmosphere: z.string(),
  lighting: LightingLanguageSchema,
  fog: z.object({
    color: z.string(),
    alpha: z.number().min(0).max(1),
  }),
  foregroundLanguage: z.array(z.string()),
  midgroundLanguage: z.array(z.string()),
  backgroundLanguage: z.array(z.string()),
  propFamilies: z.array(z.string()),
  architecturalFamilies: z.array(z.string()),
  ambientVfx: z.enum([
    'none',
    'ash',
    'dust',
    'rain',
    'snow',
    'spores',
    'leaves',
    'embers',
    'insects',
    'mist',
    'underwater',
  ]),
  forbiddenPatterns: z.array(z.string()),
  promptAnchors: z.array(z.string()),
});

export type BiomeVisualDNA = z.infer<typeof BiomeVisualDNASchema>;

export const VisualPromptCompileResultSchema = z.object({
  prompt: z.string(),
  negativePrompt: z.string(),
  promptHash: z.string(),
  negativePromptHash: z.string(),
  seed: z.number().int(),
  styleFingerprint: z.string(),
  compiler: z.literal('VisualPromptCompiler'),
  compilerVersion: z.number().int(),
  technicalConstraints: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    transparentBackground: z.boolean(),
    tileSize: z.number().int().positive().optional(),
    pixelArt: z.boolean(),
  }),
  category: VisualCategorySchema,
  variantSeed: z.number().int(),
});

export type VisualPromptCompileResult = z.infer<typeof VisualPromptCompileResultSchema>;

export const VisualQualityScoreSchema = z.object({
  characterReadability: z.number().min(0).max(100),
  enemyReadability: z.number().min(0).max(100),
  silhouetteQuality: z.number().min(0).max(100),
  paletteHarmony: z.number().min(0).max(100),
  paletteSeparation: z.number().min(0).max(100),
  materialConsistency: z.number().min(0).max(100),
  architectureConsistency: z.number().min(0).max(100),
  backgroundDepth: z.number().min(0).max(100),
  parallaxReadability: z.number().min(0).max(100),
  lightingQuality: z.number().min(0).max(100),
  environmentCoherence: z.number().min(0).max(100),
  propDensity: z.number().min(0).max(100),
  tileRepetition: z.number().min(0).max(100),
  composition: z.number().min(0).max(100),
  focalHierarchy: z.number().min(0).max(100),
  hudReadability: z.number().min(0).max(100),
  vfxReadability: z.number().min(0).max(100),
  assetStyleConsistency: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
});

export type VisualQualityScore = z.infer<typeof VisualQualityScoreSchema>;

export const EnvironmentKitScaleSchema = z.object({
  terrainFamilies: z.number().int().nonnegative(),
  architecturalElements: z.number().int().nonnegative(),
  environmentProps: z.number().int().nonnegative(),
  decorativeProps: z.number().int().nonnegative(),
  foregroundElements: z.number().int().nonnegative(),
  midgroundElements: z.number().int().nonnegative(),
  backgroundMotifs: z.number().int().nonnegative(),
  lightingElements: z.number().int().nonnegative(),
  ambientVfx: z.number().int().nonnegative(),
});

export type EnvironmentKitScale = z.infer<typeof EnvironmentKitScaleSchema>;

export const EnvironmentKitItemSchema = z.object({
  id: z.string(),
  family: z.string(),
  role: z.string(),
  description: z.string(),
  placement: z.enum(['floor', 'wall', 'ceiling', 'air', 'foreground', 'midground', 'background']),
  rarity: z.enum(['common', 'uncommon', 'rare']),
  weight: z.number().positive(),
});

export type EnvironmentKitItem = z.infer<typeof EnvironmentKitItemSchema>;

export const EnvironmentKitSchema = z.object({
  biomeId: z.string(),
  styleFingerprint: z.string(),
  scale: EnvironmentKitScaleSchema,
  terrain: z.array(EnvironmentKitItemSchema),
  architecture: z.array(EnvironmentKitItemSchema),
  props: z.array(EnvironmentKitItemSchema),
  decorations: z.array(EnvironmentKitItemSchema),
  interactables: z.array(EnvironmentKitItemSchema),
  foreground: z.array(EnvironmentKitItemSchema),
  midground: z.array(EnvironmentKitItemSchema),
  backgrounds: z.array(EnvironmentKitItemSchema),
  lighting: z.array(EnvironmentKitItemSchema),
  ambientVfx: z.array(EnvironmentKitItemSchema),
});

export type EnvironmentKit = z.infer<typeof EnvironmentKitSchema>;

export const StorytellingDirectiveSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  biomeId: z.string(),
  archetype: z.string(),
  title: z.string(),
  description: z.string(),
  propIds: z.array(z.string()),
  placements: z.array(
    z.object({
      propId: z.string(),
      xNorm: z.number().min(0).max(1),
      yNorm: z.number().min(0).max(1),
      scale: z.number().positive(),
      zIndex: z.number().int(),
    }),
  ),
});

export type StorytellingDirective = z.infer<typeof StorytellingDirectiveSchema>;

export const CharacterIdentityPackSchema = z.object({
  id: z.string(),
  role: z.enum(['player', 'npc', 'enemy', 'boss']),
  silhouette: z.string(),
  bodyProportions: z.string(),
  clothing: z.string(),
  hair: z.string(),
  weapon: z.string(),
  primaryColors: z.array(z.string()),
  accentColors: z.array(z.string()),
  distinctiveFeatures: z.array(z.string()),
  animationTier: AnimationGenerationTierSchema,
  styleFingerprint: z.string(),
  sourcePath: z.string(),
  referenceFrontPath: z.string().optional(),
  silhouettePath: z.string().optional(),
  posePaths: z.record(z.string(), z.string()).default({}),
});

export type CharacterIdentityPack = z.infer<typeof CharacterIdentityPackSchema>;

export const VisualArtifactProvenanceSchema = z.object({
  artifactId: z.string(),
  projectId: z.string().optional(),
  capability: z.string().optional(),
  assetType: z.string(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  modelVersion: z.string().nullable().optional(),
  prompt: z.string().optional(),
  promptHash: z.string().nullable().optional(),
  negativePromptHash: z.string().nullable().optional(),
  seed: z.number().nullable().optional(),
  parentArtifactIds: z.array(z.string()).optional(),
  styleFingerprint: z.string().optional(),
  compiler: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  commercialUse: z.enum(['allowed', 'restricted', 'unknown']).optional(),
  critiqueScore: z.number().optional(),
  critiquePassed: z.boolean().optional(),
  maturity: z.string().optional(),
  repairCount: z.number().int().nonnegative().optional(),
  sourcePath: z.string().optional(),
  godotResPath: z.string().optional(),
  generationTimestamp: z.string().optional(),
  requestedProvider: z.string().optional(),
  requestedModel: z.string().optional(),
  selectedProvider: z.string().optional(),
  selectedModel: z.string().optional(),
  fallbackDepth: z.number().int().nonnegative().optional(),
  fallbackReason: z.string().optional(),
  sourceType: z.string().optional(),
  productionReady: z.boolean().optional(),
});

export type VisualArtifactProvenance = z.infer<typeof VisualArtifactProvenanceSchema>;

export const ImageProviderCapabilitySchema = z.object({
  supportsReferenceImage: z.boolean(),
  supportsCustomReferenceImage: z.boolean(),
  supportsPoseControl: z.boolean(),
  supportsTransparency: z.boolean(),
  supportsImageEditing: z.boolean(),
  supportsCharacterConsistency: z.boolean(),
  supportsPixelArt: z.boolean(),
  supportsSeed: z.boolean(),
  supportsNegativePrompt: z.boolean(),
  maxReferenceImages: z.number().int().nonnegative(),
});

export type ImageProviderCapability = z.infer<typeof ImageProviderCapabilitySchema>;
