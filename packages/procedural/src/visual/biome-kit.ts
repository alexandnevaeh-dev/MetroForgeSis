import type { EnvironmentKit } from '@metroforge/schemas';

export interface BiomeKitSurfaceSet {
  floor: string[];
  wall: string[];
  ceiling: string[];
  platform: string[];
}

export interface BiomeKit {
  id: string;
  palette: string[];
  surfaces: BiomeKitSurfaceSet;
  transitions: string[];
  architecturalPieces: string[];
  structuralProps: string[];
  decorativeProps: string[];
  foreground: string[];
  background: string[];
  lightingPresets: string[];
  atmospherePresets: string[];
  encounterDecor: string[];
}

/** Adapter over EnvironmentKit so composition can pick biome-locked modules. */
export function biomeKitFromEnvironment(kit: EnvironmentKit, palette: string[]): BiomeKit {
  const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);
  return {
    id: kit.biomeId,
    palette,
    surfaces: {
      floor: ['ground', 'ground_wear', 'ground_moss', 'ground_crack', 'top_edge', 'bottom_edge'],
      wall: ['wall', 'wall_wear', 'wall_moss', 'left_edge', 'right_edge'],
      ceiling: ['ceiling', 'ceiling_wear', 'ceiling_moss'],
      platform: ['platform', 'platform_left', 'platform_right', 'platform_wear', 'one_way'],
    },
    transitions: ['outside_tl', 'outside_tr', 'outside_bl', 'outside_br', 'inside_tl', 'inside_tr', 'inside_bl', 'inside_br'],
    architecturalPieces: ids(kit.architecture),
    structuralProps: ids(kit.props.filter((p) => p.placement === 'wall' || p.placement === 'floor' || p.role.includes('struct'))),
    decorativeProps: ids(kit.decorations),
    foreground: ids(kit.foreground),
    background: ids(kit.backgrounds),
    lightingPresets: ids(kit.lighting),
    atmospherePresets: ids(kit.ambientVfx),
    encounterDecor: ids(kit.interactables),
  };
}
