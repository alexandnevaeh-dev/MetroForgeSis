import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LoadedProject } from './project-loader.js';
import { analyzeProjectCompletion } from './project-completion.js';

export interface AssetCoverageEntry {
  id: string;
  path: string;
  category: 'player' | 'enemy' | 'boss' | 'npc' | 'tileset' | 'audio' | 'other';
  present: boolean;
}

export interface AssetCoverageReport {
  generatedAt: string;
  totalExpected: number;
  totalPresent: number;
  coveragePercent: number;
  missing: string[];
  entries: AssetCoverageEntry[];
  completionScore: number;
  productionReady: boolean;
}

function manifestPaths(project: LoadedProject): Set<string> {
  return new Set(
    (project.manifest.artifacts ?? []).map((a) =>
      String(a.path ?? '').replace(/\\/g, '/'),
    ),
  );
}

function assetPresent(project: LoadedProject, manifest: Set<string>, path: string): boolean {
  return manifest.has(path) || existsSync(join(project.projectPath, path));
}

function expectedAssetPaths(project: LoadedProject): AssetCoverageEntry[] {
  const entries: AssetCoverageEntry[] = [
    { id: 'player', path: 'assets/characters/player.png', category: 'player', present: false },
    { id: 'player_walk', path: 'assets/characters/player_walk.png', category: 'player', present: false },
    { id: 'player_attack', path: 'assets/characters/player_attack.png', category: 'player', present: false },
    { id: 'player_hurt', path: 'assets/characters/player_hurt.png', category: 'player', present: false },
  ];

  for (const enemy of project.gameContent.enemies) {
    for (const suffix of ['', '_walk', '_hurt', '_attack']) {
      entries.push({
        id: `${enemy.id}${suffix}`,
        path: `assets/enemies/${enemy.id}${suffix}.png`,
        category: 'enemy',
        present: false,
      });
    }
  }

  for (const boss of project.gameContent.bosses) {
    for (const suffix of ['', '_walk', '_hurt', '_attack']) {
      entries.push({
        id: `${boss.id}${suffix}`,
        path: `assets/bosses/${boss.id}${suffix}.png`,
        category: 'boss',
        present: false,
      });
    }
  }

  for (const npc of project.gameContent.npcs) {
    for (const suffix of ['', '_walk']) {
      entries.push({
        id: `${npc.id}${suffix}`,
        path: `assets/npcs/${npc.id}${suffix}.png`,
        category: 'npc',
        present: false,
      });
    }
  }

  // gameDna.world.biomeCount is the declared world size, not what this generated slice actually
  // built rooms for — a VISUAL_VERTICAL_SLICE deliberately generates a small room subset, so most
  // declared biomes may have zero rooms and therefore no reason to have tileset art. Require
  // coverage only for biomes real rooms reference, falling back to biomeCount when room data is
  // unavailable (e.g. an older project without biomeId recorded per room).
  const usedBiomeIds = new Set(
    Object.values(project.roomsData ?? {})
      .map((room) => (typeof room?.biomeId === 'string' ? room.biomeId : undefined))
      .filter((id): id is string => Boolean(id)),
  );
  const biomeCount = project.gameDna.world?.biomeCount ?? 1;
  const biomeIdsToCheck =
    usedBiomeIds.size > 0
      ? [...usedBiomeIds]
      : Array.from({ length: biomeCount }, (_, b) => `biome_${b}`);
  for (const biomeId of biomeIdsToCheck) {
    entries.push({
      id: `tileset_${biomeId}`,
      path: `assets/tilesets/${biomeId}/source.png`,
      category: 'tileset',
      present: false,
    });
  }

  for (const vfxId of [
    'hit_spark',
    'death_puff',
    'dash_trail',
    'pickup_spark',
    'ability_unlock',
    'boss_phase_shift',
    'area_burst',
    'slam_shock',
  ]) {
    entries.push({
      id: vfxId,
      path: `assets/vfx/${vfxId}.png`,
      category: 'other',
      present: false,
    });
  }

  return entries;
}

export function buildAssetCoverageReport(project: LoadedProject): AssetCoverageReport {
  const paths = manifestPaths(project);
  const entries = expectedAssetPaths(project).map((entry) => ({
    ...entry,
    present: assetPresent(project, paths, entry.path),
  }));

  const totalExpected = entries.length;
  const totalPresent = entries.filter((e) => e.present).length;
  const missing = entries.filter((e) => !e.present).map((e) => e.path);
  const completion = analyzeProjectCompletion(project);

  return {
    generatedAt: new Date().toISOString(),
    totalExpected,
    totalPresent,
    coveragePercent: totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : 100,
    missing,
    entries,
    completionScore: completion.completionScore,
    productionReady: completion.productionReady,
  };
}
