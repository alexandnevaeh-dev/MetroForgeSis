/** Product identity — change METROFORGE_APP_NAME in .env without code changes. */
export const PRODUCT = {
  id: 'metroforge-ai',
  defaultName: 'MetroForge AI',
  version: '0.1.0',
  generatorVersion: '0.1.0',
  godotTemplateVersion: '0.1.0',
  schemaVersion: '0.1.0',
} as const;

/**
 * FREE_ONLY/LOCAL_ONLY/HYBRID_FREE/CUSTOM are the original 4 modes — preserved exactly.
 * NVIDIA_ONLY/COMMERCIAL_SAFE/OFFLINE/FASTEST/HIGHEST_QUALITY/LOW_VRAM/BALANCED/LOWEST_COST
 * are the generation-mode expansion (packages/ai/src/registry.ts CapabilityRouter,
 * generation-router.ts GenerationRouter.generate()). Keep in sync with GenerationModeSchema in
 * packages/schemas/src/core.ts — two independently-maintained definitions of the same set
 * (a TS type here for compile-time use, a Zod enum there for runtime validation).
 */
export type GenerationMode =
  | 'FREE_ONLY'
  | 'LOCAL_ONLY'
  | 'HYBRID_FREE'
  | 'CUSTOM'
  | 'NVIDIA_ONLY'
  | 'COMMERCIAL_SAFE'
  | 'OFFLINE'
  | 'FASTEST'
  | 'HIGHEST_QUALITY'
  | 'LOW_VRAM'
  | 'BALANCED'
  | 'LOWEST_COST';

export type GenerationProfile =
  | 'TINY_TEST'
  | 'VISUAL_VERTICAL_SLICE'
  | 'SMALL'
  | 'MEDIUM'
  | 'LARGE'
  | 'RELEASE_CANDIDATE';

export const GENERATION_PROFILES: readonly GenerationProfile[] = [
  'TINY_TEST',
  'VISUAL_VERTICAL_SLICE',
  'SMALL',
  'MEDIUM',
  'LARGE',
  'RELEASE_CANDIDATE',
] as const;

/** Profiles that may emit hundreds of final visual assets. Blocked until a human approves a visual slice. */
export const MASS_VISUAL_PROFILES: readonly GenerationProfile[] = ['LARGE', 'RELEASE_CANDIDATE'];

/** Profiles that automatically run QualityDirector after a successful runtime/import validation. */
export const PRODUCTION_QUALITY_PROFILES: readonly GenerationProfile[] = [
  'SMALL',
  'MEDIUM',
  'LARGE',
  'RELEASE_CANDIDATE',
  'VISUAL_VERTICAL_SLICE',
];

export function isProductionQualityProfile(profile: GenerationProfile | string | undefined): boolean {
  return Boolean(profile && (PRODUCTION_QUALITY_PROFILES as readonly string[]).includes(profile));
}

export type GameArchetype = 'SIDE_VIEW_METROIDVANIA' | 'TOP_DOWN_ACTION_ADVENTURE';

export type HardwareProfile = 'LOW_RESOURCE' | 'BALANCED' | 'HIGH_QUALITY';

export type StageStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PASSED'
  | 'FAILED'
  | 'REPAIRING'
  | 'SKIPPED';

export type CostClass = 'free' | 'low' | 'medium' | 'high';

/**
 * Must match exactly the phase strings GenerationPipeline.run() actually calls report() with
 * (packages/generation/src/pipeline.ts) — this list seeds one `generation_stages` DB row per
 * entry per job, and any phase here with no matching report() call sits permanently PENDING.
 * Previously listed 38 aspirational phases (tilesets, vfx, ...) for pipeline stages
 * that were never implemented; trimmed to the ones that are real. Add a phase here only
 * alongside a corresponding report() call.
 */
export const GENERATION_PHASES = [
  'intake',
  'game_dna',
  'design_bible',
  'world_topology',
  'progression_graph',
  'enemy_families',
  'bosses',
  'quests',
  'npcs',
  'audio',
  'environment_assets',
  'project_assembly',
  'static_validation',
  'automated_repair',
  'final_qa',
  'export',
] as const;

export type GenerationPhase = (typeof GENERATION_PHASES)[number];

export const PROFILE_DEFAULTS: Record<
  GenerationProfile,
  {
    biomes: number;
    roomsMin: number;
    roomsMax: number;
    abilities: number;
    enemies: number;
    bosses: number;
    npcs: number;
    quests: number;
  }
> = {
  TINY_TEST: {
    biomes: 1,
    roomsMin: 8,
    roomsMax: 8,
    abilities: 1,
    enemies: 2,
    bosses: 1,
    npcs: 1,
    quests: 1,
  },
  /** One-biome visual quality reference — 10 connected rooms, not a content dump. */
  VISUAL_VERTICAL_SLICE: {
    biomes: 1,
    roomsMin: 10,
    roomsMax: 10,
    abilities: 1,
    enemies: 4,
    bosses: 1,
    npcs: 1,
    quests: 1,
  },
  SMALL: {
    biomes: 3,
    roomsMin: 30,
    roomsMax: 50,
    abilities: 4,
    enemies: 10,
    bosses: 2,
    npcs: 4,
    quests: 4,
  },
  MEDIUM: {
    biomes: 5,
    roomsMin: 80,
    roomsMax: 120,
    abilities: 6,
    enemies: 20,
    bosses: 5,
    npcs: 8,
    quests: 10,
  },
  LARGE: {
    biomes: 8,
    roomsMin: 150,
    roomsMax: 300,
    abilities: 8,
    enemies: 40,
    bosses: 8,
    npcs: 15,
    quests: 20,
  },
  /** Side-view RC scale: 5–7 regions, 35–60 rooms — between SMALL and MEDIUM, not a fake room dump. */
  RELEASE_CANDIDATE: {
    biomes: 6,
    roomsMin: 38,
    roomsMax: 52,
    abilities: 5,
    enemies: 10,
    bosses: 4,
    npcs: 5,
    quests: 4,
  },
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

export function generateId(prefix = 'mf'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}
