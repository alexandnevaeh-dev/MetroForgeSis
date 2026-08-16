import type { GameArchetype, GenerationProfile } from './constants.js';

export interface GameArchetypePlugin {
  id: GameArchetype;
  runtimeTemplate: string;
  defaultGenre: string;
  playerController: 'side_view' | 'top_down_8dir';
  cameraModel: 'follow_room' | 'follow_or_screen';
  worldGenerator: 'linear_room_graph' | 'overworld_chunks';
  combatModel: 'side_view_melee' | 'directional_top_down';
  navigationModel: 'platformer' | 'navigation_agent';
  ySort: boolean;
}

export const GAME_ARCHETYPE_PLUGINS: Record<GameArchetype, GameArchetypePlugin> = {
  SIDE_VIEW_METROIDVANIA: {
    id: 'SIDE_VIEW_METROIDVANIA',
    runtimeTemplate: 'templates/godot-metroidvania',
    defaultGenre: 'Metroidvania',
    playerController: 'side_view',
    cameraModel: 'follow_room',
    worldGenerator: 'linear_room_graph',
    combatModel: 'side_view_melee',
    navigationModel: 'platformer',
    ySort: false,
  },
  TOP_DOWN_ACTION_ADVENTURE: {
    id: 'TOP_DOWN_ACTION_ADVENTURE',
    runtimeTemplate: 'templates/godot-topdown-adventure',
    defaultGenre: 'Action-Adventure',
    playerController: 'top_down_8dir',
    cameraModel: 'follow_or_screen',
    worldGenerator: 'overworld_chunks',
    combatModel: 'directional_top_down',
    navigationModel: 'navigation_agent',
    ySort: true,
  },
};

export function getGameArchetypePlugin(id: GameArchetype): GameArchetypePlugin {
  return GAME_ARCHETYPE_PLUGINS[id];
}

export function isTopDownArchetype(id: GameArchetype | undefined): boolean {
  return id === 'TOP_DOWN_ACTION_ADVENTURE';
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
