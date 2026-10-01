import type { GameArchetype, GenerationProfile } from './constants.js';

/**
 * Capability-driven genre registry.
 * Prefer `genreSupports` / `getGenreDefinition` over `if (archetype === 'TOP_DOWN_…')`.
 * Zod mirrors live in `@metroforge/schemas` (`genre.ts`) — keep shapes aligned.
 * `GameArchetypePlugin` remains a thin compatibility view for existing callers.
 */

export type Perspective = 'SIDE_VIEW' | 'TOP_DOWN' | 'ISOMETRIC';
export type WorldTopologyModel =
  | 'LINEAR'
  | 'HUB_AND_SPOKE'
  | 'INTERCONNECTED'
  | 'OPEN_REGION'
  | 'DUNGEON_BASED';
export type ProgressionModel =
  | 'ABILITY_GATED'
  | 'ITEM_GATED'
  | 'KEY_GATED'
  | 'STORY_GATED'
  | 'EQUIPMENT_GATED'
  | 'OPEN';
export type CombatFamily = 'MELEE_ACTION' | 'DIRECTIONAL_MELEE' | 'SHOOTER' | 'MAGIC' | 'HYBRID';
export type LocomotionModel = 'PLATFORMER' | 'PLANAR_4DIR' | 'PLANAR_8DIR' | 'PLANAR_ANALOG';
export type CameraModel =
  | 'SIDE_FOLLOW_ROOM'
  | 'TOP_DOWN_FOLLOW'
  | 'TOP_DOWN_SCREEN'
  | 'CONTINUOUS_FOLLOW';
export type NavigationModel = 'PLATFORMER_GEOMETRY' | 'WALKABILITY_GRID' | 'NAVIGATION_AGENT';
export type AbilityNamespace = 'movement_abilities' | 'dungeon_tools';
export type ArtProjection = 'side-view' | 'top-down';
export type QualityPassProfile =
  | 'side_view_metroidvania'
  | 'top_down_action_adventure'
  | 'none';

export interface GenreCapabilities {
  supportsVerticalPlatforming: boolean;
  supportsFreePlanarMovement: boolean;
  supportsJumping: boolean;
  supportsGravity: boolean;
  supportsElevationLayers: boolean;
  supportsLockedAbilityGates: boolean;
  supportsItemToolGates: boolean;
  supportsProjectileCombat: boolean;
  supportsDirectionalCombat: boolean;
  supportsRoomTransitions: boolean;
  supportsContinuousWorldCamera: boolean;
  supportsDungeonRooms: boolean;
  supportsParallaxBackgrounds: boolean;
  supportsYSort: boolean;
  supportsDirectionalSpriteSheets: boolean;
  supportsOverworldMap: boolean;
  supportsPerRoomScenes: boolean;
  /** When false, QualityDirector / side-view repair must not run. */
  supportsSideViewQualityPass: boolean;
  abilityNamespace: AbilityNamespace;
  artProjection: ArtProjection;
  qualityPassProfile: QualityPassProfile;
}

export type GenreCapabilityFlag = {
  [K in keyof GenreCapabilities]: GenreCapabilities[K] extends boolean ? K : never;
}[keyof GenreCapabilities];

export interface GenreRuntimeBinding {
  godotTemplate: string;
  playerController: 'side_view' | 'top_down_8dir';
  cameraModel: CameraModel;
  worldGenerator: 'linear_room_graph' | 'overworld_chunks';
  combatModel: 'side_view_melee' | 'directional_top_down';
  navigationModel: NavigationModel;
  locomotion: LocomotionModel;
}

export interface GenreDefinition {
  id: GameArchetype;
  displayName: string;
  perspective: Perspective;
  defaultWorldTopology: WorldTopologyModel;
  defaultProgression: ProgressionModel;
  defaultCombat: CombatFamily;
  capabilities: GenreCapabilities;
  runtime: GenreRuntimeBinding;
  /** Style/reference tags for ArtDirectionSpec (not copyrighted assets). */
  referenceTags: string[];
}

export const GENRE_DEFINITIONS: Record<GameArchetype, GenreDefinition> = {
  SIDE_VIEW_METROIDVANIA: {
    id: 'SIDE_VIEW_METROIDVANIA',
    displayName: 'Side-View Metroidvania',
    perspective: 'SIDE_VIEW',
    defaultWorldTopology: 'INTERCONNECTED',
    defaultProgression: 'ABILITY_GATED',
    defaultCombat: 'MELEE_ACTION',
    capabilities: {
      supportsVerticalPlatforming: true,
      supportsFreePlanarMovement: false,
      supportsJumping: true,
      supportsGravity: true,
      supportsElevationLayers: true,
      supportsLockedAbilityGates: true,
      supportsItemToolGates: false,
      supportsProjectileCombat: true,
      supportsDirectionalCombat: false,
      supportsRoomTransitions: true,
      supportsContinuousWorldCamera: true,
      supportsDungeonRooms: false,
      supportsParallaxBackgrounds: true,
      supportsYSort: false,
      supportsDirectionalSpriteSheets: false,
      supportsOverworldMap: false,
      supportsPerRoomScenes: true,
      supportsSideViewQualityPass: true,
      abilityNamespace: 'movement_abilities',
      artProjection: 'side-view',
      qualityPassProfile: 'side_view_metroidvania',
    },
    runtime: {
      godotTemplate: 'templates/godot-metroidvania',
      playerController: 'side_view',
      cameraModel: 'SIDE_FOLLOW_ROOM',
      worldGenerator: 'linear_room_graph',
      combatModel: 'side_view_melee',
      navigationModel: 'PLATFORMER_GEOMETRY',
      locomotion: 'PLATFORMER',
    },
    referenceTags: [
      'hand_drawn_illustrated',
      'layered_parallax',
      'cool_desaturated_palette',
      'high_contrast_player_silhouette',
      'cavernous_vertical_chambers',
      'ability_gated_interconnected',
      'platform_traversal',
      'boss_arena_lock',
      'fluid_character_animation',
      'readable_melee_swing_arcs',
      'lifelike_locomotion_weight',
    ],
  },
  TOP_DOWN_ACTION_ADVENTURE: {
    id: 'TOP_DOWN_ACTION_ADVENTURE',
    displayName: 'Top-Down Action-Adventure',
    perspective: 'TOP_DOWN',
    defaultWorldTopology: 'DUNGEON_BASED',
    defaultProgression: 'ITEM_GATED',
    defaultCombat: 'DIRECTIONAL_MELEE',
    capabilities: {
      supportsVerticalPlatforming: false,
      supportsFreePlanarMovement: true,
      supportsJumping: false,
      supportsGravity: false,
      supportsElevationLayers: true,
      supportsLockedAbilityGates: false,
      supportsItemToolGates: true,
      supportsProjectileCombat: true,
      supportsDirectionalCombat: true,
      supportsRoomTransitions: true,
      supportsContinuousWorldCamera: true,
      supportsDungeonRooms: true,
      supportsParallaxBackgrounds: false,
      supportsYSort: true,
      supportsDirectionalSpriteSheets: true,
      supportsOverworldMap: true,
      supportsPerRoomScenes: false,
      supportsSideViewQualityPass: false,
      abilityNamespace: 'dungeon_tools',
      artProjection: 'top-down',
      qualityPassProfile: 'top_down_action_adventure',
    },
    runtime: {
      godotTemplate: 'templates/godot-topdown-adventure',
      playerController: 'top_down_8dir',
      cameraModel: 'TOP_DOWN_FOLLOW',
      worldGenerator: 'overworld_chunks',
      combatModel: 'directional_top_down',
      navigationModel: 'WALKABILITY_GRID',
      locomotion: 'PLANAR_8DIR',
    },
    referenceTags: [
      'planar_navigation',
      'dungeon_room_grammar',
      'orthogonal_floor_routes',
      'neon_atmospheric_overworld',
      'readable_tile_footprints',
      'directional_combat',
      'dungeon_item_gates',
      'overworld_dungeon_split',
      'three_quarter_read',
      'fluid_character_animation',
      'readable_melee_swing_arcs',
      'lifelike_locomotion_weight',
    ],
  },
};

export function getGenreDefinition(id: GameArchetype | undefined | null): GenreDefinition {
  return GENRE_DEFINITIONS[resolveGameArchetype(id)];
}

export function genreSupports(
  id: GameArchetype | undefined | null,
  capability: GenreCapabilityFlag,
): boolean {
  return getGenreDefinition(id).capabilities[capability] === true;
}

export function genreCapability<K extends keyof GenreCapabilities>(
  id: GameArchetype | undefined | null,
  key: K,
): GenreCapabilities[K] {
  return getGenreDefinition(id).capabilities[key];
}

/** Top-down dungeon tools vs side-view movement abilities share GameDNA.abilities today. */
export function genreUsesDungeonTools(id: GameArchetype | undefined | null): boolean {
  return genreCapability(id, 'abilityNamespace') === 'dungeon_tools';
}

export function genreUsesOverworldChunks(id: GameArchetype | undefined | null): boolean {
  return getGenreDefinition(id).runtime.worldGenerator === 'overworld_chunks';
}

export function genreGodotTemplate(id: GameArchetype | undefined | null): string {
  return getGenreDefinition(id).runtime.godotTemplate;
}

/** @deprecated Prefer GenreDefinition — kept for existing call sites. */
export interface GameArchetypePlugin {
  id: GameArchetype;
  runtimeTemplate: string;
  defaultGenre: string;
  playerController: 'side_view' | 'top_down_8dir';
  cameraModel: 'follow_room' | 'follow_or_screen';
  worldGenerator: 'linear_room_graph' | 'overworld_chunks';
  combatModel: 'side_view_melee' | 'directional_top_down';
  navigationModel: 'platformer' | 'navigation_agent' | 'walkability_grid';
  ySort: boolean;
}

function toLegacyPlugin(def: GenreDefinition): GameArchetypePlugin {
  const cameraLegacy =
    def.runtime.cameraModel === 'SIDE_FOLLOW_ROOM' ? 'follow_room' : 'follow_or_screen';
  const navLegacy =
    def.runtime.navigationModel === 'PLATFORMER_GEOMETRY'
      ? 'platformer'
      : def.runtime.navigationModel === 'NAVIGATION_AGENT'
        ? 'navigation_agent'
        : 'walkability_grid';
  return {
    id: def.id,
    runtimeTemplate: def.runtime.godotTemplate,
    defaultGenre: def.displayName.includes('Metroidvania') ? 'Metroidvania' : 'Action-Adventure',
    playerController: def.runtime.playerController,
    cameraModel: cameraLegacy,
    worldGenerator: def.runtime.worldGenerator,
    combatModel: def.runtime.combatModel,
    navigationModel: navLegacy,
    ySort: def.capabilities.supportsYSort,
  };
}

export const GAME_ARCHETYPE_PLUGINS: Record<GameArchetype, GameArchetypePlugin> = {
  SIDE_VIEW_METROIDVANIA: toLegacyPlugin(GENRE_DEFINITIONS.SIDE_VIEW_METROIDVANIA),
  TOP_DOWN_ACTION_ADVENTURE: toLegacyPlugin(GENRE_DEFINITIONS.TOP_DOWN_ACTION_ADVENTURE),
};

export function getGameArchetypePlugin(id: GameArchetype): GameArchetypePlugin {
  return toLegacyPlugin(getGenreDefinition(id));
}

export function isTopDownArchetype(id: GameArchetype | undefined): boolean {
  return getGenreDefinition(id).perspective === 'TOP_DOWN';
}

export function resolveGameArchetype(value: string | undefined | null): GameArchetype {
  if (value === 'TOP_DOWN_ACTION_ADVENTURE') return 'TOP_DOWN_ACTION_ADVENTURE';
  return 'SIDE_VIEW_METROIDVANIA';
}

/** Infer from a prompt only when the caller did not pass an explicit archetype. */
export function inferGameArchetypeFromPrompt(prompt: string): GameArchetype {
  if (/\btop[\s-]?down\b/i.test(prompt) || /\baction[\s-]?adventure\b/i.test(prompt)) {
    return 'TOP_DOWN_ACTION_ADVENTURE';
  }
  return 'SIDE_VIEW_METROIDVANIA';
}

export const TOP_DOWN_PROFILE_DEFAULTS: Record<
  GenerationProfile,
  { regions: number; dungeonCount: number; townCount: number; chunkCols: number; chunkRows: number }
> = {
  TINY_TEST: { regions: 1, dungeonCount: 1, townCount: 0, chunkCols: 2, chunkRows: 2 },
  VISUAL_VERTICAL_SLICE: { regions: 1, dungeonCount: 1, townCount: 0, chunkCols: 3, chunkRows: 2 },
  SMALL: { regions: 3, dungeonCount: 3, townCount: 1, chunkCols: 8, chunkRows: 6 },
  MEDIUM: { regions: 6, dungeonCount: 6, townCount: 3, chunkCols: 16, chunkRows: 12 },
  LARGE: { regions: 8, dungeonCount: 8, townCount: 4, chunkCols: 20, chunkRows: 16 },
  RELEASE_CANDIDATE: { regions: 6, dungeonCount: 5, townCount: 2, chunkCols: 12, chunkRows: 9 },
};

export const TOP_DOWN_DUNGEON_ITEMS = [
  { id: 'wind_disc', name: 'Wind Disc', category: 'tool' },
  { id: 'chain_hook', name: 'Chain Hook', category: 'tool' },
  { id: 'phase_lantern', name: 'Phase Lantern', category: 'tool' },
  { id: 'magnetic_gauntlet', name: 'Magnetic Gauntlet', category: 'tool' },
  { id: 'crystal_hammer', name: 'Crystal Hammer', category: 'tool' },
  { id: 'spirit_mirror', name: 'Spirit Mirror', category: 'tool' },
  { id: 'vine_whip', name: 'Vine Whip', category: 'tool' },
  { id: 'spectral_boots', name: 'Spectral Boots', category: 'tool' },
] as const;

export function pickTopDownDungeonItems(profile: GenerationProfile): Array<{
  id: string;
  name: string;
  category: string;
  enabled: boolean;
}> {
  const count =
    profile === 'TINY_TEST' || profile === 'VISUAL_VERTICAL_SLICE'
      ? 1
      : profile === 'SMALL'
        ? 3
        : profile === 'MEDIUM'
          ? 6
          : profile === 'RELEASE_CANDIDATE'
            ? 5
            : 8;
  return TOP_DOWN_DUNGEON_ITEMS.slice(0, count).map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    enabled: true,
  }));
}
