import type { BiomeVisualDNA, GameDNA, VisualDNA } from '@metroforge/schemas';
import { SeededRNG } from '../rng.js';
import { resolveVisualStyleTemplate, type VisualStyleTemplate } from './style-registry.js';
import { hashVisualFragment } from './fingerprint.js';

export interface BiomeMotifPack {
  id: string;
  displayName: string;
  architecture: string[];
  terrain: string[];
  organic: string[];
  atmosphere: string;
  foreground: string[];
  midground: string[];
  background: string[];
  props: string[];
}

const BIOME_MOTIF_LIBRARY: BiomeMotifPack[] = [
  {
    id: 'drowned_masonry',
    displayName: 'Drowned Masonry',
    architecture: ['gothic arches', 'collapsed buttresses', 'flooded crypts', 'broken stained glass'],
    terrain: ['eroded limestone', 'silted flagstone', 'wet mortar'],
    organic: ['pale aquatic vines', 'hanging moss'],
    atmosphere: 'cold submerged hush',
    foreground: ['broken pillars', 'chains', 'hanging vegetation'],
    midground: ['arches', 'collapsed masonry'],
    background: ['submerged cathedral silhouettes', 'distant bell towers'],
    props: ['shrine', 'lantern', 'debris', 'pews'],
  },
  {
    id: 'ashen_foundry',
    displayName: 'Ashen Foundry',
    architecture: ['riveted bulkheads', 'furnace mouths', 'catwalk ribs', 'exhaust stacks'],
    terrain: ['sooted iron plate', 'slag brick', 'grated steel'],
    organic: ['heat-wilted cables', 'cinder growth'],
    atmosphere: 'furnace haze',
    foreground: ['hanging chains', 'pipe clusters', 'warning glyphs'],
    midground: ['gear galleries', 'smokestack masses'],
    background: ['foundry skyline', 'ember glow stacks'],
    props: ['anvil', 'crucible', 'debris', 'worklamp'],
  },
  {
    id: 'moonlit_grove',
    displayName: 'Moonlit Grove',
    architecture: ['root-wrapped ruins', 'stone circles', 'overgrown colonnades'],
    terrain: ['mossy basalt', 'leaf-litter stone', 'root lattice'],
    organic: ['silver vines', 'canopy moss', 'spore fans'],
    atmosphere: 'night canopy mist',
    foreground: ['hanging roots', 'fern silhouettes'],
    midground: ['broken shrines', 'tree masses'],
    background: ['moon disk', 'distant grove skyline'],
    props: ['shrine', 'camp', 'fallen statue', 'lantern'],
  },
  {
    id: 'glass_citadel',
    displayName: 'Glass Citadel',
    architecture: ['iron ribs', 'tideglass vaults', 'clerestory halls'],
    terrain: ['glass-inlaid masonry', 'wet slate', 'iron grating'],
    organic: ['salt lichen', 'dripping weed'],
    atmosphere: 'moonlit interior hush',
    foreground: ['iron ribs', 'hanging lanterns'],
    midground: ['vault ribs', 'gallery piers'],
    background: ['citadel silhouette', 'moon through glass'],
    props: ['lantern', 'lectern', 'broken cart', 'chain'],
  },
  {
    id: 'clockwork_vault',
    displayName: 'Clockwork Vault',
    architecture: ['gear halls', 'pendulum wells', 'brass colonnades'],
    terrain: ['brass plate', 'inlaid marble', 'toothed track'],
    organic: ['oil-stained moss', 'dust veils'],
    atmosphere: 'ticking dry air',
    foreground: ['pendulum weights', 'cog clusters'],
    midground: ['clock faces', 'gallery gears'],
    background: ['tower silhouettes', 'orrey glow'],
    props: ['gear pile', 'workbench', 'signage', 'lamp'],
  },
];

function pickMotif(template: VisualStyleTemplate, biomeIndex: number, rng: SeededRNG): BiomeMotifPack {
  const keyed = BIOME_MOTIF_LIBRARY.filter((pack) =>
    template.keywords.some((k) => pack.id.includes(k) || pack.displayName.toLowerCase().includes(k)),
  );
  const pool = keyed.length > 0 ? keyed : BIOME_MOTIF_LIBRARY;
  return pool[(biomeIndex + rng.int(0, pool.length - 1)) % pool.length]!;
}

export function generateBiomeVisualDNA(input: {
  visualDNA: VisualDNA;
  gameDna: GameDNA;
  biomeIndex: number;
  biomeId?: string;
}): BiomeVisualDNA {
  const template = resolveVisualStyleTemplate(input.gameDna.identity.visualStyle);
  const rng = new SeededRNG((input.gameDna.seed + input.biomeIndex * 7919) >>> 0 || 1);
  const motif = pickMotif(template, input.biomeIndex, rng);
  const biomeId = input.biomeId ?? `biome_${input.biomeIndex}`;
  const lighting = {
    ...input.visualDNA.lighting,
    key: template.lighting.key,
    accent: template.lighting.accent,
    sources: template.lighting.sources,
  };
  const ambient = template.ambientPool[input.biomeIndex % template.ambientPool.length] ?? 'dust';
  const dna: BiomeVisualDNA = {
    biomeId,
    displayName: motif.displayName,
    styleFingerprint: '',
    parentFingerprint: input.visualDNA.styleFingerprint,
    paletteOverrides: input.visualDNA.palette,
    architecture: {
      silhouette: motif.architecture[0] ?? input.visualDNA.architecture.silhouette,
      motifs: motif.architecture,
      scale: input.visualDNA.architecture.scale,
      openings: input.visualDNA.architecture.openings,
      ruinLevel: input.visualDNA.architecture.ruinLevel,
    },
    terrainMaterials: input.visualDNA.materials.filter((m) => m.family === 'masonry' || m.family === 'metal'),
    organicMaterials: input.visualDNA.materials.filter((m) => m.family === 'organic' || m.family === 'water'),
    atmosphere: motif.atmosphere,
    lighting,
    fog: {
      color: lighting.fogColor ?? input.visualDNA.palette.shadows[0] ?? '#101018',
      alpha: lighting.fogAlpha ?? 0.12,
    },
    foregroundLanguage: motif.foreground,
    midgroundLanguage: motif.midground,
    backgroundLanguage: motif.background,
    propFamilies: motif.props,
    architecturalFamilies: motif.architecture,
    ambientVfx: ambient,
    forbiddenPatterns: [...input.visualDNA.forbiddenPatterns, 'outdoor landscape photography'],
    promptAnchors: [...input.visualDNA.promptAnchors, motif.displayName, motif.atmosphere],
  };
  dna.styleFingerprint = hashVisualFragment(
    `${input.visualDNA.styleFingerprint}|${biomeId}|${motif.id}|${ambient}|${motif.architecture.join(',')}`,
  );
  return dna;
}

export function generateAllBiomeVisualDNA(input: {
  visualDNA: VisualDNA;
  gameDna: GameDNA;
}): BiomeVisualDNA[] {
  const count = Math.max(1, input.gameDna.world.biomeCount);
  return Array.from({ length: count }, (_, i) =>
    generateBiomeVisualDNA({ visualDNA: input.visualDNA, gameDna: input.gameDna, biomeIndex: i }),
  );
}
