export interface GeometryRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RoomArchetypeId =
  | 'traversal'
  | 'combat'
  | 'vertical_ascent'
  | 'vertical_descent'
  | 'connector'
  | 'hub'
  | 'puzzle'
  | 'secret'
  | 'treasure'
  | 'ability_gate'
  | 'ability_shrine'
  | 'save'
  | 'npc'
  | 'shop'
  | 'set_piece'
  | 'arena'
  | 'boss_approach'
  | 'boss'
  | 'miniboss'
  | 'escape'
  | 'sanctuary'
  | 'tutorial'
  | 'challenge'
  | 'transition';

export type TraversalSegmentType =
  | 'walk'
  | 'jump'
  | 'precision_jump'
  | 'drop'
  | 'wall_climb'
  | 'wall_jump'
  | 'dash'
  | 'double_jump'
  | 'grapple'
  | 'swim'
  | 'hazard_crossing'
  | 'combat_traversal';

export type PlatformVisualStrategy =
  | 'embedded'
  | 'supported'
  | 'suspended'
  | 'natural'
  | 'floating_magic'
  | 'mechanical'
  | 'ruined';

export type LandmarkImportance = 'minor' | 'room_defining' | 'biome_defining' | 'world_defining';

export interface TraversalSegment {
  type: TraversalSegmentType;
  start: { x: number; y: number };
  end: { x: number; y: number };
  difficulty: number;
  abilityRequirement?: string;
  optional?: boolean;
}

export interface LightingPlan {
  ambientColor: string;
  ambientIntensity: number;
  keyLights: Array<{ x: number; y: number; energy: number }>;
  accentLights: Array<{ x: number; y: number; energy: number }>;
  gameplayLights: Array<{ x: number; y: number; energy: number }>;
  focalPoint?: { x: number; y: number };
  playerContrastTarget: number;
}

export interface AtmospherePlan {
  fogAlpha: number;
  particles: 'dust' | 'embers' | 'mist' | 'none';
}

export interface LandmarkPlan {
  id: string;
  importance: LandmarkImportance;
  x: number;
  y: number;
  kind: string;
}

export interface RoomVisualIntent {
  depthLayers: string[];
  platformStrategy: PlatformVisualStrategy;
  negativeSpaceReason?: string;
  composedAsBossArena: boolean;
  openPlayableAir: boolean;
}

export interface RoomBlueprint {
  id: string;
  biomeId: string;
  archetype: RoomArchetypeId | string;
  dimensions: { width: number; height: number };
  seeds: {
    worldSeed: number;
    roomSeed: number;
    compositionSeed: number;
    dressingSeed: number;
    encounterSeed: number;
    lightingSeed: number;
  };
  traversal: TraversalSegment[];
  composition: {
    platformStrategy: PlatformVisualStrategy;
    architecturalMotifs: string[];
  };
  encounters: { intent: string };
  lighting: LightingPlan;
  atmosphere: AtmospherePlan;
  landmarks: LandmarkPlan[];
  visualIntent: RoomVisualIntent;
}

export function mapArchetypeToIntent(archetype: string): RoomArchetypeId | string {
  if (archetype === 'boss') return 'boss';
  if (archetype === 'traversal') return 'traversal';
  if (archetype === 'tutorial') return 'tutorial';
  return archetype;
}

export function defaultLightingPlan(archetype: string, width: number, height: number): LightingPlan {
  const boss = archetype === 'boss' || archetype === 'miniboss';
  return {
    ambientColor: boss ? '#1a2230' : '#243040',
    ambientIntensity: boss ? 0.72 : 0.88,
    keyLights: [{ x: Math.round(width * 0.22), y: Math.round(height * 0.28), energy: boss ? 1.4 : 1.05 }],
    accentLights: [{ x: Math.round(width * 0.7), y: Math.round(height * 0.55), energy: 0.7 }],
    gameplayLights: [{ x: Math.round(width * 0.5), y: Math.round(height * 0.62), energy: 0.85 }],
    focalPoint: boss ? { x: Math.round(width * 0.5), y: Math.round(height * 0.42) } : undefined,
    playerContrastTarget: 0.28,
  };
}

export function traversalFromGeometry(
  platforms: GeometryRect[],
  pits: GeometryRect[],
  floorTop: number,
  archetype: string,
): TraversalSegment[] {
  const segments: TraversalSegment[] = [{ type: 'walk', start: { x: 0, y: floorTop }, end: { x: 64, y: floorTop }, difficulty: 1 }];
  if (pits.length > 0) {
    segments.push({
      type: archetype === 'challenge' ? 'precision_jump' : 'jump',
      start: { x: pits[0]!.x, y: floorTop },
      end: { x: pits[0]!.x + pits[0]!.width, y: floorTop },
      difficulty: 3,
    });
  }
  for (const platform of platforms) {
    segments.push({
      type: 'jump',
      start: { x: platform.x, y: floorTop },
      end: { x: platform.x, y: platform.y },
      difficulty: 2,
    });
  }
  if (archetype === 'traversal') {
    segments.push({ type: 'wall_climb', start: { x: 80, y: floorTop }, end: { x: 80, y: floorTop - 160 }, difficulty: 3 });
  }
  return segments;
}

export function platformStrategyFor(archetype: string, biomeFamily?: string): PlatformVisualStrategy {
  if (archetype === 'boss' || archetype === 'miniboss') return 'mechanical';
  if (archetype === 'secret' || archetype === 'treasure') return 'ruined';
  if (archetype === 'npc' || archetype === 'save' || archetype === 'shop') return 'embedded';
  if (biomeFamily === 'organic') return 'natural';
  if (archetype === 'traversal' || archetype === 'challenge') return 'supported';
  return 'supported';
}
