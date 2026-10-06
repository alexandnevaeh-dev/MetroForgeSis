import type { BiomeVisualDNA, GameDNA, VisualDNA } from '@metroforge/schemas';
import { SeededRNG } from '../rng.js';
import { resolveVisualStyleTemplate, styleCueText, type VisualStyleTemplate } from './style-registry.js';
import { hashVisualFragment } from './fingerprint.js';
import { collectBiomeForbiddenTokens } from './biome-consistency.js';

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
  {
    id: 'spore_galleries',
    displayName: 'Spore Galleries',
    architecture: ['mycelium-ribbed halls', 'glowcap colonnades', 'hanging spore curtains'],
    terrain: ['lichen basalt', 'soft mycelium carpets', 'spore-dusted stone'],
    organic: ['tall glowcaps', 'veined mycelium', 'luminescent lichen'],
    atmosphere: 'humid bioluminescent hush',
    foreground: ['spore curtains', 'glowcap stalks', 'hanging roots'],
    midground: ['gallery ribs', 'mushroom terraces'],
    background: ['cavern mouth glow', 'distant spore blooms'],
    props: ['spore_lantern', 'glowcap', 'mycelium_shrine', 'lichen_altar'],
  },
  {
    id: 'glowcap_terraces',
    displayName: 'Glowcap Terraces',
    architecture: ['tiered mushroom platforms', 'hollowed basalt shelves', 'arching root bridges'],
    terrain: ['layered basalt shelves', 'soft cap flesh platforms', 'spore silt'],
    organic: ['giant glowcaps', 'climbing lichen', 'spore fans'],
    atmosphere: 'warm magenta-cyan bloom',
    foreground: ['cap rims', 'spore fans', 'root ladders'],
    midground: ['terrace stacks', 'bridged shelves'],
    background: ['stacked cavern tiers', 'soft underglow'],
    props: ['ladder_root', 'spore_pod', 'cap_bench', 'lantern'],
  },
  {
    id: 'mycelium_depths',
    displayName: 'Mycelium Depths',
    architecture: ['woven mycelium tunnels', 'bulb chambers', 'filament bridges'],
    terrain: ['fibrous mycelium weave', 'damp basalt', 'biofilm slick'],
    organic: ['dense mycelium nets', 'pulsing bulbs', 'dangling filaments'],
    atmosphere: 'deep indigo spore mist',
    foreground: ['filament curtains', 'bulbs', 'dripping biofilm'],
    midground: ['tunnel mouths', 'woven walls'],
    background: ['depth fade', 'faint bulb constellation'],
    props: ['bulb', 'filament_coil', 'spore_cache', 'shrine'],
  },
  {
    id: 'salt_cliff_shrines',
    displayName: 'Salt Cliff Shrines',
    architecture: ['salt-worn cliff temples', 'open shrine facades', 'sea-cliff buttresses'],
    terrain: ['sea-worn sandstone', 'salt-crusted ledges', 'weathered flagstone'],
    organic: ['salt lichen', 'kelp fringe'],
    atmosphere: 'misty coastal hush',
    foreground: ['shrine lanterns', 'broken columns', 'salt crystals'],
    midground: ['temple facades', 'cliff arches'],
    background: ['fog banks', 'distant sea cliffs'],
    props: ['shrine', 'lantern', 'offering_bowl', 'broken_column'],
  },
  {
    id: 'tidepool_galleries',
    displayName: 'Tidepool Galleries',
    architecture: ['flooded colonnade walks', 'tide-cut galleries', 'low sea arches'],
    terrain: ['wet tide-stone', 'slick sandstone', 'pooled flagstone'],
    organic: ['tidepool weed', 'anemone clusters'],
    atmosphere: 'cool tidal echo',
    foreground: ['tide pools', 'dripping weed', 'barnacle clusters'],
    midground: ['gallery piers', 'arched openings'],
    background: ['mist over water', 'cliff silhouette'],
    props: ['tide_pool', 'barnacle_cluster', 'driftwood', 'lantern'],
  },
  {
    id: 'windward_colonnades',
    displayName: 'Windward Colonnades',
    architecture: ['wind-carved colonnades', 'open cliff walkways', 'eroded temple roofs'],
    terrain: ['pitted sandstone', 'wind-scoured stone', 'narrow ledge rock'],
    organic: ['wind-torn lichen', 'sparse cliff grass'],
    atmosphere: 'bright wind and thin mist',
    foreground: ['column drums', 'wind banners', 'ledge grass'],
    midground: ['colonnade rows', 'broken pediments'],
    background: ['open sky mist', 'far headlands'],
    props: ['column', 'banner', 'pediment_shard', 'shrine'],
  },
];

/** Collapse sequence for the ruined conduit foundry — not color-swaps of one rivet kit
 *  and not a pastoral grove. Each biome is a different machine after the pour failed. */
const FOUNDRY_COLLAPSE_SEQUENCE: BiomeMotifPack[] = [
  {
    id: 'pouring_bay',
    displayName: 'Ashen Pouring Bay',
    architecture: ['frozen ladle cranes', 'ingot mold trains', 'cracked pour basins', 'overhead I-beams'],
    terrain: ['slag brick', 'heat-warped iron plate', 'glass-metal spill'],
    organic: ['cinder growth', 'soot veils'],
    atmosphere: 'furnace haze, mid-pour freeze',
    foreground: ['hanging ladles', 'mold clamps', 'warning glyphs'],
    midground: ['crane travellers', 'crucible stacks'],
    background: ['pouring hall silhouettes', 'ember glow stacks'],
    props: ['ladle', 'crucible', 'ingot_mold', 'worklamp'],
  },
  {
    id: 'quench_tunnels',
    displayName: 'Flooded Quench Tunnels',
    architecture: ['submerged quench tanks', 'burst coolant mains', 'drowned catwalks', 'glass-slag sluices'],
    terrain: ['wet iron grate', 'coolant-stained brick', 'silted slag'],
    organic: ['mineral crust', 'heat-bleached weed'],
    atmosphere: 'cold steam over dead quench water',
    foreground: ['pipe clusters', 'hanging chains', 'tank rims'],
    midground: ['flooded galleries', 'broken sluice gates'],
    background: ['tunnel mouths', 'coolant glow'],
    props: ['quench_tank', 'conduit_pipe', 'debris', 'worklamp'],
  },
  {
    id: 'cooling_yards',
    displayName: 'Overgrown Cooling Yards',
    architecture: ['collapsed cooling racks', 'slag-glass chimneys', 'root-split molds', 'split conduit towers'],
    terrain: ['cooled slag crust', 'mossed grate', 'broken conduit'],
    organic: ['heat-wilted slag-glass fans', 'cinder vines'],
    atmosphere: 'open-yard dusk through cracked sheds',
    foreground: ['cooling fins', 'snapped clamps', 'cinder vines'],
    midground: ['rack silhouettes', 'chimney masses'],
    background: ['yard sheds', 'distant stacks'],
    props: ['cooling_rack', 'slag_chunk', 'broken_mold', 'lantern'],
  },
];

/** Collapse sequence for the luminous fungal underdark — organic cavern architecture,
 *  never industrial foundry materials. */
const SPORE_UNDERGLOW_SEQUENCE: BiomeMotifPack[] = [
  {
    id: 'spore_galleries',
    displayName: 'Spore Galleries',
    architecture: ['mycelium-ribbed halls', 'glowcap colonnades', 'hanging spore curtains'],
    terrain: ['lichen basalt', 'soft mycelium carpets', 'spore-dusted stone'],
    organic: ['tall glowcaps', 'veined mycelium', 'luminescent lichen'],
    atmosphere: 'humid bioluminescent hush',
    foreground: ['spore curtains', 'glowcap stalks', 'hanging roots'],
    midground: ['gallery ribs', 'mushroom terraces'],
    background: ['cavern mouth glow', 'distant spore blooms'],
    props: ['spore_lantern', 'glowcap', 'mycelium_shrine', 'lichen_altar'],
  },
  {
    id: 'glowcap_terraces',
    displayName: 'Glowcap Terraces',
    architecture: ['tiered mushroom platforms', 'hollowed basalt shelves', 'arching root bridges'],
    terrain: ['layered basalt shelves', 'soft cap flesh platforms', 'spore silt'],
    organic: ['giant glowcaps', 'climbing lichen', 'spore fans'],
    atmosphere: 'warm magenta-cyan bloom',
    foreground: ['cap rims', 'spore fans', 'root ladders'],
    midground: ['terrace stacks', 'bridged shelves'],
    background: ['stacked cavern tiers', 'soft underglow'],
    props: ['ladder_root', 'spore_pod', 'cap_bench', 'lantern'],
  },
  {
    id: 'mycelium_depths',
    displayName: 'Mycelium Depths',
    architecture: ['woven mycelium tunnels', 'bulb chambers', 'filament bridges'],
    terrain: ['fibrous mycelium weave', 'damp basalt', 'biofilm slick'],
    organic: ['dense mycelium nets', 'pulsing bulbs', 'dangling filaments'],
    atmosphere: 'deep indigo spore mist',
    foreground: ['filament curtains', 'bulbs', 'dripping biofilm'],
    midground: ['tunnel mouths', 'woven walls'],
    background: ['depth fade', 'faint bulb constellation'],
    props: ['bulb', 'filament_coil', 'spore_cache', 'shrine'],
  },
];

/** Collapse sequence for misty coastal cliff temples — salt-worn sandstone, never industrial
 *  foundry rivets and never fungal glowcap DNA. */
const COASTAL_CLIFF_SEQUENCE: BiomeMotifPack[] = [
  {
    id: 'salt_cliff_shrines',
    displayName: 'Salt Cliff Shrines',
    architecture: ['salt-worn cliff temples', 'open shrine facades', 'sea-cliff buttresses'],
    terrain: ['sea-worn sandstone', 'salt-crusted ledges', 'weathered flagstone'],
    organic: ['salt lichen', 'kelp fringe'],
    atmosphere: 'misty coastal hush',
    foreground: ['shrine lanterns', 'broken columns', 'salt crystals'],
    midground: ['temple facades', 'cliff arches'],
    background: ['fog banks', 'distant sea cliffs'],
    props: ['shrine', 'lantern', 'offering_bowl', 'broken_column'],
  },
  {
    id: 'tidepool_galleries',
    displayName: 'Tidepool Galleries',
    architecture: ['flooded colonnade walks', 'tide-cut galleries', 'low sea arches'],
    terrain: ['wet tide-stone', 'slick sandstone', 'pooled flagstone'],
    organic: ['tidepool weed', 'anemone clusters'],
    atmosphere: 'cool tidal echo',
    foreground: ['tide pools', 'dripping weed', 'barnacle clusters'],
    midground: ['gallery piers', 'arched openings'],
    background: ['mist over water', 'cliff silhouette'],
    props: ['tide_pool', 'barnacle_cluster', 'driftwood', 'lantern'],
  },
  {
    id: 'windward_colonnades',
    displayName: 'Windward Colonnades',
    architecture: ['wind-carved colonnades', 'open cliff walkways', 'eroded temple roofs'],
    terrain: ['pitted sandstone', 'wind-scoured stone', 'narrow ledge rock'],
    organic: ['wind-torn lichen', 'sparse cliff grass'],
    atmosphere: 'bright wind and thin mist',
    foreground: ['column drums', 'wind banners', 'ledge grass'],
    midground: ['colonnade rows', 'broken pediments'],
    background: ['open sky mist', 'far headlands'],
    props: ['column', 'banner', 'pediment_shard', 'shrine'],
  },
];

function pickMotif(template: VisualStyleTemplate, biomeIndex: number, rng: SeededRNG): BiomeMotifPack {
  if (template.id === 'mechanical-forge') {
    return FOUNDRY_COLLAPSE_SEQUENCE[biomeIndex % FOUNDRY_COLLAPSE_SEQUENCE.length]!;
  }
  if (template.id === 'spore-underglow') {
    return SPORE_UNDERGLOW_SEQUENCE[biomeIndex % SPORE_UNDERGLOW_SEQUENCE.length]!;
  }
  if (template.id === 'coastal-cliff-temple') {
    return COASTAL_CLIFF_SEQUENCE[biomeIndex % COASTAL_CLIFF_SEQUENCE.length]!;
  }
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
  const template = resolveVisualStyleTemplate(
    styleCueText(input.gameDna) || input.gameDna.identity.visualStyle,
  );
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
  // Persist motif + material hard-reject tokens so kits / validators share one source of truth.
  dna.forbiddenPatterns = [...new Set(collectBiomeForbiddenTokens(dna))];
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
