import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TileCell } from './room-assembler.js';

/** Native Foundry V3 corridor backdrop (test-packs/metroforge-foundry-v3 background/backdrop.png). */
export const FOUNDRY_BACKDROP_NATIVE = { width: 1920, height: 320 } as const;

/**
 * MetroForge procedural atlas coords (packages/godot/src/tile-layout.ts ROLES + variants)
 * → Foundry V3 8×4 terrain.png cells (artifacts/.../pack/terrain.json).
 */
const FOUNDRY_ATLAS_FROM_PROCEDURAL: Record<string, { col: number; row: number }> = {
  '0,0': { col: 0, row: 0 },
  '1,0': { col: 0, row: 1 },
  '2,0': { col: 4, row: 2 },
  '3,0': { col: 2, row: 0 },
  '4,0': { col: 4, row: 1 },
  '5,0': { col: 5, row: 1 },
  '6,0': { col: 0, row: 0 },
  '7,0': { col: 2, row: 0 },
  '0,1': { col: 0, row: 2 },
  '1,1': { col: 1, row: 2 },
  '2,1': { col: 2, row: 2 },
  '3,1': { col: 3, row: 2 },
  '0,2': { col: 6, row: 0 },
  '1,2': { col: 7, row: 0 },
  '2,2': { col: 2, row: 0 },
  '3,2': { col: 3, row: 3 },
  '5,2': { col: 6, row: 0 },
  '6,2': { col: 5, row: 3 },
  '7,2': { col: 6, row: 3 },
  '0,3': { col: 4, row: 0 },
  '1,3': { col: 1, row: 1 },
  '2,3': { col: 4, row: 2 },
  '3,3': { col: 3, row: 0 },
  '4,3': { col: 5, row: 0 },
  '5,3': { col: 1, row: 1 },
  '0,4': { col: 4, row: 0 },
  '1,4': { col: 2, row: 1 },
  '2,4': { col: 5, row: 2 },
  '3,4': { col: 3, row: 0 },
  '4,4': { col: 5, row: 0 },
  '5,4': { col: 3, row: 1 },
};

const PLAYER_LOCOMOTION = 'assets/characters/player_locomotion.png';
const PLAYER_IDLE = 'assets/characters/player_idle.png';

const PLAYER_TEMPLATE_LOCOMOTION_ALIASES = [
  'assets/characters/player_run.png',
  'assets/characters/player_walk.png',
];

const PLAYER_TEMPLATE_IDLE_ALIASES = [
  'assets/characters/player_jump_start.png',
  'assets/characters/player_jump.png',
  'assets/characters/player_fall.png',
  'assets/characters/player_land.png',
  'assets/characters/player_dash.png',
  'assets/characters/player_wall_slide.png',
  'assets/characters/player_wall_jump.png',
  'assets/characters/player_swim.png',
  'assets/characters/player_attack_2.png',
  'assets/characters/player_attack_3.png',
];

const ENEMY_ALIASES: Array<[string, string]> = [
  ['assets/enemies/melee_locomotion.png', 'assets/enemies/enemy_000_walk.png'],
  ['assets/enemies/melee_attack.png', 'assets/enemies/enemy_000_attack.png'],
  ['assets/enemies/melee_hurt.png', 'assets/enemies/enemy_000_hurt.png'],
  ['assets/enemies/melee_death.png', 'assets/enemies/enemy_000_death.png'],
];

const BOSS_ALIASES: Array<[string, string]> = [
  ['assets/bosses/boss_locomotion.png', 'assets/bosses/boss_final_walk.png'],
  ['assets/bosses/boss_attack.png', 'assets/bosses/boss_final_attack.png'],
  ['assets/bosses/boss_hurt.png', 'assets/bosses/boss_final_hurt.png'],
  ['assets/bosses/boss_death.png', 'assets/bosses/boss_final_death.png'],
  ['assets/bosses/boss_idle.png', 'assets/bosses/boss_final.png'],
  ['assets/bosses/boss_idle.png', 'assets/bosses/boss_final_idle_pose.png'],
];

const BIOME_MIRROR_SOURCES = [
  'assets/tilesets/biome_0/source.png',
  'assets/backgrounds/biome_0/far.png',
  'assets/backgrounds/biome_0/mid.png',
  'assets/backgrounds/biome_0/near.png',
];

export function remapTileCellsForFoundry(cells: TileCell[]): TileCell[] {
  return cells.map((cell) => {
    const mapped = FOUNDRY_ATLAS_FROM_PROCEDURAL[`${cell.col},${cell.row}`];
    if (!mapped) {
      return { ...cell, col: Math.min(7, Math.max(0, cell.col)), row: Math.min(3, Math.max(0, cell.row)) };
    }
    return { ...cell, col: mapped.col, row: mapped.row };
  });
}

function aliasCopy(files: Map<string, Buffer>, source: string, dest: string): void {
  const buffer = files.get(source);
  if (!buffer) return;
  files.set(dest, buffer);
}

/**
 * Foundry pack destinations do not match template sheet paths or extra-biome tileset paths.
 * Copy buffers onto the paths RoomTileMap / AnimatedAssetSprite actually load.
 */
export function expandFoundryTextureAliases(files: Map<string, Buffer>): Map<string, Buffer> {
  for (const dest of PLAYER_TEMPLATE_LOCOMOTION_ALIASES) {
    aliasCopy(files, PLAYER_LOCOMOTION, dest);
  }
  for (const dest of PLAYER_TEMPLATE_IDLE_ALIASES) {
    aliasCopy(files, PLAYER_IDLE, dest);
  }
  for (const [source, dest] of ENEMY_ALIASES) aliasCopy(files, source, dest);
  for (const [source, dest] of BOSS_ALIASES) aliasCopy(files, source, dest);

  for (const source of BIOME_MIRROR_SOURCES) {
    const buffer = files.get(source);
    if (!buffer) continue;
    for (let biome = 1; biome <= 5; biome++) {
      aliasCopy(files, source, source.replace('biome_0', `biome_${biome}`));
    }
  }
  return files;
}

/** ColorRect around a foundry room (generateRoomScene Background offsets). Camera
 *  MIN_GAMEPLAY_ZOOM 1.85 on a small slice room shows this pad as a navy letterbox
 *  unless FarSky covers it. */
export const FOUNDRY_LETTERBOX_PAD = { x: 240, y: 180 } as const;

export function foundryBackdropCoverScale(roomWidth: number, roomHeight: number): number {
  const coverW = roomWidth + FOUNDRY_LETTERBOX_PAD.x * 2;
  const coverH = roomHeight + FOUNDRY_LETTERBOX_PAD.y * 2;
  return Math.max(coverW / FOUNDRY_BACKDROP_NATIVE.width, coverH / FOUNDRY_BACKDROP_NATIVE.height);
}

/** True when an assembled project already has the Foundry V3 player locomotion sheet on disk. */
export function projectUsesFoundryVisualKit(outputDir: string): boolean {
  return existsSync(join(outputDir, 'assets', 'characters', 'player_locomotion.png'));
}
