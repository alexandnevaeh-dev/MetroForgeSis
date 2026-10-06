import { z } from 'zod';

/**
 * Structured, machine-readable templates for the visual reference library
 * (docs/asset-pipeline/reference-library/). A template resolves (assetRole, biome) to concrete
 * generation constraints — the same role/category vocabulary used by the real generation pipeline
 * (FoundryAssetTypeSchema in ./foundry.ts, and the character/environment/background/pickup/prop
 * categories used by packages/assets/src/pipeline-v2/planner.ts) so it slots into existing code
 * rather than inventing a parallel taxonomy.
 *
 * Fixed identity constraints (anatomy, anchors, gameplay-meaning color, lighting direction) never
 * vary by seed. Allowed variation (panel wear, growth coverage, corrosion pattern) may. This split
 * is enforced by convention (fixedIdentity vs. allowedVariation are separate, both-required
 * fields) rather than by a single freeform "constraints" bag, so a caller cannot accidentally
 * treat a fixed constraint as something a seed may vary.
 */

export const VisualReferenceAssetRoleSchema = z.enum([
  'player',
  'enemy_melee',
  'enemy_ranged',
  'enemy_flying',
  'enemy_armored_heavy',
  'boss',
  'npc',
  'terrain',
  'traversal_door',
  'traversal_lift',
  'traversal_breakable_barrier',
  'traversal_one_way_platform',
  'traversal_ability_gate',
  'prop',
  'background',
  'vfx',
]);
export type VisualReferenceAssetRole = z.infer<typeof VisualReferenceAssetRoleSchema>;

export const VisualReferenceFacingSchema = z.enum(['right', 'left', 'omnidirectional']);
export type VisualReferenceFacing = z.infer<typeof VisualReferenceFacingSchema>;

export const VisualReferenceAnchorSchema = z.enum(['floor', 'wall', 'ceiling', 'opening', 'hover', 'free']);
export type VisualReferenceAnchor = z.infer<typeof VisualReferenceAnchorSchema>;

export const AnimationPoseSchema = z.object({
  clip: z.string(),
  description: z.string(),
  frameCount: z.number().int().positive(),
  fps: z.number().positive(),
  loop: z.boolean(),
  /** e.g. { strike: 2 } — matches the accepted pack's per-frame event convention. */
  events: z.record(z.string(), z.number().int().nonnegative()).default({}),
});
export type AnimationPose = z.infer<typeof AnimationPoseSchema>;

export const TerrainAdjacencyRuleSchema = z.object({
  tileRole: z.string(),
  adjacentTo: z.array(z.string()),
  seamRequirement: z.string(),
});
export type TerrainAdjacencyRule = z.infer<typeof TerrainAdjacencyRuleSchema>;

/** Reusable, provider-compatible prompt fragments — composes with the real prompt builders
 *  (buildFoundryPrompt in packages/assets/src/foundry/prompts.ts, applyStylePrompt in
 *  packages/assets/src/asset-pipeline.ts) rather than replacing them. `subjectTemplate` may
 *  contain `{{biome}}` / `{{role}}` placeholders resolved at build time. */
export const PromptRecipeSchema = z.object({
  promptPrefix: z.string(),
  subjectTemplate: z.string(),
  negativePrompt: z.string(),
  /** Conservative estimated-token budget for this recipe at typical placeholder expansion —
   *  advisory only; the real enforcement point is the active provider's own tokenizer check
   *  (see checkTemplateTokenBudget in packages/assets/src/visual-templates/prompt.ts). */
  estimatedTokenBudget: z.number().int().positive().default(60),
});
export type PromptRecipe = z.infer<typeof PromptRecipeSchema>;

export const VisualReferenceProvenanceSchema = z.object({
  reviewer: z.string(),
  qaStatus: z.enum(['QA_REVIEW', 'NEEDS_REWORK', 'FULL_APPROVAL_AI_DELEGATED', 'PRODUCTION_READY']),
  sourceHash: z.string().optional(),
  generatedAt: z.string(),
  note: z.string().optional(),
});
export type VisualReferenceProvenance = z.infer<typeof VisualReferenceProvenanceSchema>;

export const VisualReferenceTemplateSchema = z.object({
  id: z.string(),
  assetRole: VisualReferenceAssetRoleSchema,
  biome: z.string(),
  /** Must match a visual-constitution.json `version` — a template is stale if these diverge. */
  styleVersion: z.string(),
  /** Paths relative to docs/asset-pipeline/reference-library/. */
  referencePaths: z.array(z.string()).min(1),

  dimensions: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  frameCount: z.number().int().positive().default(1),
  frameTiming: z.object({ fps: z.number().positive(), perFrameMs: z.number().positive().optional() }).optional(),
  anchor: VisualReferenceAnchorSchema,
  facing: VisualReferenceFacingSchema,
  scale: z.number().positive().default(1),

  palette: z.array(z.string()).min(1),
  materials: z.array(z.string()).default([]),

  requiredSilhouetteCues: z.array(z.string()).default([]),
  requiredGameplayCues: z.array(z.string()).default([]),

  /** What a seed MAY change (wear, panel pattern, growth coverage, non-gameplay decoration). */
  allowedVariation: z.array(z.string()).default([]),
  /** What a seed MUST NOT change (anatomy, anchor, gameplay-meaning color, lighting direction). */
  forbiddenChanges: z.array(z.string()).min(1),
  /** Concrete, renderer-facing material features this biome variation wants expressed (e.g.
   *  'panel_grates', 'corrosion', 'stains', 'damaged_modules', 'vegetation' — the vocabulary a
   *  given renderer supports; see TILESET_SUPPORTED_FEATURES / BACKGROUND_SUPPORTED_FEATURES /
   *  PROP_SUPPORTED_FEATURES in packages/assets/src/{png,parallax-strip,prop-art}.ts). Distinct
   *  from `allowedVariation` (prose, for prompt/human consumption) — this is the machine-checked
   *  list a renderer partitions into supported/unsupported so requesting an unsupported feature is
   *  disclosed rather than silently dropped. Not every asset role uses this (character roles
   *  generally don't); defaults to empty. */
  environmentFeatures: z.array(z.string()).default([]),

  terrainAdjacency: z.array(TerrainAdjacencyRuleSchema).optional(),
  animationPoses: z.array(AnimationPoseSchema).optional(),

  promptRecipe: PromptRecipeSchema,

  validationRules: z.array(z.string()).default([]),
  provenance: VisualReferenceProvenanceSchema,
});
export type VisualReferenceTemplate = z.infer<typeof VisualReferenceTemplateSchema>;

/** A biome's overall variation contract — which templates it supplies, and which global
 *  consistency constraints it must not violate (proportions/pixel density/perspective/gameplay
 *  color meanings, per the fourteenth-session task's biome-variation requirement). */
export const BiomeVisualTemplateSchema = z.object({
  biome: z.string(),
  label: z.string(),
  styleVersion: z.string(),
  templateIds: z.array(z.string()).min(1),
  consistencyConstraints: z.array(z.string()).min(1),
  provenance: VisualReferenceProvenanceSchema,
});
export type BiomeVisualTemplate = z.infer<typeof BiomeVisualTemplateSchema>;

export const VisualReferenceLibrarySchema = z.object({
  id: z.string(),
  styleVersion: z.string(),
  templates: z.array(VisualReferenceTemplateSchema).min(1),
  biomes: z.array(BiomeVisualTemplateSchema).min(1),
});
export type VisualReferenceLibrary = z.infer<typeof VisualReferenceLibrarySchema>;
