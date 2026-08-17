import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateRoomsPresentation,
  type PresentationRoomInput,
  type RoomBlueprint,
} from '@metroforge/godot';

export interface IndependentQualityGates {
  functionalQuality: number;
  assetIntegrity: number;
  visualCohesion: number;
  roomComposition: number;
  gameplayReadability: number;
  presentationQuality: number;
  overallConfidence: number;
  overall: number;
  showcaseReady: boolean;
  violations: string[];
  gateCaps: {
    visualCohesion: number;
    roomComposition: number;
    presentationQuality: number;
  };
}

export interface CharacterScaleProfile {
  playerScreenHeightRatioMin: number;
  playerScreenHeightRatioMax: number;
  standardEnemyScaleRange: { min: number; max: number };
  eliteEnemyScaleRange: { min: number; max: number };
  bossScaleRange: { min: number; max: number };
}

export const DEFAULT_CHARACTER_SCALE: CharacterScaleProfile = {
  playerScreenHeightRatioMin: 0.07,
  playerScreenHeightRatioMax: 0.24,
  standardEnemyScaleRange: { min: 0.04, max: 0.22 },
  eliteEnemyScaleRange: { min: 0.08, max: 0.32 },
  bossScaleRange: { min: 0.16, max: 0.55 },
};

export function evaluateCharacterScale(input: {
  playerSpriteHeightPx?: number;
  viewportHeightPx?: number;
  profile?: CharacterScaleProfile;
}): { ok: boolean; ratio: number; violation?: string } {
  const profile = input.profile ?? DEFAULT_CHARACTER_SCALE;
  const view = input.viewportHeightPx ?? 360;
  const sprite = input.playerSpriteHeightPx ?? 48;
  const ratio = sprite / Math.max(1, view);
  if (ratio < profile.playerScreenHeightRatioMin || ratio > profile.playerScreenHeightRatioMax) {
    return { ok: false, ratio, violation: 'PLAYER_SCALE_OUT_OF_BOUNDS' };
  }
  return { ok: true, ratio };
}

export function loadPublishedRooms(projectPath: string): PresentationRoomInput[] {
  const roomsPath = join(projectPath, 'data', 'rooms', 'rooms.json');
  if (!existsSync(roomsPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(roomsPath, 'utf-8')) as {
      rooms?: Record<
        string,
        {
          id?: string;
          archetype?: string;
          width?: number;
          height?: number;
          tileSize?: number;
          tileCells?: PresentationRoomInput['tileCells'];
          blueprint?: RoomBlueprint;
        }
      >;
    };
    const rooms = Object.values(parsed.rooms ?? {});
    return rooms.map((room) => {
      const width = room.width ?? 800;
      const tileSize = room.tileSize ?? 16;
      const height = room.height ?? 600;
      const cols = Math.max(1, Math.floor(width / tileSize));
      const floorRow = Math.max(1, Math.floor((height - tileSize * 2) / tileSize));
      return {
        id: room.id ?? 'room',
        archetype: room.archetype ?? 'combat',
        tileCells: room.tileCells ?? [],
        cols,
        floorRow,
        blueprint: room.blueprint,
      };
    });
  } catch {
    return [];
  }
}

export function detectDebugHud(projectPath: string, criticIssues: string[] = []): boolean {
  if (criticIssues.some((i) => /HUD band is so filled/i.test(i))) return true;
  const hud = join(projectPath, 'scripts', 'UI', 'GameHUD.gd');
  if (!existsSync(hud)) return false;
  const src = readFileSync(hud, 'utf-8');
  const hidesCapture = src.includes('METROFORGE_CAPTURE') && src.includes('_is_presentation_hud');
  return !hidesCapture;
}

export function aggregateIndependentGates(input: {
  weightedOverall: number;
  functionalQuality: number;
  assetIntegrity: number;
  visualCohesion: number;
  roomComposition: number;
  gameplayReadability: number;
  presentationQuality: number;
  violations: string[];
  hardFail: boolean;
}): IndependentQualityGates {
  const cohesionCap = input.visualCohesion;
  const compositionCap = input.roomComposition;
  const presentationCap = input.presentationQuality;
  const overall = Math.min(input.weightedOverall, cohesionCap, compositionCap, presentationCap);
  const overallConfidence = Math.min(overall, input.functionalQuality, input.assetIntegrity);
  const critical = input.violations.some((v) =>
    [
      'EXCESSIVE_TILE_REPETITION',
      'RAW_COLLISION_GEOMETRY',
      'RAW_PLATFORM_PRESENTATION',
      'DEBUG_HUD_VISIBLE',
      'BOSS_ROOM_GENERIC',
      'PLAYER_UNREADABLE',
      'PLAYER_SCALE_OUT_OF_BOUNDS',
      'WALLPAPER_CAPTURE',
    ].includes(v),
  );
  const showcaseReady =
    !input.hardFail &&
    !critical &&
    input.functionalQuality >= 80 &&
    input.assetIntegrity >= 80 &&
    input.visualCohesion >= 75 &&
    input.roomComposition >= 75 &&
    input.gameplayReadability >= 80 &&
    input.presentationQuality >= 75;
  return {
    functionalQuality: input.functionalQuality,
    assetIntegrity: input.assetIntegrity,
    visualCohesion: input.visualCohesion,
    roomComposition: input.roomComposition,
    gameplayReadability: input.gameplayReadability,
    presentationQuality: input.presentationQuality,
    overallConfidence,
    overall,
    showcaseReady,
    violations: input.violations,
    gateCaps: {
      visualCohesion: cohesionCap,
      roomComposition: compositionCap,
      presentationQuality: presentationCap,
    },
  };
}

export function evaluateProjectPresentation(projectPath: string): ReturnType<typeof evaluateRoomsPresentation> {
  return evaluateRoomsPresentation(loadPublishedRooms(projectPath));
}
