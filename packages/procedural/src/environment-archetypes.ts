/**
 * Architectural environment archetypes — distinct from gameplay room tags
 * (`combat` / `traversal` / … in room-archetypes.ts).
 *
 * A "Castle Library" must change geometry (galleries, shelves, ladders), not only
 * sprinkle bookshelf props into a generic box.
 */

export type EnvironmentArchetypeId =
  | 'castle_hall'
  | 'library'
  | 'armory'
  | 'chapel'
  | 'clock_tower'
  | 'crypt'
  | 'cathedral'
  | 'dungeon'
  | 'laboratory'
  | 'cavern'
  | 'forest'
  | 'garden'
  | 'observatory'
  | 'sewer'
  | 'village'
  | 'generic_chamber';

export type RoomPurposeId =
  | 'traversal'
  | 'combat'
  | 'exploration'
  | 'puzzle'
  | 'narrative'
  | 'reward'
  | 'ability_test'
  | 'boss'
  | 'transition'
  | 'safe'
  | 'secret';

export interface EnvironmentArchetype {
  id: EnvironmentArchetypeId;
  displayName: string;
  architectureTags: string[];
  structuralFeatures: string[];
  requiredProps: string[];
  optionalProps: string[];
  lightingProfile: string;
  materialProfile: string[];
  /** Prefer vertical stacks (tower/library) vs long halls. */
  verticality: 'low' | 'medium' | 'high';
  /** Screen spans: 1 = single camera frame; 2–4 = multi-screen major space. */
  typicalScreenSpan: { horizontal: number; vertical: number };
  gameplayPatterns: string[];
  decorationDensity: 'sparse' | 'moderate' | 'dense';
  landmarkTypes: string[];
  /** Minimum tile width/height for MajorRoom assembly (side-view). */
  minTileSize: { width: number; height: number };
  /** Perspective-specific layout rules (aisles, corridor width, wall depth). */
  perspectiveOverrides?: {
    TOP_DOWN?: {
      aisleWidthTiles: number;
      corridorWidthTiles: number;
      obstacleSpacingTiles: number;
      wallDepthTiles: number;
      navigationClearanceTiles: number;
      landmarkNorthBias: boolean;
    };
    SIDE_VIEW?: {
      platformBands: number;
      balconyRows: number;
    };
  };
}

export const ENVIRONMENT_ARCHETYPES: Record<EnvironmentArchetypeId, EnvironmentArchetype> = {
  castle_hall: {
    id: 'castle_hall',
    displayName: 'Castle Great Hall',
    architectureTags: ['vaulted_ceiling', 'arches', 'pillars', 'banners', 'ceremonial_scale'],
    structuralFeatures: ['upper_balcony', 'main_floor', 'side_chambers', 'large_doorways'],
    requiredProps: ['banner', 'chandelier', 'statue', 'pillar'],
    optionalProps: ['portrait', 'armor_stand', 'carpet'],
    lightingProfile: 'chandelier_moonlit',
    materialProfile: ['dark_stone', 'carved_wood', 'iron', 'brass'],
    verticality: 'medium',
    typicalScreenSpan: { horizontal: 3, vertical: 2 },
    gameplayPatterns: ['open_melee', 'balcony_archers', 'chandelier_hazard'],
    decorationDensity: 'moderate',
    landmarkTypes: ['throne_dais', 'great_door', 'central_chandelier'],
    minTileSize: { width: 96, height: 36 },
    perspectiveOverrides: {
      TOP_DOWN: {
        aisleWidthTiles: 3,
        corridorWidthTiles: 3,
        obstacleSpacingTiles: 5,
        wallDepthTiles: 1,
        navigationClearanceTiles: 2,
        landmarkNorthBias: true,
      },
      SIDE_VIEW: { platformBands: 2, balconyRows: 1 },
    },
  },
  library: {
    id: 'library',
    displayName: 'Castle Library',
    architectureTags: ['tall_shelves', 'galleries', 'reading_alcoves', 'ladders'],
    structuralFeatures: ['upper_gallery', 'main_archive', 'restricted_section', 'ladder_routes'],
    requiredProps: ['bookshelf', 'reading_table', 'ladder', 'lectern'],
    optionalProps: ['book_pile', 'candle', 'rolling_ladder', 'secret_bookcase'],
    lightingProfile: 'candle_clerestory',
    materialProfile: ['dark_stone', 'carved_wood', 'parchment', 'brass'],
    verticality: 'high',
    typicalScreenSpan: { horizontal: 2, vertical: 3 },
    gameplayPatterns: ['vertical_shelves', 'ladder_traversal', 'hidden_book_switch'],
    decorationDensity: 'dense',
    landmarkTypes: ['central_stacks', 'stained_window', 'restricted_door'],
    minTileSize: { width: 64, height: 48 },
    perspectiveOverrides: {
      TOP_DOWN: {
        aisleWidthTiles: 2,
        corridorWidthTiles: 2,
        obstacleSpacingTiles: 3,
        wallDepthTiles: 1,
        navigationClearanceTiles: 2,
        landmarkNorthBias: false,
      },
      SIDE_VIEW: { platformBands: 3, balconyRows: 2 },
    },
  },
  armory: {
    id: 'armory',
    displayName: 'Armory',
    architectureTags: ['weapon_racks', 'training_floor', 'storage_bays'],
    structuralFeatures: ['weapon_hall', 'storage', 'training_floor'],
    requiredProps: ['weapon_rack', 'armor_stand', 'training_dummy'],
    optionalProps: ['shield_wall', 'crate', 'anvil'],
    lightingProfile: 'torch_practical',
    materialProfile: ['dark_stone', 'iron', 'leather'],
    verticality: 'low',
    typicalScreenSpan: { horizontal: 2, vertical: 1 },
    gameplayPatterns: ['melee_training', 'rack_cover'],
    decorationDensity: 'moderate',
    landmarkTypes: ['master_rack', 'forge_nook'],
    minTileSize: { width: 72, height: 28 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 2, balconyRows: 1 },
    },
  },
  chapel: {
    id: 'chapel',
    displayName: 'Chapel',
    architectureTags: ['nave', 'altar', 'stained_glass', 'pews'],
    structuralFeatures: ['nave', 'side_aisles', 'choir', 'crypt_access'],
    requiredProps: ['altar', 'pew', 'candle', 'stained_window'],
    optionalProps: ['holy_symbol', 'offering', 'choir_stall'],
    lightingProfile: 'stained_glass_shafts',
    materialProfile: ['pale_stone', 'colored_glass', 'wood'],
    verticality: 'high',
    typicalScreenSpan: { horizontal: 2, vertical: 2 },
    gameplayPatterns: ['safe_sanctuary', 'vertical_light_wells'],
    decorationDensity: 'moderate',
    landmarkTypes: ['altar', 'rose_window'],
    minTileSize: { width: 64, height: 40 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 2, balconyRows: 1 },
    },
  },
  clock_tower: {
    id: 'clock_tower',
    displayName: 'Clock Tower',
    architectureTags: ['vertical_shaft', 'gears', 'platforms', 'pendulum'],
    structuralFeatures: ['shaft', 'gear_gallery', 'bell_chamber', 'maintenance_catwalk'],
    requiredProps: ['gear', 'pendulum', 'platform', 'ladder'],
    optionalProps: ['clock_face', 'counterweight', 'oil_can'],
    lightingProfile: 'mechanical_sparks',
    materialProfile: ['brass', 'iron', 'stone'],
    verticality: 'high',
    typicalScreenSpan: { horizontal: 1, vertical: 4 },
    gameplayPatterns: ['moving_platforms', 'gear_hazards', 'vertical_ascent'],
    decorationDensity: 'sparse',
    landmarkTypes: ['great_gear', 'bell'],
    minTileSize: { width: 32, height: 72 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 4, balconyRows: 3 },
    },
  },
  crypt: {
    id: 'crypt',
    displayName: 'Crypt',
    architectureTags: ['low_ceilings', 'tomb_alcoves', 'tight_corridors'],
    structuralFeatures: ['burial_chamber', 'ossuary', 'sealed_tomb', 'narrow_tunnel'],
    requiredProps: ['sarcophagus', 'torch', 'bone_pile'],
    optionalProps: ['chain', 'seal', 'urn'],
    lightingProfile: 'torch_gloom',
    materialProfile: ['damp_stone', 'bone', 'iron'],
    verticality: 'low',
    typicalScreenSpan: { horizontal: 2, vertical: 1 },
    gameplayPatterns: ['narrow_tunnels', 'breakable_walls', 'traps'],
    decorationDensity: 'sparse',
    landmarkTypes: ['lord_tomb', 'sealed_door'],
    minTileSize: { width: 56, height: 24 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 1, balconyRows: 0 },
    },
  },
  cathedral: {
    id: 'cathedral',
    displayName: 'Cathedral',
    architectureTags: ['nave', 'transept', 'flying_buttress', 'rose_window'],
    structuralFeatures: ['nave', 'side_aisles', 'transept', 'altar'],
    requiredProps: ['column', 'stained_window', 'pew', 'altar'],
    optionalProps: ['chandelier', 'choir', 'statue'],
    lightingProfile: 'stained_glass_shafts',
    materialProfile: ['pale_stone', 'colored_glass', 'gold'],
    verticality: 'high',
    typicalScreenSpan: { horizontal: 3, vertical: 3 },
    gameplayPatterns: ['open_ceremony', 'balcony_routes'],
    decorationDensity: 'moderate',
    landmarkTypes: ['altar', 'rose_window'],
    minTileSize: { width: 96, height: 48 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 3, balconyRows: 2 },
    },
  },
  dungeon: {
    id: 'dungeon',
    displayName: 'Dungeon',
    architectureTags: ['cells', 'iron_gates', 'stone_corridors'],
    structuralFeatures: ['cell_block', 'guard_post', 'torture_nook'],
    requiredProps: ['cell_door', 'chain', 'torch'],
    optionalProps: ['bucket', 'straw', 'key_hook'],
    lightingProfile: 'torch_gloom',
    materialProfile: ['damp_stone', 'iron'],
    verticality: 'low',
    typicalScreenSpan: { horizontal: 2, vertical: 1 },
    gameplayPatterns: ['gated_cells', 'patrol_routes'],
    decorationDensity: 'sparse',
    landmarkTypes: ['gate', 'warden_desk'],
    minTileSize: { width: 48, height: 24 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 2, balconyRows: 1 },
    },
  },
  laboratory: {
    id: 'laboratory',
    displayName: 'Laboratory',
    architectureTags: ['workbenches', 'glassware', 'pipes'],
    structuralFeatures: ['main_lab', 'storage', 'observation_gallery'],
    requiredProps: ['workbench', 'flask', 'pipe'],
    optionalProps: ['specimen', 'chalkboard', 'crane'],
    lightingProfile: 'arc_lamp',
    materialProfile: ['tile', 'brass', 'glass'],
    verticality: 'medium',
    typicalScreenSpan: { horizontal: 2, vertical: 2 },
    gameplayPatterns: ['hazard_vats', 'switch_puzzles'],
    decorationDensity: 'dense',
    landmarkTypes: ['central_apparatus'],
    minTileSize: { width: 64, height: 32 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 3, balconyRows: 2 },
    },
  },
  cavern: {
    id: 'cavern',
    displayName: 'Cavern',
    architectureTags: ['natural_stone', 'stalactites', 'water'],
    structuralFeatures: ['main_chamber', 'ledge', 'pool', 'narrow_crawl'],
    requiredProps: ['stalagmite', 'crystal', 'pool'],
    optionalProps: ['bridge', 'nest', 'ore'],
    lightingProfile: 'biolume_shafts',
    materialProfile: ['limestone', 'water', 'crystal'],
    verticality: 'high',
    typicalScreenSpan: { horizontal: 2, vertical: 3 },
    gameplayPatterns: ['natural_verticality', 'grapple_anchors', 'water'],
    decorationDensity: 'sparse',
    landmarkTypes: ['crystal_cluster', 'waterfall'],
    minTileSize: { width: 64, height: 48 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 3, balconyRows: 2 },
    },
  },
  forest: {
    id: 'forest',
    displayName: 'Forest Clearing',
    architectureTags: ['trees', 'canopy', 'roots'],
    structuralFeatures: ['clearing', 'canopy_route', 'root_tunnel'],
    requiredProps: ['tree', 'root', 'fern'],
    optionalProps: ['shrine', 'fallen_log', 'camp'],
    lightingProfile: 'dappled_canopy',
    materialProfile: ['bark', 'moss', 'soil'],
    verticality: 'medium',
    typicalScreenSpan: { horizontal: 2, vertical: 2 },
    gameplayPatterns: ['canopy_traversal', 'root_hazards'],
    decorationDensity: 'moderate',
    landmarkTypes: ['ancient_tree', 'stone_circle'],
    minTileSize: { width: 64, height: 36 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 2, balconyRows: 1 },
    },
  },
  garden: {
    id: 'garden',
    displayName: 'Garden',
    architectureTags: ['hedges', 'paths', 'fountains'],
    structuralFeatures: ['main_path', 'hedge_maze', 'gazebo'],
    requiredProps: ['hedge', 'fountain', 'bench'],
    optionalProps: ['statue', 'flower_bed', 'trellis'],
    lightingProfile: 'moonlit_open',
    materialProfile: ['stone', 'vegetation', 'water'],
    verticality: 'low',
    typicalScreenSpan: { horizontal: 2, vertical: 1 },
    gameplayPatterns: ['maze_routes', 'open_combat'],
    decorationDensity: 'dense',
    landmarkTypes: ['fountain', 'gazebo'],
    minTileSize: { width: 72, height: 28 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 1, balconyRows: 0 },
    },
  },
  observatory: {
    id: 'observatory',
    displayName: 'Observatory',
    architectureTags: ['dome', 'telescope', 'star_charts'],
    structuralFeatures: ['dome_chamber', 'stair_ring', 'archive'],
    requiredProps: ['telescope', 'chart_table', 'orrey'],
    optionalProps: ['globe', 'ladder', 'lens'],
    lightingProfile: 'starlight_dome',
    materialProfile: ['stone', 'brass', 'glass'],
    verticality: 'high',
    typicalScreenSpan: { horizontal: 2, vertical: 2 },
    gameplayPatterns: ['circular_traversal', 'height_puzzle'],
    decorationDensity: 'moderate',
    landmarkTypes: ['great_telescope'],
    minTileSize: { width: 56, height: 40 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 3, balconyRows: 2 },
    },
  },
  sewer: {
    id: 'sewer',
    displayName: 'Sewer',
    architectureTags: ['pipes', 'channels', 'grates'],
    structuralFeatures: ['main_channel', 'side_tunnel', 'overflow'],
    requiredProps: ['pipe', 'grate', 'ladder'],
    optionalProps: ['valve', 'slime', 'crate'],
    lightingProfile: 'sickly_glow',
    materialProfile: ['brick', 'slime', 'iron'],
    verticality: 'low',
    typicalScreenSpan: { horizontal: 3, vertical: 1 },
    gameplayPatterns: ['channel_swim', 'grate_gates'],
    decorationDensity: 'sparse',
    landmarkTypes: ['overflow_gate'],
    minTileSize: { width: 80, height: 24 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 2, balconyRows: 1 },
    },
  },
  village: {
    id: 'village',
    displayName: 'Village Interior',
    architectureTags: ['timber_frames', 'hearths', 'shopfronts'],
    structuralFeatures: ['main_room', 'loft', 'cellar'],
    requiredProps: ['table', 'hearth', 'shelf'],
    optionalProps: ['bed', 'counter', 'crate'],
    lightingProfile: 'hearth_warm',
    materialProfile: ['wood', 'plaster', 'thatch'],
    verticality: 'medium',
    typicalScreenSpan: { horizontal: 2, vertical: 2 },
    gameplayPatterns: ['safe_hub', 'npc_dialogue'],
    decorationDensity: 'dense',
    landmarkTypes: ['hearth', 'shop_counter'],
    minTileSize: { width: 48, height: 32 },
    perspectiveOverrides: {
      SIDE_VIEW: { platformBands: 2, balconyRows: 1 },
    },
  },
  generic_chamber: {
    id: 'generic_chamber',
    displayName: 'Chamber',
    architectureTags: ['walls', 'floor', 'ceiling'],
    structuralFeatures: ['main_floor'],
    requiredProps: [],
    optionalProps: ['debris', 'torch'],
    lightingProfile: 'ambient',
    materialProfile: ['stone'],
    verticality: 'low',
    typicalScreenSpan: { horizontal: 1, vertical: 1 },
    gameplayPatterns: ['generic'],
    decorationDensity: 'sparse',
    landmarkTypes: [],
    minTileSize: { width: 32, height: 18 },
  },
};

/** Resolve SIDE_VIEW gallery/balcony intent — defaults from verticality when unset. */
export function sideViewGalleryPlan(envId: EnvironmentArchetypeId): {
  platformBands: number;
  balconyRows: number;
} {
  const env = ENVIRONMENT_ARCHETYPES[envId];
  const sv = env.perspectiveOverrides?.SIDE_VIEW;
  if (sv) return { platformBands: sv.platformBands, balconyRows: sv.balconyRows };
  if (env.verticality === 'high') return { platformBands: 3, balconyRows: 2 };
  if (env.verticality === 'medium') return { platformBands: 2, balconyRows: 1 };
  return { platformBands: 1, balconyRows: 0 };
}

/** Map biome motif / display cues → a default architectural vocabulary. */
export function environmentFamilyForBiome(biomeId: string, biomeDisplayName?: string): EnvironmentArchetypeId[] {
  const key = `${biomeId} ${biomeDisplayName ?? ''}`.toLowerCase();
  if (/foundry|ashen|forge|pouring|quench|conduit/.test(key)) {
    return ['armory', 'laboratory', 'dungeon', 'castle_hall'];
  }
  if (/clock|gear|brass|vault/.test(key)) {
    return ['clock_tower', 'laboratory', 'observatory', 'dungeon'];
  }
  if (/grove|forest|moonlit|garden/.test(key)) {
    return ['forest', 'garden', 'chapel', 'cavern'];
  }
  if (/glass|citadel|cathedral|masonry|drowned|crypt/.test(key)) {
    return ['castle_hall', 'library', 'chapel', 'crypt', 'cathedral'];
  }
  if (/sewer|quench|flood/.test(key)) {
    return ['sewer', 'dungeon', 'crypt', 'cavern'];
  }
  return ['castle_hall', 'library', 'armory', 'chapel', 'clock_tower', 'crypt'];
}

/**
 * Assign a distinct architectural identity per room inside a biome, biased by gameplay archetype.
 * Ensures a gothic-castle test set can include Great Hall / Library / Armory / Chapel / Clock / Crypt
 * without collapsing every room to the same prop kit.
 */
export function assignEnvironmentArchetype(input: {
  roomIndex: number;
  roomCount: number;
  gameplayArchetype: string;
  biomeId: string;
  biomeDisplayName?: string;
  seed: number;
}): EnvironmentArchetypeId {
  const family = environmentFamilyForBiome(input.biomeId, input.biomeDisplayName);
  const gp = input.gameplayArchetype;

  if (gp === 'boss' || gp === 'miniboss' || gp === 'arena') {
    return family.includes('castle_hall') ? 'castle_hall' : family[0]!;
  }
  if (gp === 'save' || gp === 'npc' || gp === 'shop') {
    return family.includes('chapel') ? 'chapel' : family.includes('village') ? 'village' : 'generic_chamber';
  }
  if (gp === 'secret' || gp === 'treasure') {
    return family.includes('crypt') ? 'crypt' : family.includes('library') ? 'library' : family[0]!;
  }
  if (gp === 'puzzle' || gp === 'challenge') {
    return family.includes('clock_tower') ? 'clock_tower' : family.includes('laboratory') ? 'laboratory' : family[0]!;
  }
  if (gp === 'ability_shrine' || gp === 'ability_gate') {
    return family.includes('chapel') ? 'chapel' : family.includes('library') ? 'library' : family[0]!;
  }

  // Spread remaining rooms across the biome's architectural family so identity stays readable.
  const idx = (input.roomIndex * 7 + (input.seed % 11)) % family.length;
  return family[idx]!;
}

export function roomPurposeFromGameplay(gameplayArchetype: string): RoomPurposeId {
  switch (gameplayArchetype) {
    case 'boss':
    case 'miniboss':
      return 'boss';
    case 'combat':
    case 'arena':
    case 'challenge':
      return 'combat';
    case 'puzzle':
      return 'puzzle';
    case 'secret':
      return 'secret';
    case 'treasure':
    case 'ability_shrine':
      return 'reward';
    case 'ability_gate':
      return 'ability_test';
    case 'save':
    case 'npc':
    case 'shop':
    case 'tutorial':
      return 'safe';
    case 'transition':
    case 'connector':
      return 'transition';
    case 'set_piece':
      return 'narrative';
    case 'traversal':
    default:
      return 'traversal';
  }
}

export function majorRoomTileSize(
  envId: EnvironmentArchetypeId,
  baseWidth: number,
  baseHeight: number,
): { width: number; height: number; screenSpanH: number; screenSpanV: number } {
  const env = ENVIRONMENT_ARCHETYPES[envId];
  const width = Math.max(baseWidth, env.minTileSize.width);
  const height = Math.max(baseHeight, env.minTileSize.height);
  return {
    width,
    height,
    screenSpanH: env.typicalScreenSpan.horizontal,
    screenSpanV: env.typicalScreenSpan.vertical,
  };
}

export interface RoomQualityScore {
  semanticReadability: number;
  architecturalConsistency: number;
  biomeConsistency: number;
  traversalQuality: number;
  composition: number;
  propIntegration: number;
  landmarkStrength: number;
  gameplayReadability: number;
  total: number;
}

/** Heuristic score — callers regenerate/repair when total < threshold. */
export function scoreRoomEnvironment(input: {
  environmentArchetype: EnvironmentArchetypeId;
  gameplayArchetype: string;
  width: number;
  height: number;
  hasLandmark: boolean;
  requiredPropHits: number;
  biomeMaterialMatch: boolean;
  hasTraversalPath: boolean;
}): RoomQualityScore {
  const env = ENVIRONMENT_ARCHETYPES[input.environmentArchetype];
  const sizeOk =
    input.width >= env.minTileSize.width * 0.75 && input.height >= env.minTileSize.height * 0.75;
  const semanticReadability = sizeOk ? 80 : 35;
  const architecturalConsistency = input.environmentArchetype === 'generic_chamber' ? 40 : 75;
  const biomeConsistency = input.biomeMaterialMatch ? 85 : 40;
  const traversalQuality = input.hasTraversalPath ? 80 : 20;
  const composition = input.hasLandmark ? 70 : 45;
  const propNeed = Math.max(1, env.requiredProps.length);
  const propIntegration = Math.min(100, Math.round((input.requiredPropHits / propNeed) * 100));
  const landmarkStrength = input.hasLandmark ? 75 : env.landmarkTypes.length === 0 ? 60 : 30;
  const gameplayReadability = input.gameplayArchetype ? 70 : 40;
  const total = Math.round(
    (semanticReadability +
      architecturalConsistency +
      biomeConsistency +
      traversalQuality +
      composition +
      propIntegration +
      landmarkStrength +
      gameplayReadability) /
      8,
  );
  return {
    semanticReadability,
    architecturalConsistency,
    biomeConsistency,
    traversalQuality,
    composition,
    propIntegration,
    landmarkStrength,
    gameplayReadability,
    total,
  };
}

export interface SideViewRoomQuality {
  semanticReadability: number;
  galleryStructure: number;
  architecturalIdentity: number;
  biomeConsistency: number;
  combatReadability: number;
  landmarkStrength: number;
  composition: number;
  silhouetteVariety: number;
  traversalQuality: number;
  decorationIntegration: number;
  total: number;
}

/**
 * Side-view composition heuristic — parallel to scoreTopDownRoom.
 * Callers regenerate/repair when total is chronically low (jumbled box / no galleries).
 */
export function scoreSideViewRoom(input: {
  environmentArchetype: EnvironmentArchetypeId;
  roomPurpose: RoomPurposeId;
  widthTiles: number;
  heightTiles: number;
  platformCount: number;
  uniquePlatformHeights: number;
  galleryBandsAchieved: number;
  hasLandmark: boolean;
  decorationDensity: number;
  traversableAreaRatio: number;
  biomeMaterialMatch: boolean;
  combatBowlOpen: boolean;
}): SideViewRoomQuality {
  const env = ENVIRONMENT_ARCHETYPES[input.environmentArchetype];
  const plan = sideViewGalleryPlan(input.environmentArchetype);
  const sizeOk =
    input.widthTiles >= env.minTileSize.width * 0.75 &&
    input.heightTiles >= env.minTileSize.height * 0.75;
  const semanticReadability =
    sizeOk && input.environmentArchetype !== 'generic_chamber' ? 80 : 40;
  const galleryNeed = Math.max(0, plan.balconyRows);
  const galleryStructure =
    galleryNeed === 0
      ? input.platformCount >= 1
        ? 70
        : 40
      : input.galleryBandsAchieved >= galleryNeed
        ? 90
        : input.galleryBandsAchieved >= 1
          ? 55
          : 25;
  const architecturalIdentity =
    input.environmentArchetype === 'generic_chamber'
      ? 35
      : input.uniquePlatformHeights >= 2 || input.galleryBandsAchieved > 0
        ? 85
        : 45;
  const biomeConsistency = input.biomeMaterialMatch ? 85 : 40;
  const combatReadability =
    input.roomPurpose === 'combat' || input.roomPurpose === 'boss'
      ? input.combatBowlOpen
        ? 85
        : 30
      : 70;
  const landmarkStrength =
    input.hasLandmark || env.landmarkTypes.length === 0 ? 75 : 30;
  const composition =
    input.uniquePlatformHeights >= 2 && input.platformCount >= 2
      ? 80
      : input.platformCount >= 1
        ? 50
        : 25;
  const silhouetteVariety =
    input.uniquePlatformHeights >= 3 ? 85 : input.uniquePlatformHeights >= 2 ? 70 : 35;
  const traversalQuality =
    input.traversableAreaRatio >= 0.35 && input.traversableAreaRatio <= 0.85 ? 85 : 35;
  const densTarget =
    env.decorationDensity === 'dense' ? 0.02 : env.decorationDensity === 'moderate' ? 0.01 : 0.004;
  const decorationIntegration =
    input.decorationDensity >= densTarget
      ? 80
      : input.decorationDensity >= densTarget * 0.4
        ? 50
        : 20;
  const total = Math.round(
    (semanticReadability +
      galleryStructure +
      architecturalIdentity +
      biomeConsistency +
      combatReadability +
      landmarkStrength +
      composition +
      silhouetteVariety +
      traversalQuality +
      decorationIntegration) /
      10,
  );
  return {
    semanticReadability,
    galleryStructure,
    architecturalIdentity,
    biomeConsistency,
    combatReadability,
    landmarkStrength,
    composition,
    silhouetteVariety,
    traversalQuality,
    decorationIntegration,
    total,
  };
}

export interface TopDownRoomQuality {
  semanticReadability: number;
  navigationQuality: number;
  architecturalIdentity: number;
  biomeConsistency: number;
  combatReadability: number;
  landmarkStrength: number;
  composition: number;
  propPlacement: number;
  collisionReadability: number;
  explorationValue: number;
  total: number;
}

/** Heuristic for top-down / three-quarter spaces — regenerate when total is low. */
export function scoreTopDownRoom(input: {
  environmentArchetype: EnvironmentArchetypeId;
  roomPurpose: RoomPurposeId;
  widthTiles: number;
  heightTiles: number;
  walkableRatio: number;
  hasNorthLandmark: boolean;
  aisleCount: number;
  biomeMaterialMatch: boolean;
  criticalPathClear: boolean;
  combatOpenSpace: boolean;
}): TopDownRoomQuality {
  const env = ENVIRONMENT_ARCHETYPES[input.environmentArchetype];
  const td = env.perspectiveOverrides?.TOP_DOWN;
  const minW = td ? Math.max(16, env.minTileSize.width / 2) : 12;
  const minH = td ? Math.max(12, env.minTileSize.height / 2) : 10;
  const semanticReadability =
    input.widthTiles >= minW && input.heightTiles >= minH && input.environmentArchetype !== 'generic_chamber'
      ? 80
      : 40;
  const navigationQuality = input.criticalPathClear && input.walkableRatio >= 0.35 && input.walkableRatio <= 0.85 ? 85 : 35;
  const architecturalIdentity = input.environmentArchetype === 'generic_chamber' ? 35 : input.aisleCount > 0 || input.hasNorthLandmark ? 80 : 55;
  const biomeConsistency = input.biomeMaterialMatch ? 85 : 40;
  const combatReadability =
    input.roomPurpose === 'combat' || input.roomPurpose === 'boss'
      ? input.combatOpenSpace
        ? 80
        : 30
      : 70;
  const landmarkStrength = input.hasNorthLandmark || env.landmarkTypes.length === 0 ? 75 : 35;
  const composition = input.aisleCount >= 1 || input.hasNorthLandmark ? 75 : 45;
  const propPlacement = input.walkableRatio < 0.9 ? 70 : 40;
  const collisionReadability = input.criticalPathClear ? 80 : 25;
  const explorationValue = input.roomPurpose === 'exploration' || input.roomPurpose === 'secret' ? 75 : 55;
  const total = Math.round(
    (semanticReadability +
      navigationQuality +
      architecturalIdentity +
      biomeConsistency +
      combatReadability +
      landmarkStrength +
      composition +
      propPlacement +
      collisionReadability +
      explorationValue) /
      10,
  );
  return {
    semanticReadability,
    navigationQuality,
    architecturalIdentity,
    biomeConsistency,
    combatReadability,
    landmarkStrength,
    composition,
    propPlacement,
    collisionReadability,
    explorationValue,
    total,
  };
}
