import type {
  ArtBible,
  AudioBible,
  CharacterVisualDNA,
  DesignBible,
  GameDNA,
  StyleBible,
} from '@metroforge/schemas';
import type { GenerationProfile } from '@metroforge/shared';
import { PROFILE_DEFAULTS, slugify, tileSizeForProfile } from '@metroforge/shared';
import { SeededRNG } from './rng.js';

const STYLE_PALETTES: Record<string, { name: string; hex: string; usage: string }[]> = {
  dark: [
    { name: 'Shadow', hex: '#141820', usage: 'backgrounds' },
    { name: 'Steel', hex: '#3c4454', usage: 'structures' },
    { name: 'Accent', hex: '#5a8cdc', usage: 'player highlights' },
    { name: 'Danger', hex: '#c84848', usage: 'enemies' },
  ],
  vibrant: [
    { name: 'Sky', hex: '#284878', usage: 'backgrounds' },
    { name: 'Grass', hex: '#3ca064', usage: 'organic zones' },
    { name: 'Gold', hex: '#dcb432', usage: 'pickups' },
    { name: 'Coral', hex: '#e87850', usage: 'enemies' },
  ],
  mechanical: [
    { name: 'Void', hex: '#101018', usage: 'backgrounds' },
    { name: 'Brass', hex: '#8a6840', usage: 'machinery' },
    { name: 'Cyan', hex: '#48b8c8', usage: 'energy' },
    { name: 'Rust', hex: '#a84830', usage: 'decay' },
  ],
};

function inferStyleBucket(visualStyle: string): keyof typeof STYLE_PALETTES {
  const lower = visualStyle.toLowerCase();
  if (lower.includes('dark') || lower.includes('gothic') || lower.includes('ruin')) return 'dark';
  if (lower.includes('mechanical') || lower.includes('industrial') || lower.includes('forge'))
    return 'mechanical';
  return 'vibrant';
}

export function generateArtBible(gameDna: GameDNA, seed: number): ArtBible {
  const bucket = inferStyleBucket(gameDna.identity.visualStyle);
  const palette = STYLE_PALETTES[bucket]!;

  return {
    version: '0.1.0',
    seed,
    visualStyle: gameDna.identity.visualStyle,
    palette,
    characterGuidelines: {
      player: `${gameDna.identity.visualStyle}, readable silhouette, ${gameDna.narrative.protagonist}`,
      enemy: `${gameDna.identity.visualStyle}, distinct readable shape, hostile`,
      boss: `${gameDna.identity.visualStyle}, imposing scale, ${gameDna.narrative.centralConflict}`,
      npc: `${gameDna.identity.visualStyle}, friendly readable silhouette`,
    },
    environmentGuidelines: {
      tileStyle: `${gameDna.identity.visualStyle}, ${gameDna.technical.tileSize}px grid, modular autotiles`,
      lighting: bucket === 'dark' ? 'key light from upper-left, hard 1px rims' : 'soft ambient fill, key from upper-left',
      parallax: '3 layered backgrounds (far, mid, near) plus optional foreground silhouette; no stretching',
    },
    uiGuidelines: {
      fontStyle: 'pixel or condensed sans',
      hudTheme: bucket === 'mechanical' ? 'brass and cyan accents' : 'high contrast minimal',
      iconStyle: '16px centered icons with 1px outline',
    },
    negativePrompts: [
      'blurry',
      'low quality',
      'text',
      'watermark',
      'photorealistic',
      '3d render',
    ],
    promptPrefixes: {
      CHARACTER: `pixel art game character sprite, side view, ${gameDna.identity.visualStyle},`,
      ENEMY: `pixel art game enemy creature, side view, ${gameDna.identity.visualStyle},`,
      BOSS: `pixel art game boss creature, imposing, ${gameDna.identity.visualStyle},`,
      TILE_SOURCE: `seamless pixel art tileset texture, ${gameDna.identity.visualStyle},`,
      ENVIRONMENT: `pixel art parallax background, ${gameDna.identity.visualStyle},`,
    },
  };
}

export function generateAudioBible(
  gameDna: GameDNA,
  profile: GenerationProfile,
  seed: number,
): AudioBible {
  const rng = new SeededRNG(seed);
  const defaults = PROFILE_DEFAULTS[profile];
  const musicStyle = gameDna.audio?.musicStyle ?? `${gameDna.identity.tone} ambient exploration`;

  const moods = rng.pickMany(
    ['mysterious', 'tense', 'melancholic', 'hopeful', 'industrial', 'ethereal'],
    3,
  );

  const biomeThemes = Array.from({ length: defaults.biomes }, (_, i) => ({
    biomeId: `biome_${i}`,
    mood: rng.pick(moods),
    tempo: rng.pick(['slow', 'medium', 'fast'] as const),
    key: rng.pick(['Am', 'Dm', 'Em', 'Cm', 'Fm']),
  }));

  return {
    version: '0.1.0',
    seed,
    musicStyle,
    moodKeywords: moods,
    instrumentation: rng.pickMany(
      ['synth pad', 'plucked strings', 'low brass', 'percussion', 'choir pad', 'bass pulse'],
      4,
    ),
    biomeThemes,
    sfxGuidelines: {
      combat: `${gameDna.combat.style} impacts, short decay`,
      movement: 'light footfalls, dash whoosh',
      ui: 'soft blips, menu confirm',
      ambient: `${gameDna.identity.tone} room tone loops`,
    },
    mixNotes: 'Sidechain duck music under SFX; keep combat readable',
  };
}

export function generateDesignBible(
  gameDna: GameDNA,
  profile: GenerationProfile,
  seed: number,
): DesignBible {
  return {
    version: '0.1.0',
    seed,
    art: generateArtBible(gameDna, seed),
    audio: generateAudioBible(gameDna, profile, seed + 1000),
  };
}

/** Persistable StyleBible derived from the existing ArtBible so asset prompts stay on one creative source. */
export function generateStyleBible(gameDna: GameDNA, art: ArtBible): StyleBible {
  const sideView = gameDna.archetype !== 'TOP_DOWN_ACTION_ADVENTURE';
  const tileSize = gameDna.technical.tileSize || tileSizeForProfile(gameDna.profile);
  const visualSlice = gameDna.profile === 'VISUAL_VERTICAL_SLICE';
  const cameraZoom = visualSlice ? 3 : 2;
  return {
    styleId: slugify(gameDna.identity.visualStyle) || 'default-style',
    renderingStyle: art.visualStyle,
    pixelResolution: tileSize,
    palette: art.palette,
    outlineRules: '1px dark outline on characters and collidable tiles; no extra outlines on far BG',
    lighting: art.environmentGuidelines.lighting,
    materials: art.environmentGuidelines.tileStyle,
    characterScale: `${tileSize * 2}px player height on ${tileSize}px grid`,
    spritePerspective: sideView ? 'side view' : 'top-down',
    environmentDensity: art.environmentGuidelines.parallax,
    VFXStyle: art.promptPrefixes.VFX ?? `${art.visualStyle} particle VFX`,
    UIStyle: art.uiGuidelines.hudTheme,
    promptPrefixes: art.promptPrefixes,
    negativePrompts: art.negativePrompts,
    artStyle: art.visualStyle,
    projection: sideView ? 'side-view' : 'top-down',
    targetResolution: { width: 1920, height: 1080 },
    internalRenderResolution: { width: 640, height: 360 },
    tileSize,
    pixelsPerUnit: tileSize,
    playerSpriteWidth: 64,
    playerSpriteHeight: 64,
    enemyScaleRange: [48, 80],
    bossScaleRange: [96, 160],
    maximumPaletteSize: Math.max(8, art.palette.length),
    shadingRules: 'flat base fills, one shadow step, one highlight step; no painterly gradients on gameplay sprites',
    highlightRules: 'single specular catch from upper-left on metal/glass; never on far parallax',
    lightingDirection: 'upper-left',
    lightingContrast: visualSlice ? 'medium-high, readable silhouettes' : art.environmentGuidelines.lighting,
    backgroundLayerCount: 3,
    parallaxRules: 'far 0.15x, mid 0.4x, near 0.75x; no single stretched plate across rooms',
    animationFPS: 10,
    animationFrameRules: '4–8 unique posed frames per action; never scale/rotate/squash one still',
    VFXScaleRules: 'hit sparks ≤ 24px; combat VFX never cover the player silhouette',
    UIResolution: { width: 640, height: 360 },
    cameraZoom,
    cameraLookAhead: 40,
    cameraDeadZone: 0.14,
    pixelFiltering: 'nearest',
    nearestNeighbor: true,
    pixelSnap: true,
    contrast: 'readable midtones, avoid crushed blacks covering the player',
    saturation: 'controlled, biome-locked',
    cameraScale: `${cameraZoom}x integer zoom`,
    backgroundDepthRules: 'far dimmer, mid lit from left, near highest contrast',
    dimension: '2d',
  };
}

export function generateCharacterVisualDNA(gameDna: GameDNA, art: ArtBible): CharacterVisualDNA {
  const tile = gameDna.technical.tileSize || 32;
  return {
    id: 'player',
    silhouette: `readable two-tile (${tile * 2}px) humanoid, distinct head/weapon mass`,
    bodyProportions: 'head ~1/3 of sprite, torso compact, feet planted on canvas bottom',
    palette: art.palette.map((p) => p.hex),
    clothing: `${gameDna.identity.visualStyle} fitted explorer kit, no costume swaps between frames`,
    equipment: 'single visible weapon and belt pouches, same across all poses',
    faceHair: `${gameDna.narrative.protagonist} face, consistent hair mass`,
    weapon: gameDna.combat.meleeEnabled ? 'one-handed side-view melee blade, sheathed or in-hand consistently' : 'holstered tool',
    spriteWidth: 64,
    spriteHeight: 64,
    orientation: 'side view, facing right in source',
    lighting: 'upper-left key, 1px dark outline',
    outline: art.uiGuidelines.iconStyle,
    anchor: 'feet-center',
    prompt: art.characterGuidelines.player,
  };
}

export function applyStyleBiblePrompt(
  styleBible: StyleBible | undefined,
  capability: string,
  prompt: string,
): string {
  if (!styleBible) return prompt;
  const prefix = styleBible.promptPrefixes[capability] ?? `${styleBible.renderingStyle},`;
  const palette = styleBible.palette.map((p) => `${p.name} ${p.hex}`).join(', ');
  const extras = [
    styleBible.outlineRules,
    styleBible.lightingDirection,
    styleBible.saturation,
    styleBible.backgroundDepthRules,
    styleBible.characterScale,
  ]
    .filter(Boolean)
    .join(', ');
  return `${prefix} ${styleBible.spritePerspective}, ${styleBible.lighting}, palette [${palette}], ${extras}. ${prompt}`.trim();
}
