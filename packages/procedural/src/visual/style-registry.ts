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
];

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
