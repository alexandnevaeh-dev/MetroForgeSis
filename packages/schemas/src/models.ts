import { z } from 'zod';

export const ModelModalitySchema = z.enum([
  'text',
  'vision',
  'image',
  'video',
  'audio',
  'speech',
  'embedding',
  'reranker',
  'segmentation',
  'depth',
  'upscale',
  '3d',
  'multimodal',
]);

export const CommercialUseSchema = z.enum(['allowed', 'restricted', 'unknown']);

/** Richer, per-model license detail beyond the coarse `commercialUse`/`license` fields —
 *  entirely optional, since most catalog entries only have `license`/`commercialUse` actually
 *  verified today. Populate a field only when it's genuinely been confirmed for that model;
 *  LicenseRouter (packages/ai/src/license-router.ts) degrades honestly to a less specific
 *  classification (or UNKNOWN) when this is absent rather than assuming a default. */
export const LicenseDetailSchema = z.object({
  licenseId: z.string().optional(),
  licenseUrl: z.string().optional(),
  /** Free-text description of a revenue/usage threshold beyond which the license requires a
   *  separate commercial agreement (e.g. "free under $1M annual revenue") — a string because
   *  real license revenue clauses aren't expressible as a single number/currency uniformly. */
  revenueLimit: z.string().optional(),
  attributionRequired: z.boolean().optional(),
  distributionRestrictions: z.string().optional(),
  weightsRedistributable: z.boolean().optional(),
  outputRestrictions: z.string().optional(),
  /** ISO date this license detail was last manually verified against the model's real terms —
   *  license terms change; a stale verifiedDate is a signal to re-check, not itself enforced. */
  verifiedDate: z.string().optional(),
});

export type LicenseDetail = z.infer<typeof LicenseDetailSchema>;

export const ModelHealthSchema = z.enum(['healthy', 'degraded', 'unavailable', 'unknown']);

export const CapabilityScoreKeySchema = z.enum([
  'REASONING',
  'CODE',
  'GDSCRIPT',
  'NARRATIVE',
  'WORLD_DESIGN',
  'JSON',
  'VISION',
  'IMAGE',
  'PIXEL_ART',
  'TEXTURE',
  'ANIMATION',
  'AUDIO',
  'MUSIC',
  'SPEECH',
  'EMBEDDING',
  'QA',
]);

export const ModelCapabilitySchema = z.enum([
  // Text / reasoning
  'TEXT_GENERATION',
  'REASONING',
  'NARRATIVE',
  'JSON_GENERATION',
  'WORLD_DESIGN',
  'QA_REASONING',
  // Coding
  'CODE_GENERATION',
  'GDSCRIPT',
  'TYPESCRIPT',
  'PYTHON',
  'SHADER_CODE',
  'CODE_REPAIR',
  // Low resource
  'CLASSIFICATION',
  'TAGGING',
  'METADATA',
  'ROUTING',
  // Vision
  'VISION_ANALYSIS',
  'IMAGE_CRITIQUE',
  'ASSET_TAGGING',
  // Image
  'IMAGE_GENERATION',
  'CONCEPT_ART',
  'CHARACTER_CONCEPT',
  'ENEMY_CONCEPT',
  'BOSS_CONCEPT',
  'NPC_CONCEPT',
  'PORTRAIT',
  'ITEM_ICON',
  'WEAPON_ICON',
  'ENVIRONMENT',
  'BACKGROUND',
  'TILE_SOURCE',
  'VFX_TEXTURE',
  'UI_ART',
  'MARKETING_ART',
  // Animation / video
  'SPRITE_GENERATION',
  'ANIMATION_GENERATION',
  'VIDEO_GENERATION',
  // Post-processing
  'BACKGROUND_REMOVAL',
  'SEGMENTATION',
  'DEPTH_ESTIMATION',
  'UPSCALING',
  'PIXEL_ART_PROCESS',
  'TEXTURE_GENERATION',
  // Audio
  'SFX_GENERATION',
  'MUSIC_GENERATION',
  'PROCEDURAL_SFX',
  // Speech
  'SPEECH_GENERATION',
  'SPEECH_RECOGNITION',
  // Embeddings / retrieval
  'EMBEDDING',
  'RERANKING',
  // Optional 3D
  'THREE_D_GENERATION',
]);

export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const SpecializationScoresSchema = z
  .record(CapabilityScoreKeySchema, z.number().min(0).max(100))
  .default({});

export const ModelEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  repository: z.string().optional(),
  modality: ModelModalitySchema,
  capabilities: z.array(ModelCapabilitySchema),
  local: z.boolean(),
  enabled: z.boolean().default(true),
  costClass: z.enum(['free', 'low', 'medium', 'high']).default('free'),
  /** Distinguishes a free *development/prototyping* API tier (rate-limited, not meant for
   *  production load, may change terms) from genuine free production compute. costClass alone
   *  can't express this — e.g. NVIDIA NIM's hosted developer API is free but explicitly not a
   *  production SLA. Absent means "no special distinction" (the common case for local models). */
  usageClass: z.enum(['development_prototyping', 'production']).optional(),
  license: z.string(),
  commercialUse: CommercialUseSchema.default('unknown'),
  licenseDetail: LicenseDetailSchema.optional(),
  parameterCount: z.string().optional(),
  quantization: z.string().optional(),
  minRamMb: z.number().int().nonnegative().optional(),
  recommendedRamMb: z.number().int().nonnegative().optional(),
  minVramMb: z.number().int().nonnegative().optional(),
  recommendedVramMb: z.number().int().nonnegative().optional(),
  contextWindow: z.number().int().nullable().optional(),
  supportsTools: z.boolean().default(false),
  supportsStructuredOutput: z.boolean().default(false),
  supportsVision: z.boolean().default(false),
  supportsImageGeneration: z.boolean().default(false),
  supportsAudio: z.boolean().default(false),
  estimatedSpeed: z.enum(['fast', 'medium', 'slow']).optional(),
  estimatedQuality: z.enum(['low', 'medium', 'high']).optional(),
  specializationScores: SpecializationScoresSchema.default({}),
  runtime: z.string().optional(),
  ggufAvailable: z.boolean().default(false),
  downloadSizeMb: z.number().optional(),
  installed: z.boolean().default(false),
  installPath: z.string().optional(),
  health: ModelHealthSchema.default('unknown'),
  priority: z.number().int().default(50),
  benchmarkScore: z.number().min(0).max(100).optional(),
  lastScoutedAt: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
});

export type ModelEntry = z.infer<typeof ModelEntrySchema>;

export const ModelCatalogSchema = z.object({
  version: z.string(),
  updatedAt: z.string().datetime(),
  models: z.array(ModelEntrySchema),
});

export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;

export const HardwareProfileSchema = z.object({
  os: z.string(),
  cpuArch: z.string(),
  cpuCores: z.number().int(),
  totalRamMb: z.number().int(),
  freeRamMb: z.number().int().optional(),
  gpuVendor: z.string().optional(),
  gpuModel: z.string().optional(),
  vramMb: z.number().int().optional(),
  cudaAvailable: z.boolean().default(false),
  rocmAvailable: z.boolean().default(false),
  directMlAvailable: z.boolean().default(false),
  metalAvailable: z.boolean().default(false),
  profile: z.enum(['LOW_RESOURCE', 'BALANCED', 'HIGH_QUALITY']),
});

export type HardwareProfile = z.infer<typeof HardwareProfileSchema>;

export const GenerationFailureReasonSchema = z.enum([
  'MODEL_NOT_INSTALLED',
  'MODEL_LOAD_FAILURE',
  'OUT_OF_MEMORY',
  'RATE_LIMIT',
  'TIMEOUT',
  'INVALID_OUTPUT',
  'LICENSE_BLOCKED',
  'CAPABILITY_MISMATCH',
  'PROVIDER_OFFLINE',
  'GENERATION_FAILED',
]);

export type GenerationFailureReason = z.infer<typeof GenerationFailureReasonSchema>;

export const ScoutReportSchema = z.object({
  id: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  sourcesChecked: z.array(z.string()),
  modelsDiscovered: z.number().int(),
  modelsUpdated: z.number().int(),
  modelsAdded: z.number().int(),
  benchmarksRun: z.number().int().default(0),
  errors: z.array(z.string()).default([]),
});

export type ScoutReport = z.infer<typeof ScoutReportSchema>;
