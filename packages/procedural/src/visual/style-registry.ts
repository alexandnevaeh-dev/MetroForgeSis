import type { ArtStyleDefinition } from '@metroforge/schemas';

export interface VisualStyleTemplate {
  id: string;
  keywords: string[];
  artStyle: ArtStyleDefinition;
  architectureMotifs: string[];
  materialFamilies: Array<{
    id: string;
    name: string;
    family: 'masonry' | 'metal' | 'organic' | 'glass' | 'water' | 'fabric' | 'energy' | 'debris';
    albedo: string;
    roughness: string;
    edgeTreatment: string;
  }>;
  lighting: {
    key: string;
    fill: string;
    ambient: string;
    accent: string;
    direction: string;
    contrast: string;
    sources: string[];
  };
  forbidden: string[];
  promptAnchors: string[];
  ui: {
    frameStyle: string;
    meterStyle: string;
    iconStyle: string;
    panelStyle: string;
  };
  vfx: {
    hit: string;
    dash: string;
    landing: string;
    pickup: string;
    ability: string;
  };
  ambientPool: Array<
    'none' | 'ash' | 'dust' | 'rain' | 'snow' | 'spores' | 'leaves' | 'embers' | 'insects' | 'mist' | 'underwater'
  >;
}

/** Data-driven style library. New looks are added here — generators do not switch on titles. */
export const VISUAL_STYLE_TEMPLATES: VisualStyleTemplate[] = [
  {
    id: 'gothic-ruin',
    keywords: ['gothic', 'cathedral', 'ruin', 'drowned', 'crypt', 'citadel', 'dark'],
    artStyle: {
      id: 'gothic-ruin',
      label: 'readable gothic pixel ruin',
      renderingFamily: 'gothic',
      edgeTreatment: '1px dark outline on gameplay sprites, softer on far architecture',
      shadingSteps: 3,
      textureDensity: 'medium',
    },
    architectureMotifs: ['pointed arches', 'collapsed buttresses', 'lancet openings', 'broken stained glass'],
    materialFamilies: [
      { id: 'limestone', name: 'eroded limestone', family: 'masonry', albedo: 'cool wet stone', roughness: 'pitted', edgeTreatment: 'chipped' },
      { id: 'bronze', name: 'oxidized bronze', family: 'metal', albedo: 'desaturated gold-green', roughness: 'tarnished', edgeTreatment: 'hard' },
      { id: 'moss', name: 'pale aquatic moss', family: 'organic', albedo: 'desaturated teal', roughness: 'soft', edgeTreatment: 'frayed' },
    ],
    lighting: {
      key: 'cold cyan',
      fill: 'deep navy shadow',
      ambient: 'submerged dusk',
      accent: 'desaturated gold',
      direction: 'upper-left shafts',
      contrast: 'medium-high, readable silhouettes',
      sources: ['ceiling shafts', 'submerged lanterns', 'broken clerestory'],
    },
    forbidden: ['pine forest vista', 'alpine lake', 'photoreal people', 'UI chrome in sprites'],
    promptAnchors: ['interior architecture', 'side-view metroidvania', 'readable silhouette'],
    ui: {
      frameStyle: 'thin iron filigree on dark stone',
      meterStyle: 'inset metal trough with cyan fill',
      iconStyle: '16px outlined relic glyphs',
      panelStyle: 'dark glass with gold corner caps',
    },
    vfx: {
      hit: 'cyan glass shards',
      dash: 'cold mist streak',
      landing: 'wet stone dust',
      pickup: 'gold mote burst',
      ability: 'tideglass ring',
    },
    ambientPool: ['mist', 'underwater', 'spores', 'dust'],
  },
  {
    id: 'mechanical-forge',
    keywords: ['mechanical', 'industrial', 'forge', 'brass', 'clockwork', 'machine', 'foundry'],
    artStyle: {
      id: 'mechanical-forge',
      label: 'readable industrial pixel machine',
      renderingFamily: 'modern-pixel',
      edgeTreatment: '1px soot-dark outline, hard metal corners',
      shadingSteps: 3,
      textureDensity: 'dense',
    },
    architectureMotifs: ['riveted bulkheads', 'gear galleries', 'exhaust stacks', 'catwalk ribs'],
    materialFamilies: [
      { id: 'iron', name: 'sooted iron', family: 'metal', albedo: 'cool gunmetal', roughness: 'scratched', edgeTreatment: 'hard' },
      { id: 'brass', name: 'heat-stained brass', family: 'metal', albedo: 'warm ochre', roughness: 'oily', edgeTreatment: 'beveled' },
      { id: 'cinder', name: 'cinder slag', family: 'debris', albedo: 'charcoal', roughness: 'crumbly', edgeTreatment: 'broken' },
    ],
    lighting: {
      key: 'furnace orange',
      fill: 'cool iron blue',
      ambient: 'soot haze',
      accent: 'cyan energy',
      direction: 'lower-right furnace glow plus upper-left fill',
      contrast: 'high, metal rims catch light',
      sources: ['furnace mouths', 'conduit sparks', 'hanging work lamps'],
    },
    forbidden: ['pastoral forest', 'soft watercolor wash', 'cute rounded toys'],
    promptAnchors: ['machine interior', 'side-view metroidvania', 'readable silhouette'],
    ui: {
      frameStyle: 'riveted brass HUD bezel',
      meterStyle: 'pressure gauge trough',
      iconStyle: '16px stencil glyphs',
      panelStyle: 'dark iron with brass corners',
    },
    vfx: {
      hit: 'spark burst',
      dash: 'soot streak',
      landing: 'cinder puff',
      pickup: 'cyan arc flash',
      ability: 'gear-ring pulse',
    },
    ambientPool: ['embers', 'ash', 'dust'],
  },
  {
    id: 'moonlit-organic',
    keywords: ['vibrant', 'forest', 'moon', 'organic', 'grove', 'lush', 'overgrown'],
    artStyle: {
      id: 'moonlit-organic',
      label: 'readable moonlit pixel grove',
      renderingFamily: 'illustrated',
      edgeTreatment: '1px dark outline on actors, softer foliage clusters',
      shadingSteps: 3,
      textureDensity: 'medium',
    },
    architectureMotifs: ['root-wrapped ruins', 'stone circles', 'overgrown colonnades', 'moon wells'],
    materialFamilies: [
      { id: 'basalt', name: 'mossy basalt', family: 'masonry', albedo: 'cool gray-green', roughness: 'weathered', edgeTreatment: 'rounded chips' },
      { id: 'vine', name: 'pale vines', family: 'organic', albedo: 'desaturated leaf', roughness: 'soft', edgeTreatment: 'tapered' },
      { id: 'silverwood', name: 'silvered timber', family: 'organic', albedo: 'cool beige', roughness: 'grainy', edgeTreatment: 'splintered' },
    ],
    lighting: {
      key: 'moon silver',
      fill: 'deep teal shadow',
      ambient: 'night canopy',
      accent: 'firefly gold',
      direction: 'upper-left moonlight',
      contrast: 'medium, actors darker than far mist',
      sources: ['moon shafts', 'bioluminescent pools', 'lantern shrines'],
    },
    forbidden: ['photoreal pine postcard', 'neon vaporwave', 'UI chrome'],
    promptAnchors: ['overgrown interior ruins', 'side-view metroidvania', 'readable silhouette'],
    ui: {
      frameStyle: 'carved wood and silver inlay',
      meterStyle: 'leaf-edged trough',
      iconStyle: '16px seed/relic glyphs',
      panelStyle: 'dark bark with moon-silver corners',
    },
    vfx: {
      hit: 'leaf burst',
      dash: 'pollen streak',
      landing: 'moss dust',
      pickup: 'firefly swarm',
      ability: 'moon-ring pulse',
    },
    ambientPool: ['leaves', 'spores', 'insects', 'mist'],
  },
  {
    id: 'spore-underglow',
    keywords: [
      'fungal',
      'underdark',
      'mycelium',
      'bioluminescent',
      'spore',
      'mushroom',
      'glowcap',
      'lichen',
    ],
    artStyle: {
      id: 'spore-underglow',
      label: 'readable bioluminescent fungal pixel underdark',
      renderingFamily: 'illustrated',
      edgeTreatment: '1px soft charcoal outline on actors, feathery on spore mist',
      shadingSteps: 4,
      textureDensity: 'medium',
    },
    architectureMotifs: [
      'mycelium-ribbed galleries',
      'glowcap colonnades',
      'spore-lit terraces',
      'hollowed basalt chambers',
    ],
    materialFamilies: [
      {
        id: 'basalt-lichen',
        name: 'lichen-veined basalt',
        family: 'masonry',
        albedo: 'cool violet-gray',
        roughness: 'pitted',
        edgeTreatment: 'soft chips',
      },
      {
        id: 'mycelium',
        name: 'living mycelium weave',
        family: 'organic',
        albedo: 'pale cream-teal',
        roughness: 'fibrous',
        edgeTreatment: 'frayed',
      },
      {
        id: 'glowcap',
        name: 'bioluminescent glowcap',
        family: 'organic',
        albedo: 'cyan-magenta bloom',
        roughness: 'waxy',
        edgeTreatment: 'rounded',
      },
    ],
    lighting: {
      key: 'spore cyan',
      fill: 'deep indigo shadow',
      ambient: 'humid cavern dusk',
      accent: 'magenta glowcap',
      direction: 'scattered bioluminescent uplight',
      contrast: 'medium-high, actors darker than ambient bloom',
      sources: ['glowcap clusters', 'mycelium veins', 'spore lanterns'],
    },
    forbidden: [
      'riveted bulkhead collage',
      'furnace slag wallpaper',
      'industrial foundry',
      'cyan robot courier',
      'photoreal people',
      'pine forest postcard',
    ],
    promptAnchors: [
      'luminous fungal underdark',
      'side-view metroidvania',
      'readable silhouette',
      'organic cavern architecture',
    ],
    ui: {
      frameStyle: 'mycelium-filigree on dark basalt',
      meterStyle: 'glowcap trough with cyan fill',
      iconStyle: '16px spore/relic glyphs',
      panelStyle: 'indigo stone with magenta corner caps',
    },
    vfx: {
      hit: 'spore burst',
      dash: 'mycelium streak',
      landing: 'puff of spores',
      pickup: 'glowcap mote swarm',
      ability: 'ring of bioluminescent filaments',
    },
    ambientPool: ['spores', 'mist', 'insects', 'dust'],
  },
  {
    id: 'coastal-cliff-temple',
    keywords: [
      'coastal',
      'cliff',
      'tide',
      'temple',
      'sea mist',
      'salt',
      'sandstone',
      'shrine',
      'colonnade',
      'sea-worn',
      'misty coastal',
    ],
    artStyle: {
      id: 'coastal-cliff-temple',
      label: 'readable misty coastal cliff-temple pixel',
      renderingFamily: 'illustrated',
      edgeTreatment: '1px salt-dark outline on actors, softer on fog banks',
      shadingSteps: 3,
      textureDensity: 'medium',
    },
    architectureMotifs: [
      'salt-worn cliff temples',
      'wind-carved colonnades',
      'tidepool shrines',
      'sea-cliff buttresses',
    ],
    materialFamilies: [
      {
        id: 'sandstone',
        name: 'sea-worn sandstone',
        family: 'masonry',
        albedo: 'warm ochre-tan',
        roughness: 'pitted salt',
        edgeTreatment: 'rounded chips',
      },
      {
        id: 'tide-stone',
        name: 'wet tide-stone',
        family: 'masonry',
        albedo: 'cool slate-teal',
        roughness: 'slick',
        edgeTreatment: 'soft',
      },
      {
        id: 'kelp-lichen',
        name: 'salt lichen and kelp fringe',
        family: 'organic',
        albedo: 'desaturated sea-green',
        roughness: 'soft',
        edgeTreatment: 'frayed',
      },
    ],
    lighting: {
      key: 'misty coastal silver',
      fill: 'deep teal cliff shadow',
      ambient: 'sea fog dusk',
      accent: 'warm shrine gold',
      direction: 'upper-left mist shafts over cliff face',
      contrast: 'medium, actors darker than fog banks',
      sources: ['cliff mist shafts', 'shrine lanterns', 'tidepool glints'],
    },
    forbidden: [
      'riveted bulkhead collage',
      'furnace slag wallpaper',
      'industrial foundry',
      'cyan robot courier',
      'slag brick wallpaper',
      'panel grates',
      'fungal underdark',
      'glowcap colonnades',
      'photoreal people',
    ],
    promptAnchors: [
      'misty coastal cliff temples',
      'side-view metroidvania',
      'readable silhouette',
      'salt-worn sandstone architecture',
    ],
    ui: {
      frameStyle: 'carved sandstone fillet with salt crystals',
      meterStyle: 'tide-trough with teal fill',
      iconStyle: '16px shrine/wave glyphs',
      panelStyle: 'warm stone with seafoam corner caps',
    },
    vfx: {
      hit: 'salt spray burst',
      dash: 'mist streak',
      landing: 'wet stone splash',
      pickup: 'shrine mote shimmer',
      ability: 'tide-ring pulse',
    },
    ambientPool: ['mist', 'rain', 'dust', 'leaves'],
  },
];

/** Concatenate identity + premise so LOCAL_ONLY DNA (`visualStyle: "HD pixel art"`) still
 *  matches style keywords from the user prompt (foundry, gothic, grove, …). */
export function styleCueText(input: {
  identity?: { visualStyle?: string; title?: string; tagline?: string };
  narrative?: { premise?: string };
}): string {
  return [
    input.identity?.visualStyle,
    input.identity?.title,
    input.identity?.tagline,
    input.narrative?.premise,
  ]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(' ');
}

export function resolveVisualStyleTemplate(visualStyle: string): VisualStyleTemplate {
  const lower = visualStyle.toLowerCase();
  let best = VISUAL_STYLE_TEMPLATES[0]!;
  let bestHits = -1;
  for (const template of VISUAL_STYLE_TEMPLATES) {
    const hits = template.keywords.filter((k) => lower.includes(k)).length;
    if (hits > bestHits) {
      best = template;
      bestHits = hits;
    }
  }
  return best;
}
