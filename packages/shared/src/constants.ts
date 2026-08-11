/** Product identity — change METROFORGE_APP_NAME in .env without code changes. */
export const PRODUCT = {
  id: 'metroforge-ai',
  defaultName: 'MetroForge AI',
  version: '0.1.0',
  generatorVersion: '0.1.0',
  godotTemplateVersion: '0.1.0',
  schemaVersion: '0.1.0',
} as const;

export type GenerationMode = 'FREE_ONLY' | 'LOCAL_ONLY' | 'HYBRID_FREE' | 'CUSTOM';

export type GenerationProfile = 'TINY_TEST' | 'SMALL' | 'MEDIUM' | 'LARGE';

export type HardwareProfile = 'LOW_RESOURCE' | 'BALANCED' | 'HIGH_QUALITY';

export type StageStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PASSED'
  | 'FAILED'
  | 'REPAIRING'
  | 'SKIPPED';

export type CostClass = 'free' | 'low' | 'medium' | 'high';

export const GENERATION_PHASES = [
  'intake',
  'game_dna',
  'design_bible',
  'narrative_bible',
  'world_topology',
  'progression_graph',
  'biomes',
  'player_mechanics',
  'combat',
  'abilities',
  'room_architecture',
  'enemy_families',
  'bosses',
  'npcs',
  'quests',
  'items_economy',
  'art_direction',
  'environment_assets',
  'tilesets',
  'character_assets',
  'enemy_assets',
  'boss_assets',
  'animation',
  'ui_assets',
  'vfx',
  'audio',
  'godot_data',
  'godot_scenes',
  'gdscript',
  'project_assembly',
  'import_validation',
  'static_validation',
  'gameplay_validation',
  'automated_repair',
  'balance',
  'polish',
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
