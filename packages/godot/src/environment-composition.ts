import type { GameDNA, StyleBible } from '@metroforge/schemas';
import { SeededRNG } from '@metroforge/procedural';

export type CompositionLayerId =
  | 'sky'
  | 'far_background'
  | 'far_architecture'
  | 'parallax_mid'
  | 'parallax_near'
  | 'playable_terrain'
  | 'terrain_overlay'
  | 'structural_props'
  | 'decorative_props'
  | 'vegetation'
  | 'interactive_props'
  | 'characters'
  | 'vfx'
  | 'foreground_occluder'
  | 'fog'
  | 'lighting';

export interface CompositionLayer {
  id: CompositionLayerId;
  zIndex: number;
  motionScale: [number, number];
  assetPath?: string;
  modulate: [number, number, number, number];
  required: boolean;
}

export interface BiomeCompositionRule {
  biomeId: string;
  fogAlpha: number;
  lightingEnergy: number;
  vegetationDensity: number;
  architectureMotif: string;
  ambientVfx: 'dust' | 'embers' | 'mist' | 'none';
}

export interface EnvironmentCompositionSpec {
  styleId: string;
  artStyle: string;
  biomeId: string;
  archetype: string;
  seed: number;
  layers: CompositionLayer[];
  biome: BiomeCompositionRule;
  ambientParticles: boolean;
  foregroundCoverage: number;
}

const LAYER_ORDER: Array<{ id: CompositionLayerId; z: number; motion: [number, number] }> = [
  { id: 'sky', z: -20, motion: [0.02, 0.01] },
  { id: 'far_background', z: -16, motion: [0.12, 0.04] },
  { id: 'far_architecture', z: -14, motion: [0.18, 0.06] },
  { id: 'parallax_mid', z: -10, motion: [0.4, 0.12] },
  { id: 'parallax_near', z: -8, motion: [0.75, 0.2] },
  { id: 'playable_terrain', z: 0, motion: [1, 1] },
  { id: 'terrain_overlay', z: 1, motion: [1, 1] },
  { id: 'structural_props', z: 2, motion: [1, 1] },
  { id: 'decorative_props', z: -2, motion: [0.9, 0.9] },
  { id: 'vegetation', z: -1, motion: [0.92, 0.92] },
  { id: 'interactive_props', z: 4, motion: [1, 1] },
  { id: 'characters', z: 5, motion: [1, 1] },
  { id: 'vfx', z: 80, motion: [1, 1] },
  { id: 'foreground_occluder', z: 12, motion: [1.15, 1.05] },
  { id: 'fog', z: 6, motion: [0.3, 0.1] },
  { id: 'lighting', z: 8, motion: [1, 1] },
];

const BIOME_MOTIFS = ['ashen stone', 'glass lantern iron', 'drowned masonry', 'clockwork brass', 'moonlit moss'];

export function biomeCompositionRule(biomeIndex: number, seed: number): BiomeCompositionRule {
  const rng = new SeededRNG((seed + biomeIndex * 7919) >>> 0 || 1);
  const motifs = BIOME_MOTIFS;
  return {
    biomeId: `biome_${biomeIndex}`,
    fogAlpha: 0.08 + (biomeIndex % 3) * 0.04,
    lightingEnergy: 0.85 + (biomeIndex % 2) * 0.2,
    vegetationDensity: rng.next() * 0.4 + 0.15,
    architectureMotif: motifs[biomeIndex % motifs.length]!,
    ambientVfx: biomeIndex % 3 === 0 ? 'dust' : biomeIndex % 3 === 1 ? 'mist' : 'embers',
  };
}

export function composeEnvironment(input: {
  gameDna: GameDNA;
  styleBible?: StyleBible;
  biomeIndex: number;
  archetype: string;
  seed: number;
  textureExists: (rel: string) => boolean;
}): EnvironmentCompositionSpec {
  const artStyle = input.styleBible?.artStyle ?? input.styleBible?.renderingStyle ?? 'readable 2D pixel art';
  const biome = biomeCompositionRule(input.biomeIndex, input.seed);
  const far = `assets/backgrounds/${biome.biomeId}/far.png`;
  const mid = `assets/backgrounds/${biome.biomeId}/mid.png`;
  const near = `assets/backgrounds/${biome.biomeId}/near.png`;
  const overlay = `assets/backgrounds/${biome.biomeId}/overlay.png`;
  const foreground = `assets/backgrounds/${biome.biomeId}/foreground.png`;
  const exists = input.textureExists;
  const layers: CompositionLayer[] = LAYER_ORDER.map((def) => {
    let assetPath: string | undefined;
    if (def.id === 'far_background' && exists(far)) assetPath = far;
    if (def.id === 'parallax_mid' && exists(mid)) assetPath = mid;
    if (def.id === 'parallax_near' && exists(near)) assetPath = near;
    if (def.id === 'terrain_overlay' && exists(overlay)) assetPath = overlay;
    if (def.id === 'foreground_occluder' && exists(foreground)) assetPath = foreground;
    const a = def.id === 'fog' || def.id === 'terrain_overlay' ? 0.35 : def.id === 'foreground_occluder' ? 0.7 : 1;
    return {
      id: def.id,
      zIndex: def.z,
      motionScale: def.motion,
      assetPath,
      modulate: [1, 1, 1, a],
      required: def.id === 'playable_terrain' || def.id === 'characters',
    };
  });
  return {
    styleId: input.styleBible?.styleId ?? artStyle,
    artStyle,
    biomeId: biome.biomeId,
    archetype: input.archetype,
    seed: input.seed,
    layers,
    biome,
    ambientParticles: biome.ambientVfx !== 'none',
    foregroundCoverage: exists(foreground) ? 0.18 : 0,
  };
}
