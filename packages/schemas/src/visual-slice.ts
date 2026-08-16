import { z } from 'zod';

export const ImageTaskKindSchema = z.enum([
  'CONCEPT_IMAGE',
  'REFERENCE_VARIATION',
  'IMAGE_EDIT',
  'SPRITE_SOURCE',
  'TILESET_SOURCE',
  'BACKGROUND_SOURCE',
  'VFX_SOURCE',
]);

export type ImageTaskKind = z.infer<typeof ImageTaskKindSchema>;

export const VisualReviewStatusSchema = z.enum([
  'NOT_APPLICABLE',
  'VISUAL_SLICE_REVIEW_REQUIRED',
  'VISUAL_SLICE_APPROVED',
  'VISUAL_SLICE_REJECTED',
]);

export type VisualReviewStatus = z.infer<typeof VisualReviewStatusSchema>;

export const VisualQualityCriterionSchema = z.enum([
  'artCoherence',
  'playerReadability',
  'environmentCoherence',
  'tilesetQuality',
  'animationQuality',
  'lightingDepth',
  'combatReadability',
  'vfxIntegration',
  'roomComposition',
  'hud',
  'bossPresentation',
  'overallPolish',
]);

export type VisualQualityCriterion = z.infer<typeof VisualQualityCriterionSchema>;

export const VISUAL_QUALITY_CRITERIA: VisualQualityCriterion[] = [
  'artCoherence',
  'playerReadability',
  'environmentCoherence',
  'tilesetQuality',
  'animationQuality',
  'lightingDepth',
  'combatReadability',
  'vfxIntegration',
  'roomComposition',
  'hud',
  'bossPresentation',
  'overallPolish',
];

export const AssetSpecificationSchema = z.object({
  type: z.string(),
  gameplayPurpose: z.string(),
  dimensions: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  orientation: z.enum(['side-view', 'top-down', 'ui', 'orthographic']).default('side-view'),
  perspective: z.string(),
  transparentBackground: z.boolean(),
  pixelSize: z.number().int().positive(),
  palette: z.array(z.string()),
  lighting: z.string(),
  referenceAssetIds: z.array(z.string()).default([]),
  requiredAnimations: z.array(z.string()).default([]),
  GodotDestination: z.string(),
  imageTaskKind: ImageTaskKindSchema.optional(),
});

export type AssetSpecification = z.infer<typeof AssetSpecificationSchema>;

export const CharacterVisualDNASchema = z.object({
  id: z.string(),
  canonicalReferencePath: z.string().optional(),
  silhouette: z.string(),
  bodyProportions: z.string(),
  palette: z.array(z.string()),
  clothing: z.string(),
  equipment: z.string(),
  faceHair: z.string(),
  weapon: z.string(),
  spriteWidth: z.number().int().positive(),
  spriteHeight: z.number().int().positive(),
  orientation: z.string(),
  lighting: z.string(),
  outline: z.string(),
  anchor: z.enum(['feet-center', 'body-center', 'weapon-hand']).default('feet-center'),
  prompt: z.string(),
});

export type CharacterVisualDNA = z.infer<typeof CharacterVisualDNASchema>;

export const ProductionStyleBibleSchema = z.object({
  artStyle: z.string(),
  projection: z.enum(['side-view', 'top-down']),
  targetResolution: z.object({ width: z.number(), height: z.number() }),
  internalRenderResolution: z.object({ width: z.number(), height: z.number() }),
  tileSize: z.number().int().positive(),
  pixelsPerUnit: z.number().positive(),
  playerSpriteWidth: z.number().int().positive(),
  playerSpriteHeight: z.number().int().positive(),
  enemyScaleRange: z.tuple([z.number(), z.number()]),
  bossScaleRange: z.tuple([z.number(), z.number()]),
  palette: z.array(z.object({ name: z.string(), hex: z.string(), usage: z.string() })),
  maximumPaletteSize: z.number().int().positive(),
  outlineRules: z.string(),
  shadingRules: z.string(),
  highlightRules: z.string(),
  lightingDirection: z.string(),
  lightingContrast: z.string(),
  backgroundLayerCount: z.number().int().positive(),
  parallaxRules: z.string(),
  animationFPS: z.number().positive(),
  animationFrameRules: z.string(),
  VFXScaleRules: z.string(),
  UIResolution: z.object({ width: z.number(), height: z.number() }),
  UIStyle: z.string(),
  cameraZoom: z.number().positive(),
  cameraLookAhead: z.number(),
  cameraDeadZone: z.number(),
  pixelFiltering: z.enum(['nearest', 'linear']),
  nearestNeighbor: z.boolean(),
  pixelSnap: z.boolean(),
});

export type ProductionStyleBible = z.infer<typeof ProductionStyleBibleSchema>;

export const TechnicalVisualQaSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
  checks: z.record(z.string(), z.boolean()),
});

export type TechnicalVisualQa = z.infer<typeof TechnicalVisualQaSchema>;

export const VisualReviewStateSchema = z.object({
  status: VisualReviewStatusSchema,
  technicalQa: TechnicalVisualQaSchema.optional(),
  fakeAnimationDetected: z.boolean().default(false),
  aestheticScores: z.record(VisualQualityCriterionSchema, z.number().min(1).max(5)).optional(),
  notes: z.string().optional(),
  updatedAt: z.string(),
});

export type VisualReviewState = z.infer<typeof VisualReviewStateSchema>;
