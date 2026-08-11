import type { ArtBible, AudioBible, DesignBible, GameDNA } from '@metroforge/schemas';
import type { GenerationProfile } from '@metroforge/shared';
import { PROFILE_DEFAULTS } from '@metroforge/shared';
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
      tileStyle: `${gameDna.identity.visualStyle}, 16px grid, modular tiles`,
      lighting: bucket === 'dark' ? 'low-key rim lighting' : 'soft ambient fill',
      parallax: '2-3 layered backgrounds with subtle drift',
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
