import type { EnvironmentKit, EnvironmentKitItem, EnvironmentKitScale, BiomeVisualDNA, VisualDNA } from '@metroforge/schemas';
import { SeededRNG } from '../rng.js';

const PROFILE_SCALE: Record<string, EnvironmentKitScale> = {
  TINY_TEST: {
    terrainFamilies: 2,
    architecturalElements: 3,
    environmentProps: 4,
    decorativeProps: 3,
    foregroundElements: 2,
    midgroundElements: 2,
    backgroundMotifs: 2,
    lightingElements: 2,
    ambientVfx: 1,
  },
  VISUAL_VERTICAL_SLICE: {
    terrainFamilies: 3,
    architecturalElements: 8,
    environmentProps: 12,
    decorativeProps: 8,
    foregroundElements: 4,
    midgroundElements: 4,
    backgroundMotifs: 3,
    lightingElements: 4,
    ambientVfx: 3,
  },
  SMALL: {
    terrainFamilies: 3,
    architecturalElements: 8,
    environmentProps: 12,
    decorativeProps: 8,
    foregroundElements: 4,
    midgroundElements: 4,
    backgroundMotifs: 3,
    lightingElements: 4,
    ambientVfx: 3,
  },
  MEDIUM: {
    terrainFamilies: 4,
    architecturalElements: 10,
    environmentProps: 16,
    decorativeProps: 10,
    foregroundElements: 5,
    midgroundElements: 5,
    backgroundMotifs: 4,
    lightingElements: 5,
    ambientVfx: 4,
  },
  LARGE: {
    terrainFamilies: 5,
    architecturalElements: 12,
    environmentProps: 20,
    decorativeProps: 12,
    foregroundElements: 6,
    midgroundElements: 6,
    backgroundMotifs: 5,
    lightingElements: 6,
    ambientVfx: 5,
  },
  RELEASE_CANDIDATE: {
    terrainFamilies: 4,
    architecturalElements: 10,
    environmentProps: 16,
    decorativeProps: 10,
    foregroundElements: 5,
    midgroundElements: 5,
    backgroundMotifs: 4,
    lightingElements: 5,
    ambientVfx: 4,
  },
};

function item(
  id: string,
  family: string,
  role: string,
  description: string,
  placement: EnvironmentKitItem['placement'],
  rarity: EnvironmentKitItem['rarity'],
  weight: number,
): EnvironmentKitItem {
  return { id, family, role, description, placement, rarity, weight };
}

function take<T>(arr: T[], count: number, rng: SeededRNG, fallback: T): T[] {
  if (arr.length === 0) return Array.from({ length: count }, () => fallback);
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(arr[i % arr.length] ?? rng.pick(arr) ?? fallback);
  return out;
}

export function environmentKitScaleFor(profile: string): EnvironmentKitScale {
  return PROFILE_SCALE[profile] ?? PROFILE_SCALE.SMALL!;
}

export function generateEnvironmentKit(input: {
  visualDNA: VisualDNA;
  biome: BiomeVisualDNA;
  profile: string;
  seed: number;
}): EnvironmentKit {
  const scale = environmentKitScaleFor(input.profile);
  const rng = new SeededRNG((input.seed + hashId(input.biome.biomeId)) >>> 0 || 1);
  const terrainNames = take(
    input.biome.terrainMaterials.map((m) => m.name),
    scale.terrainFamilies,
    rng,
    'masonry',
  );
  const arch = take(input.biome.architecturalFamilies, scale.architecturalElements, rng, 'arch');
  const props = take(input.biome.propFamilies, scale.environmentProps, rng, 'debris');
  const decorPool = [...input.biome.foregroundLanguage, ...input.biome.organicMaterials.map((m) => m.name)];
  const decor = take(decorPool, scale.decorativeProps, rng, 'moss');
  const fore = take(input.biome.foregroundLanguage, scale.foregroundElements, rng, 'pillar');
  const mid = take(input.biome.midgroundLanguage, scale.midgroundElements, rng, 'ruin mass');
  const back = take(input.biome.backgroundLanguage, scale.backgroundMotifs, rng, 'skyline');
  const lights = take(input.biome.lighting.sources, scale.lightingElements, rng, 'lantern');

  return {
    biomeId: input.biome.biomeId,
    styleFingerprint: input.biome.styleFingerprint,
    scale,
    terrain: terrainNames.map((name, i) =>
      item(`${input.biome.biomeId}_terrain_${i}`, name, 'terrain', `${name} walkable family`, 'floor', 'common', 1),
    ),
    architecture: arch.map((name, i) =>
      item(`${input.biome.biomeId}_arch_${i}`, name, 'architecture', name, i % 2 === 0 ? 'wall' : 'midground', 'common', 0.8),
    ),
    props: props.map((name, i) =>
      item(
        `${input.biome.biomeId}_prop_${i}`,
        name,
        'prop',
        `${name} environmental prop`,
        'floor',
        i > 8 ? 'rare' : i > 4 ? 'uncommon' : 'common',
        i > 8 ? 0.15 : i > 4 ? 0.4 : 1,
      ),
    ),
    decorations: decor.map((name, i) =>
      item(`${input.biome.biomeId}_decor_${i}`, name, 'decoration', name, 'wall', 'common', 0.6),
    ),
    interactables: ['shrine', 'container', 'save_bell', 'signage'].slice(0, Math.max(2, Math.floor(scale.environmentProps / 4))).map((name, i) =>
      item(`${input.biome.biomeId}_interact_${i}`, name, 'interactable', name, 'floor', 'uncommon', 0.35),
    ),
    foreground: fore.map((name, i) =>
      item(`${input.biome.biomeId}_fg_${i}`, name, 'foreground', name, 'foreground', 'common', 0.5),
    ),
    midground: mid.map((name, i) =>
      item(`${input.biome.biomeId}_mg_${i}`, name, 'midground', name, 'midground', 'common', 0.7),
    ),
    backgrounds: back.map((name, i) =>
      item(`${input.biome.biomeId}_bg_${i}`, name, 'background', name, 'background', 'common', 1),
    ),
    lighting: lights.map((name, i) =>
      item(`${input.biome.biomeId}_light_${i}`, name, 'light', name, i % 2 === 0 ? 'wall' : 'air', 'uncommon', 0.4),
    ),
    ambientVfx: Array.from({ length: scale.ambientVfx }, (_, i) =>
      item(
        `${input.biome.biomeId}_amb_${i}`,
        input.biome.ambientVfx,
        'ambient',
        `${input.biome.ambientVfx} motes`,
        'air',
        'common',
        1,
      ),
    ),
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
