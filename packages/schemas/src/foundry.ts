import { z } from 'zod';

export const FoundryAssetTypeSchema = z.enum([
  'player',
  'npc',
  'enemy',
  'boss',
  'weapon',
  'armor',
  'item',
  'pickup',
  'tileset',
  'terrain',
  'platform',
  'prop',
  'door',
  'portal',
  'background',
  'parallax',
  'ui',
  'hud',
  'icon',
  'portrait',
  'vfx',
  'texture',
  'material',
  'animation',
  'concept',
  'promotional',
  '3d-model',
  'audio',
  'music',
  'voice',
]);

export type FoundryAssetType = z.infer<typeof FoundryAssetTypeSchema>;

export const FoundryRoutingModeSchema = z.enum([
  'free-only',
  'local-only',
  'offline',
  'balanced',
  'fastest',
  'highest-quality',
  'lowest-cost',
  'nvidia-first',
  'custom',
]);

export type FoundryRoutingMode = z.infer<typeof FoundryRoutingModeSchema>;

export const FoundryCostClassSchema = z.enum(['free', 'credit', 'paid', 'local']);
export type FoundryCostClass = z.infer<typeof FoundryCostClassSchema>;

export const FoundryDimensionSchema = z.enum(['2d', 'hd-2d', '2.5d', '3d']);
export type FoundryDimension = z.infer<typeof FoundryDimensionSchema>;

export const FoundryEngineSchema = z.enum(['godot', 'unity', 'unreal', 'canonical']);
export type FoundryEngine = z.infer<typeof FoundryEngineSchema>;

export const AssetLicenseStatusSchema = z.enum([
  'approved',
  'approved-with-attribution',
  'restricted',
  'unknown',
  'blocked',
]);

export type AssetLicenseStatus = z.infer<typeof AssetLicenseStatusSchema>;

export const AssetRequestSchema = z.object({
  id: z.string(),
  assetType: FoundryAssetTypeSchema,
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  style: z.object({
    visualStyle: z.string(),
    palette: z.array(z.string()).optional(),
    pixelArt: z.boolean().optional(),
    referenceAssetIds: z.array(z.string()).optional(),
    styleReferenceId: z.string().optional(),
    dimension: FoundryDimensionSchema.optional(),
  }),
  dimensions: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
  animation: z
    .object({
      required: z.boolean(),
      states: z.array(z.string()).optional(),
      framesPerState: z.number().int().positive().optional(),
      fps: z.number().positive().optional(),
    })
    .optional(),
  output: z.object({
    engine: FoundryEngineSchema.default('godot'),
    format: z.string().optional(),
    transparentBackground: z.boolean().optional(),
    tileSize: z.number().int().positive().optional(),
  }),
  constraints: z.object({
    commercialUseRequired: z.boolean(),
    freeOnly: z.boolean(),
    localOnly: z.boolean().optional(),
    maxCost: z.number().optional(),
    maxLatencyMs: z.number().int().positive().optional(),
  }),
  consistency: z.object({
    characterConsistency: z.boolean().optional(),
    worldConsistency: z.boolean().optional(),
    referenceStrength: z.number().min(0).max(1).optional(),
    identityId: z.string().optional(),
  }),
  /** Prefer Kenney/OpenGameArt retrieval before generation. Default inferred from assetType. */
  preferRetrieved: z.boolean().optional(),
  seed: z.number().int().optional(),
  specification: z
    .object({
      type: z.string(),
      gameplayPurpose: z.string(),
      dimensions: z
        .object({
          width: z.number().int().positive(),
          height: z.number().int().positive(),
        })
        .optional(),
      orientation: z.string().optional(),
      perspective: z.string().optional(),
      transparentBackground: z.boolean().optional(),
      pixelSize: z.number().int().positive().optional(),
      palette: z.array(z.string()).optional(),
      lighting: z.string().optional(),
      referenceAssetIds: z.array(z.string()).optional(),
      requiredAnimations: z.array(z.string()).optional(),
      GodotDestination: z.string().optional(),
      imageTaskKind: z.string().optional(),
    })
    .optional(),
  routingMode: FoundryRoutingModeSchema.optional(),
  maxRetries: z.number().int().min(0).max(8).optional(),
});

export type AssetRequest = z.infer<typeof AssetRequestSchema>;

export const CharacterIdentitySchema = z.object({
  id: z.string(),
  visualDescription: z.string(),
  silhouette: z.string().optional(),
  proportions: z.string().optional(),
  palette: z.array(z.string()).optional(),
  costume: z.string().optional(),
  weapon: z.string().optional(),
  face: z.string().optional(),
  hair: z.string().optional(),
  accessories: z.array(z.string()).optional(),
  referenceAssetIds: z.array(z.string()).optional(),
  seed: z.number().int().optional(),
});

export type CharacterIdentity = z.infer<typeof CharacterIdentitySchema>;

export const AssetProvenanceSchema = z.object({
  assetId: z.string(),
  sourceType: z.enum(['generated', 'retrieved', 'procedural', 'compiled']),
  provider: z.string(),
  model: z.string().optional(),
  generationTimestamp: z.string(),
  promptHash: z.string(),
  license: z.string(),
  commercialUse: z.boolean(),
  licenseStatus: AssetLicenseStatusSchema,
  originalUrl: z.string().optional(),
  creator: z.string().optional(),
  attribution: z.string().optional(),
  modified: z.boolean().optional(),
  transformations: z.array(z.string()),
  qaScore: z.number().min(0).max(1).optional(),
  cacheHit: z.boolean().optional(),
});

export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>;
