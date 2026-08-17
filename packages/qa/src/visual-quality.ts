import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AutomatedVisualVerdict, VisualDefect, VisualQualityScore } from '@metroforge/schemas';
import { critiqueGameplayScreenshot } from '@metroforge/assets';
import {
  aggregateIndependentGates,
  detectDebugHud,
  evaluateCharacterScale,
  evaluateProjectPresentation,
  type IndependentQualityGates,
} from './presentation-gates.js';

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
  maxVisualRepairPasses: 3,
  maxAssetRegenerationsPerAsset: 2,
  maxRoomRecompositions: 4,
  maxCriticCalls: 8,
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
  playerSpriteHeightPx?: number;
  viewportHeightPx?: number;
  functionalQuality?: number;
}

export interface VisualQaResult {
  scores: VisualQualityScore;
  defects: VisualDefect[];
  hardFail: boolean;
  hardFailReasons: string[];
  verdict: AutomatedVisualVerdict;
  gates: IndependentQualityGates;
}

export function scoreVisualQuality(input: VisualQaInputs): VisualQaResult {
  const shotPath = join(input.projectPath, input.screenshotRel ?? 'qa/screenshot_gameplay.png');
  let criticScore = 50;
  let occupancy = 0.4;
  let lumaStd = 8;
  let wallpaper = input.wallpaperCapture === true;
  let criticIssues: string[] = [];
  if (existsSync(shotPath)) {
    try {
      const png = readFileSync(shotPath);
      const critique = critiqueGameplayScreenshot(png);
      criticScore = critique.score;
      occupancy = critique.occupancy;
      lumaStd = critique.lumaStdDev;
      criticIssues = critique.issues;
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
  const hudReadability = clamp(input.uiTextureExists ? 88 : 60);
  const assetStyleConsistency = clamp(input.styleFingerprintMismatch ? 40 : 86);
  const lightingQuality = clamp(lumaStd < 3 ? 40 : 82);

  const presentation = evaluateProjectPresentation(input.projectPath);
  const debugHud = detectDebugHud(input.projectPath, criticIssues);
  const scale = evaluateCharacterScale({
    playerSpriteHeightPx: input.playerSpriteHeightPx,
    viewportHeightPx: input.viewportHeightPx,
  });
  const tileRepetition = presentation.violations.includes('EXCESSIVE_TILE_REPETITION')
    ? clamp(presentation.score)
    : clamp(occupancy > 0.92 ? 35 : Math.min(82, presentation.score || 82));

  const defects: VisualDefect[] = [];
  if (input.playerVisible === false) defects.push('PLAYER_TOO_SMALL');
  if (characterReadability < 70) defects.push('PLAYER_LOW_CONTRAST');
  if (tileRepetition < 55 || presentation.violations.includes('EXCESSIVE_TILE_REPETITION')) {
    defects.push('TILE_REPETITION_HIGH');
    defects.push('EXCESSIVE_TILE_REPETITION');
  }
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
  if (presentation.violations.includes('RAW_COLLISION_GEOMETRY')) defects.push('RAW_COLLISION_GEOMETRY');
  if (presentation.violations.includes('RAW_PLATFORM_PRESENTATION')) defects.push('RAW_PLATFORM_PRESENTATION');
  if (presentation.violations.includes('UNSTYLED_PLATFORMS')) defects.push('UNSTYLED_PLATFORMS');
  if (presentation.violations.includes('BOSS_ROOM_GENERIC')) defects.push('BOSS_ROOM_GENERIC');
  if (presentation.violations.includes('MISSING_ARCHITECTURAL_TREATMENT')) {
    defects.push('MISSING_ARCHITECTURAL_TREATMENT');
  }
  if (debugHud) defects.push('DEBUG_HUD_VISIBLE');
  if (!scale.ok) defects.push('PLAYER_SCALE_OUT_OF_BOUNDS');

  const visualCohesion = clamp(
    (paletteHarmony + assetStyleConsistency + environmentCoherence + backgroundDepth) / 4,
  );
  const roomComposition = clamp(Math.min(criticScore, presentation.score));
  const gameplayReadability = clamp((characterReadability + enemyReadability + hudReadability) / 3);
  const hasScreenshot = existsSync(shotPath);
  const presentationQuality = clamp(
    Math.min(
      Number.isFinite(presentation.score) ? presentation.score : 70,
      hasScreenshot ? 100 : 70,
      debugHud ? 35 : 100,
      wallpaper ? 20 : 100,
      scale.ok ? 100 : 40,
    ),
  );
  const functionalQuality = clamp(input.functionalQuality ?? 70);
  const assetIntegrity = clamp(
    (input.terrainTextureExists ? 40 : 10) +
      (input.uiTextureExists ? 30 : 10) +
      ((input.placeholderRatio ?? 1) < 0.4 ? 30 : 5),
  );

  const weighted = clamp(
    characterReadability * 0.12 +
      enemyReadability * 0.08 +
      backgroundDepth * 0.1 +
      paletteHarmony * 0.08 +
      environmentCoherence * 0.12 +
      assetStyleConsistency * 0.1 +
      hudReadability * 0.08 +
      propDensity * 0.08 +
      tileRepetition * 0.08 +
      lightingQuality * 0.08 +
      criticScore * 0.08,
  );

  const hardFailReasons: string[] = [];
  if (wallpaper) hardFailReasons.push('wallpaper-like room capture');
  if (input.playerVisible === false) hardFailReasons.push('invisible or missing player');
  if (!input.terrainTextureExists) hardFailReasons.push('missing terrain texture');
  if (!input.uiTextureExists) hardFailReasons.push('missing UI texture');
  if (!depthDistinct) hardFailReasons.push('identical or missing parallax layers');
  if ((input.placeholderRatio ?? 0) > 0.6) hardFailReasons.push('placeholder-heavy production slice');
  if (presentation.violations.includes('RAW_COLLISION_GEOMETRY')) hardFailReasons.push('raw collision geometry visible');
  if (presentation.violations.includes('EXCESSIVE_TILE_REPETITION')) hardFailReasons.push('excessive tile repetition');
  if (presentation.violations.includes('BOSS_ROOM_GENERIC')) hardFailReasons.push('generic boss room');
  if (debugHud) hardFailReasons.push('debug HUD visible in presentation capture');
  if (!scale.ok) hardFailReasons.push('player scale outside allowed bounds');

  const hardFail = hardFailReasons.length > 0;
  const gates = aggregateIndependentGates({
    weightedOverall: weighted,
    functionalQuality,
    assetIntegrity,
    visualCohesion,
    roomComposition,
    gameplayReadability,
    presentationQuality,
    violations: [...new Set([...presentation.violations, ...defects])],
    hardFail,
  });

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
    composition: clamp(Math.min(criticScore, roomComposition)),
    focalHierarchy: characterReadability,
    hudReadability,
    vfxReadability: 78,
    assetStyleConsistency,
    functionalQuality,
    assetIntegrity,
    visualCohesion,
    roomComposition,
    gameplayReadability,
    presentationQuality,
    overallConfidence: gates.overallConfidence,
    overall: clamp(gates.overall),
  };

  const gatesOk =
    scores.overall >= VISUAL_QUALITY_GATES.overall &&
    scores.characterReadability >= VISUAL_QUALITY_GATES.characterReadability &&
    scores.enemyReadability >= VISUAL_QUALITY_GATES.enemyReadability &&
    scores.backgroundDepth >= VISUAL_QUALITY_GATES.backgroundDepth &&
    scores.paletteHarmony >= VISUAL_QUALITY_GATES.paletteHarmony &&
    scores.environmentCoherence >= VISUAL_QUALITY_GATES.environmentCoherence &&
    scores.assetStyleConsistency >= VISUAL_QUALITY_GATES.assetStyleConsistency &&
    scores.hudReadability >= VISUAL_QUALITY_GATES.hudReadability &&
    presentationQuality >= 75 &&
    !hardFail;

  return {
    scores,
    defects,
    hardFail,
    hardFailReasons,
    verdict: hardFail || !gatesOk ? 'AUTOMATED_VISUAL_FAIL' : 'AUTOMATED_VISUAL_PASS_HUMAN_REVIEW_REQUIRED',
    gates,
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
    case 'EXCESSIVE_TILE_REPETITION':
      return { action: 'increase_terrain_variants', target: 'tileset' };
    case 'RAW_COLLISION_GEOMETRY':
    case 'RAW_PLATFORM_PRESENTATION':
    case 'UNSTYLED_PLATFORMS':
    case 'MISSING_ARCHITECTURAL_TREATMENT':
      return { action: 'recompose_room_visuals', target: 'room_visuals' };
    case 'BOSS_ROOM_GENERIC':
      return { action: 'run_boss_arena_composer', target: 'boss_arena' };
    case 'DEBUG_HUD_VISIBLE':
      return { action: 'force_presentation_hud', target: 'hud' };
    case 'PLAYER_SCALE_OUT_OF_BOUNDS':
      return { action: 'adjust_character_scale', target: 'player' };
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
