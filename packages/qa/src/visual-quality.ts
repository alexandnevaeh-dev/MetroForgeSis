import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AutomatedVisualVerdict, VisualDefect, VisualQualityScore } from '@metroforge/schemas';
import { critiqueGameplayScreenshot } from '@metroforge/assets';

export const VISUAL_QUALITY_GATES = {
  overall: 80,
  characterReadability: 85,
  enemyReadability: 80,
  backgroundDepth: 75,
  paletteHarmony: 80,
  environmentCoherence: 80,
  assetStyleConsistency: 80,
  hudReadability: 85,
} as const;

export const VISUAL_REPAIR_BUDGET = {
  maxRoomVisualRepairRounds: 3,
  maxAssetRepairAttempts: 3,
  maxSliceRepairRounds: 2,
} as const;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function fingerprintBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

export interface VisualQaInputs {
  projectPath: string;
  screenshotRel?: string;
  playerVisible?: boolean;
  enemyVisible?: boolean;
  terrainTextureExists?: boolean;
  uiTextureExists?: boolean;
  parallaxFingerprints?: { far?: string; mid?: string; near?: string };
  propCount?: number;
  placeholderRatio?: number;
  styleFingerprintMismatch?: boolean;
  wallpaperCapture?: boolean;
}

export interface VisualQaResult {
  scores: VisualQualityScore;
  defects: VisualDefect[];
  hardFail: boolean;
  hardFailReasons: string[];
  verdict: AutomatedVisualVerdict;
}

export function scoreVisualQuality(input: VisualQaInputs): VisualQaResult {
  const shotPath = join(input.projectPath, input.screenshotRel ?? 'qa/screenshot_gameplay.png');
  let criticScore = 50;
  let occupancy = 0.4;
  let lumaStd = 8;
  let wallpaper = input.wallpaperCapture === true;
  if (existsSync(shotPath)) {
    try {
      const png = readFileSync(shotPath);
      const critique = critiqueGameplayScreenshot(png);
      criticScore = critique.score;
      occupancy = critique.occupancy;
      lumaStd = critique.lumaStdDev;
      wallpaper = wallpaper || critique.issues.some((i) => i.toLowerCase().includes('wallpaper'));
    } catch {
      /* deterministic fallback below */
    }
  }
  const depthDistinct =
    input.parallaxFingerprints?.far &&
    input.parallaxFingerprints.mid &&
    input.parallaxFingerprints.near &&
    new Set([input.parallaxFingerprints.far, input.parallaxFingerprints.mid, input.parallaxFingerprints.near]).size === 3;
  const characterReadability = clamp(
    (input.playerVisible === false ? 20 : 70) + (criticScore - 50) * 0.4 + Math.min(20, lumaStd),
  );
  const enemyReadability = clamp(input.enemyVisible === false ? 45 : 82);
  const backgroundDepth = clamp(depthDistinct ? 86 : 48);
  const paletteHarmony = clamp(70 + Math.min(20, lumaStd));
  const environmentCoherence = clamp((input.terrainTextureExists ? 70 : 30) + occupancy * 25);
  const propDensity = clamp(40 + Math.min(50, (input.propCount ?? 0) * 8));
  const tileRepetition = clamp(occupancy > 0.92 ? 35 : 82);
  const hudReadability = clamp(input.uiTextureExists ? 88 : 60);
  const assetStyleConsistency = clamp(input.styleFingerprintMismatch ? 40 : 86);
  const lightingQuality = clamp(lumaStd < 3 ? 40 : 82);
  const scores: VisualQualityScore = {
    characterReadability,
    enemyReadability,
    silhouetteQuality: characterReadability,
    paletteHarmony,
    paletteSeparation: clamp(60 + lumaStd * 2),
    materialConsistency: environmentCoherence,
    architectureConsistency: environmentCoherence,
    backgroundDepth,
    parallaxReadability: backgroundDepth,
    lightingQuality,
    environmentCoherence,
    propDensity,
    tileRepetition,
    composition: clamp(criticScore),
    focalHierarchy: characterReadability,
    hudReadability,
    vfxReadability: 78,
    assetStyleConsistency,
    overall: 0,
  };
  scores.overall = clamp(
    scores.characterReadability * 0.12 +
      scores.enemyReadability * 0.08 +
      scores.backgroundDepth * 0.1 +
      scores.paletteHarmony * 0.08 +
      scores.environmentCoherence * 0.12 +
      scores.assetStyleConsistency * 0.1 +
      scores.hudReadability * 0.08 +
      scores.propDensity * 0.08 +
      scores.tileRepetition * 0.08 +
      scores.lightingQuality * 0.08 +
      scores.composition * 0.08,
  );

  const defects: VisualDefect[] = [];
  if (input.playerVisible === false) defects.push('PLAYER_TOO_SMALL');
  if (characterReadability < 70) defects.push('PLAYER_LOW_CONTRAST');
  if (tileRepetition < 55) defects.push('TILE_REPETITION_HIGH');
  if (backgroundDepth < 60) defects.push('BACKGROUND_TOO_FLAT');
  if (!depthDistinct) defects.push('PARALLAX_LAYERS_TOO_SIMILAR');
  if (propDensity < 50) defects.push('PROP_DENSITY_LOW');
  if (lightingQuality < 50) defects.push('LIGHTING_TOO_DARK');
  if (hudReadability < 70) defects.push('UI_LOW_CONTRAST');
  if (enemyReadability < 60) defects.push('ENEMY_SILHOUETTE_WEAK');
  if (paletteHarmony < 60) defects.push('PALETTE_INCOHERENT');
  if (input.styleFingerprintMismatch) defects.push('ASSET_STYLE_MISMATCH');
  if (wallpaper) defects.push('WALLPAPER_CAPTURE');
  if (!input.terrainTextureExists) defects.push('MATERIAL_LANGUAGE_MISMATCH');

  const hardFailReasons: string[] = [];
  if (wallpaper) hardFailReasons.push('wallpaper-like room capture');
  if (input.playerVisible === false) hardFailReasons.push('invisible or missing player');
  if (!input.terrainTextureExists) hardFailReasons.push('missing terrain texture');
  if (!input.uiTextureExists) hardFailReasons.push('missing UI texture');
  if (!depthDistinct) hardFailReasons.push('identical or missing parallax layers');
  if ((input.placeholderRatio ?? 0) > 0.6) hardFailReasons.push('placeholder-heavy production slice');

  const hardFail = hardFailReasons.length > 0;
  const gatesOk =
    scores.overall >= VISUAL_QUALITY_GATES.overall &&
    scores.characterReadability >= VISUAL_QUALITY_GATES.characterReadability &&
    scores.enemyReadability >= VISUAL_QUALITY_GATES.enemyReadability &&
    scores.backgroundDepth >= VISUAL_QUALITY_GATES.backgroundDepth &&
    scores.paletteHarmony >= VISUAL_QUALITY_GATES.paletteHarmony &&
    scores.environmentCoherence >= VISUAL_QUALITY_GATES.environmentCoherence &&
    scores.assetStyleConsistency >= VISUAL_QUALITY_GATES.assetStyleConsistency &&
    scores.hudReadability >= VISUAL_QUALITY_GATES.hudReadability;

  return {
    scores,
    defects,
    hardFail,
    hardFailReasons,
    verdict: hardFail || !gatesOk ? 'AUTOMATED_VISUAL_FAIL' : 'AUTOMATED_VISUAL_PASS_HUMAN_REVIEW_REQUIRED',
  };
}

export function fingerprintFile(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return fingerprintBuffer(readFileSync(path));
}

export function mapDefectToRepair(defect: VisualDefect): { action: string; target: string } {
  switch (defect) {
    case 'BACKGROUND_TOO_FLAT':
    case 'PARALLAX_LAYERS_TOO_SIMILAR':
      return { action: 'regenerate_background_layers', target: 'parallax' };
    case 'PLAYER_LOW_CONTRAST':
    case 'PLAYER_TOO_SMALL':
      return { action: 'adjust_player_outline_lighting', target: 'player' };
    case 'TILE_REPETITION_HIGH':
      return { action: 'increase_terrain_variants', target: 'tileset' };
    case 'PROP_DENSITY_LOW':
      return { action: 'rerun_decoration_placement', target: 'props' };
    case 'ASSET_STYLE_MISMATCH':
      return { action: 'regenerate_offending_asset', target: 'asset' };
    case 'LIGHTING_TOO_DARK':
      return { action: 'boost_room_lighting', target: 'lighting' };
    case 'UI_LOW_CONTRAST':
      return { action: 'regenerate_ui_art', target: 'ui' };
    case 'WALLPAPER_CAPTURE':
      return { action: 'clear_playable_air_wallpaper', target: 'room' };
    default:
      return { action: 'targeted_regenerate', target: 'visual' };
  }
}
