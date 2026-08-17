import type {
  ArtBible,
  GameDNA,
  StyleBible,
  VisualDNA,
  CharacterVisualLanguage,
  MaterialLanguage,
} from '@metroforge/schemas';
import { VISUAL_DNA_VERSION } from '@metroforge/schemas';
import { resolveVisualStyleTemplate } from './style-registry.js';
import { fingerprintFromVisualDNA } from './fingerprint.js';

function shadeHex(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = Number.parseInt(m[1]!, 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * amount)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * amount)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function characterLanguage(
  silhouette: string,
  clothing: string,
  weapon: string,
  extras: string[],
  outline: string,
): CharacterVisualLanguage {
  return {
    silhouette,
    proportions: 'head ~1/3 of sprite, compact torso, feet planted on canvas bottom',
    clothing,
    hair: 'consistent hair mass across poses',
    weapon,
    distinctiveFeatures: extras,
    outline,
    readAtGameScale: 'must remain readable at two-tile height against biome midtones',
  };
}

export function generateVisualDNA(input: {
  gameDna: GameDNA;
  artBible: ArtBible;
  styleBible: StyleBible;
}): VisualDNA {
  const { gameDna, artBible, styleBible } = input;
  const template = resolveVisualStyleTemplate(gameDna.identity.visualStyle || artBible.visualStyle);
  const hexes = artBible.palette.map((p) => p.hex);
  const global = hexes.length > 0 ? hexes : ['#141820', '#3c4454', '#5a8cdc', '#c84848'];
  const shadows = global.map((h) => shadeHex(h, 0.45));
  const highlights = global.map((h) => shadeHex(h, 1.25));
  const accents = global.slice(-2);
  const ui = [global[0] ?? '#141820', global[global.length - 1] ?? '#c84848', highlights[1] ?? '#dce6f0'];
  const tileSize = styleBible.tileSize ?? gameDna.technical.tileSize ?? 16;
  const materials: MaterialLanguage[] = template.materialFamilies.map((m) => ({
    ...m,
    forbidden: template.forbidden.slice(0, 2),
  }));
  const sideView = gameDna.archetype !== 'TOP_DOWN_ACTION_ADVENTURE';
  const dna: VisualDNA = {
    version: VISUAL_DNA_VERSION,
    gameId: gameDna.identity.title,
    styleFingerprint: '',
    artStyle: template.artStyle,
    renderingStyle: styleBible.renderingStyle || artBible.visualStyle,
    resolution: {
      referenceWidth: styleBible.internalRenderResolution?.width ?? 640,
      referenceHeight: styleBible.internalRenderResolution?.height ?? 360,
      basePixelsPerUnit: styleBible.pixelsPerUnit ?? tileSize,
      spriteScale: (styleBible.playerSpriteHeight ?? 64) / Math.max(1, tileSize),
      tileSize,
    },
    palette: { global, shadows, highlights, accents, ui },
    lighting: {
      ...template.lighting,
      fogColor: shadows[0],
      fogAlpha: 0.12,
    },
    materials,
    architecture: {
      silhouette: sideView ? 'side-view interior masses, readable against far plate' : 'top-down readable footprints',
      motifs: template.architectureMotifs,
      scale: 'human-scale halls, two-tile player',
      openings: 'night/sky apertures, never wallpapered playable air',
      ruinLevel: 'weathered',
    },
    characters: characterLanguage(
      artBible.characterGuidelines.player,
      `${gameDna.identity.visualStyle} explorer kit`,
      gameDna.combat.meleeEnabled ? 'one-handed melee weapon, consistent across poses' : 'holstered tool',
      [gameDna.narrative.protagonist],
      styleBible.outlineRules ?? '1px dark outline',
    ),
    enemies: characterLanguage(
      artBible.characterGuidelines.enemy,
      'hostile silhouette distinct from player',
      'readable attack tell',
      [gameDna.identity.tone],
      '1px dark outline, higher chroma than terrain',
    ),
    bosses: characterLanguage(
      artBible.characterGuidelines.boss,
      'imposing unique silhouette',
      'phase-readable weapon mass',
      [gameDna.narrative.centralConflict],
      '1–2px outline, never camouflaged into arena',
    ),
    environments: {
      terrainRead: artBible.environmentGuidelines.tileStyle,
      propScale: 'props smaller than player unless architectural',
      density: 'controlled storytelling clusters, not checkerboard scatter',
    },
    backgrounds: {
      far: 'distant silhouette / skyline / giant architecture, lowest contrast',
      mid: 'large ruins and environmental masses, mid contrast',
      near: 'occluders, chains, foliage, pillars — highest local contrast',
      motion: { far: 0.1, mid: 0.3, near: 0.65 },
    },
    props: {
      families: ['debris', 'furniture', 'vegetation', 'light', 'shrine', 'signage'],
      storytellingBias: gameDna.narrative.premise,
    },
    vfx: {
      ...template.vfx,
      scale: styleBible.VFXScaleRules ?? 'combat VFX never cover the player silhouette',
    },
    ui: {
      ...template.ui,
      fontHint: artBible.uiGuidelines.fontStyle,
      cornerRadiusPx: 2,
      borderPx: 2,
    },
    composition: {
      focalHierarchy: ['player', 'enemy/boss', 'interactables', 'architecture', 'far background'],
      foregroundCoverage: 0.18,
      emptySpaceMax: 0.55,
      playerScreenHeightMin: 0.12,
      contrastAgainstBackground: 'player darker or outlined vs far plate; never same luma band as terrain fill',
    },
    forbiddenPatterns: [
      ...template.forbidden,
      ...artBible.negativePrompts,
      'identical parallax layers',
      'wallpapered playable air',
      'unrelated asset collage',
    ],
    promptAnchors: [
      ...template.promptAnchors,
      gameDna.identity.visualStyle,
      gameDna.identity.tone,
      sideView ? 'orthographic side view' : 'top-down orthographic',
    ],
    seed: gameDna.seed,
  };
  dna.styleFingerprint = fingerprintFromVisualDNA(dna);
  return dna;
}
