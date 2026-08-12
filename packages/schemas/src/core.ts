import { z } from 'zod';

export const GenerationModeSchema = z.enum([
  'FREE_ONLY',
  'LOCAL_ONLY',
  'HYBRID_FREE',
  'CUSTOM',
]);

export const GenerationProfileSchema = z.enum(['TINY_TEST', 'SMALL', 'MEDIUM', 'LARGE']);

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
  status: z.enum(['draft', 'generating', 'complete', 'failed', 'cancelled']),
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
  status: z.enum(['pending', 'running', 'paused', 'complete', 'failed', 'cancelled']),
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
  movement: z.object({
    walkSpeed: z.number(),
    runSpeed: z.number(),
    jumpHeight: z.number(),
    gravity: z.number(),
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
