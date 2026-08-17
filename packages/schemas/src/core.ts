import { z } from 'zod';

export const GenerationModeSchema = z.enum([
  'FREE_ONLY',
  'LOCAL_ONLY',
  'HYBRID_FREE',
  'CUSTOM',
  'NVIDIA_ONLY',
  'COMMERCIAL_SAFE',
  'OFFLINE',
  'FASTEST',
  'HIGHEST_QUALITY',
  'LOW_VRAM',
  'BALANCED',
  'LOWEST_COST',
]);

export const GenerationProfileSchema = z.enum([
  'TINY_TEST',
  'VISUAL_VERTICAL_SLICE',
  'SMALL',
  'MEDIUM',
  'LARGE',
  'RELEASE_CANDIDATE',
]);

/** Gameplay genre plugin. Distinct from room `archetype` (tutorial/boss/shop). */
export const GameArchetypeSchema = z.enum(['SIDE_VIEW_METROIDVANIA', 'TOP_DOWN_ACTION_ADVENTURE']);

export type GameArchetype = z.infer<typeof GameArchetypeSchema>;

export const TopDownConfigSchema = z.object({
  movementDirections: z.union([z.literal(4), z.literal(8)]).default(8),
  worldStyle: z.enum(['continuous', 'screen_by_screen']).default('continuous'),
  dungeonCount: z.number().int().positive().optional(),
  townCount: z.number().int().nonnegative().optional(),
  worldVariantEnabled: z.boolean().default(false),
  dungeonItemProgression: z.boolean().default(true),
  puzzleDensity: z.number().min(0).max(1).default(0.35),
  secretDensity: z.number().min(0).max(1).default(0.15),
});

export type TopDownConfig = z.infer<typeof TopDownConfigSchema>;

export const StageStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'PASSED',
  'FAILED',
  'REPAIRING',
  'SKIPPED',
]);

export const ProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  profile: GenerationProfileSchema,
  mode: GenerationModeSchema,
  seed: z.number().int(),
  outputPath: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // 'validation_failed': assembly succeeded (files exist on disk) but QA/Godot runtime
  // validation did not pass — distinct from 'failed', which means generation itself crashed
  // before producing a project directory at all.
  status: z.enum(['draft', 'generating', 'complete', 'failed', 'validation_failed', 'cancelled']),
});

export type Project = z.infer<typeof ProjectSchema>;

/**
 * Written as `project.json` inside the generated project directory itself — distinct from
 * the SQLite `projects` table (which is the primary per-machine record, keyed by a local
 * `.metroforge/metroforge.db` that may not exist on a different machine or a fresh clone of
 * `GeneratedGames/`). This is what lets `metroforge generate <slug>` reliably recover the
 * original prompt and reproduce the same generation, without depending on the database.
 */
export const ProjectMetadataSchema = z.object({
  projectId: z.string(),
  slug: z.string(),
  prompt: z.string(),
  profile: GenerationProfileSchema,
  mode: GenerationModeSchema,
  seed: z.number().int(),
  createdAt: z.string().datetime(),
  lastGeneratedAt: z.string().datetime(),
  gameDnaVersion: z.string(),
  generatorVersion: z.string(),
  archetype: GameArchetypeSchema.default('SIDE_VIEW_METROIDVANIA'),
  /** Human visual-direction approval for this project (slice). Distinct from technical QA. */
  visualSliceApproved: z.boolean().optional(),
  visualReviewStatus: z
    .enum([
      'NOT_APPLICABLE',
      'VISUAL_SLICE_REVIEW_REQUIRED',
      'VISUAL_SLICE_APPROVED',
      'VISUAL_SLICE_REJECTED',
    ])
    .optional(),
  /** Per-project Asset Foundry overlay. Missing means inherit global mode/providers. */
  assetFoundry: z
    .object({
      routingMode: z
        .enum([
          'free-only',
          'local-only',
          'offline',
          'balanced',
          'fastest',
          'highest-quality',
          'lowest-cost',
          'nvidia-first',
          'custom',
        ])
        .optional(),
      enabledProviders: z.array(z.string()).optional(),
      preferredImageProvider: z.string().optional(),
      allowPaidFallback: z.boolean().optional(),
      completionMode: z.enum(['prototype', 'production']).optional(),
      localOnly: z.boolean().optional(),
    })
    .optional(),
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

export const GenerationStageSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  phase: z.string(),
  status: StageStatusSchema,
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
  artifacts: z.array(z.string()).default([]),
});

export type GenerationStage = z.infer<typeof GenerationStageSchema>;

export const GenerationJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  correlationId: z.string(),
  profile: GenerationProfileSchema,
  mode: GenerationModeSchema,
  seed: z.number().int(),
  status: z.enum(['pending', 'running', 'paused', 'complete', 'failed', 'validation_failed', 'cancelled']),
  currentPhase: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  stages: z.array(GenerationStageSchema).default([]),
});

export type GenerationJob = z.infer<typeof GenerationJobSchema>;

export const GameDNASchema = z.object({
  version: z.string(),
  identity: z.object({
    title: z.string(),
    tagline: z.string().optional(),
    genre: z.string(),
    subgenre: z.string().optional(),
    tone: z.string(),
    visualStyle: z.string(),
  }),
  technical: z.object({
    resolution: z.object({ width: z.number(), height: z.number() }),
    tileSize: z.number().int().positive(),
    targetPlaytimeHours: z.number().positive(),
    difficulty: z.enum(['easy', 'normal', 'hard', 'custom']),
  }),
  combat: z.object({
    style: z.string(),
    meleeEnabled: z.boolean(),
    rangedEnabled: z.boolean(),
  }),
  movement: z
    .object({
      walkSpeed: z.number(),
      runSpeed: z.number(),
      jumpHeight: z.number(),
      gravity: z.number(),
    })
    .extend({
      coyoteTime: z.number().optional(),
      jumpBufferTime: z.number().optional(),
      acceleration: z.number().optional(),
      deceleration: z.number().optional(),
      airAcceleration: z.number().optional(),
      maxFallSpeed: z.number().optional(),
      dashSpeed: z.number().optional(),
      dashDuration: z.number().optional(),
      dashCooldown: z.number().optional(),
      airDashSpeed: z.number().optional(),
      wallSlideSpeed: z.number().optional(),
      wallJumpHorizontal: z.number().optional(),
      wallJumpVertical: z.number().optional(),
      groundSlamSpeed: z.number().optional(),
      grappleSpeed: z.number().optional(),
      swimSpeed: z.number().optional(),
      phaseDuration: z.number().optional(),
    }),
  abilities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      enabled: z.boolean(),
    }),
  ),
  world: z.object({
    biomeCount: z.number().int().positive(),
    roomCount: z.number().int().positive(),
    regionCount: z.number().int().positive().optional(),
  }),
  narrative: z.object({
    premise: z.string(),
    protagonist: z.string(),
    antagonist: z.string().optional(),
    centralConflict: z.string(),
  }),
  audio: z
    .object({
      musicStyle: z.string().optional(),
      sfxStyle: z.string().optional(),
    })
    .optional(),
  seed: z.number().int(),
  profile: GenerationProfileSchema,
  archetype: GameArchetypeSchema.default('SIDE_VIEW_METROIDVANIA'),
  topDown: TopDownConfigSchema.optional(),
});

export type GameDNA = z.infer<typeof GameDNASchema>;

export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  local: z.boolean(),
  costClass: z.enum(['free', 'low', 'medium', 'high']),
  license: z.string(),
  priority: z.number().int(),
  health: z.enum(['healthy', 'degraded', 'unavailable']).default('unavailable'),
  capabilities: z.array(z.string()),
});

export type Provider = z.infer<typeof ProviderSchema>;

export const ModelSchema = z.object({
  id: z.string(),
  provider: z.string(),
  capabilities: z.array(z.string()),
  local: z.boolean(),
  enabled: z.boolean(),
  costClass: z.enum(['free', 'low', 'medium', 'high']),
  license: z.string(),
  contextWindow: z.number().nullable(),
  supportsTools: z.boolean(),
  supportsVision: z.boolean(),
  priority: z.number().int(),
});

export type Model = z.infer<typeof ModelSchema>;

/** Visual/audio artifact maturity ladder — optional so older manifests remain valid. */
export const AssetMaturitySchema = z.enum([
  'PLACEHOLDER',
  'BLOCKOUT',
  'GENERATED_SOURCE',
  'PROCESSED',
  'COMPILED',
  'QA_REVIEW',
  'PRODUCTION_READY',
  'REJECTED',
]);

export type AssetMaturity = z.infer<typeof AssetMaturitySchema>;

export const ArtifactSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  type: z.string(),
  path: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  promptHash: z.string().nullable(),
  seed: z.number().nullable(),
  license: z.string().nullable(),
  timestamp: z.string().datetime(),
  validationState: z.enum(['pending', 'passed', 'failed']).default('pending'),
  fallbackGenerated: z.boolean().default(false),
  parentArtifactIds: z.array(z.string()).optional(),
  compiler: z.string().nullable().optional(),
  godotResourcePath: z.string().optional(),
  repairCount: z.number().int().nonnegative().optional(),
  transformation: z.string().optional(),
  sourceLicense: z.string().optional(),
  derivedLicense: z.string().optional(),
  /** Explicit maturity — procedural/test art must be PLACEHOLDER/BLOCKOUT, never PRODUCTION_READY. */
  maturity: AssetMaturitySchema.optional(),
  productionReady: z.boolean().optional(),
  sourceType: z
    .enum(['ai_generated', 'procedural', 'checkpoint', 'manual', 'compiled', 'unknown'])
    .optional(),
  styleFingerprint: z.string().optional(),
  negativePromptHash: z.string().nullable().optional(),
  requestedProvider: z.string().optional(),
  requestedModel: z.string().optional(),
  selectedProvider: z.string().optional(),
  selectedModel: z.string().optional(),
  fallbackDepth: z.number().int().nonnegative().optional(),
  fallbackReason: z.string().optional(),
  modelVersion: z.string().nullable().optional(),
  capability: z.string().optional(),
  generationTimestamp: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

export const ValidationResultSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  gate: z.string(),
  passed: z.boolean(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const GenerationManifestSchema = z.object({
  version: z.string(),
  projectId: z.string(),
  jobId: z.string(),
  generatorVersion: z.string(),
  seed: z.number().int(),
  artifacts: z.array(ArtifactSchema),
  createdAt: z.string().datetime(),
});

export type GenerationManifest = z.infer<typeof GenerationManifestSchema>;
