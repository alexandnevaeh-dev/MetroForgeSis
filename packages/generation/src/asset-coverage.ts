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

  const biomeCount = project.gameDna.world?.biomeCount ?? 1;
  for (let b = 0; b < biomeCount; b++) {
    entries.push({
      id: `tileset_biome_${b}`,
      path: `assets/tilesets/biome_${b}/source.png`,
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
    present: paths.has(entry.path),
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
