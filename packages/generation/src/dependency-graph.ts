import type { LoadedProject } from './project-loader.js';
import { assetPathToResPath, scanGodotResourceGraph } from './godot-resource-graph.js';

export interface AssetUsage {
  assetId: string;
  path: string;
  usedIn: Array<{
    type: 'room' | 'biome' | 'hud' | 'manifest' | 'godot_scene' | 'godot_script';
    id: string;
    detail?: string;
  }>;
}

export interface DependencyGraph {
  assets: Map<string, AssetUsage>;
  godotResourceCount: number;
  godotScannedFiles: number;
}

export function buildDependencyGraph(project: LoadedProject): DependencyGraph {
  const assets = new Map<string, AssetUsage>();

  const ensure = (id: string, path: string) => {
    if (!assets.has(id)) {
      assets.set(id, { assetId: id, path, usedIn: [] });
    }
    return assets.get(id)!;
  };

  for (const artifact of project.manifest.artifacts ?? []) {
    const id = String(artifact.id ?? artifact.path ?? '');
    const path = String(artifact.path ?? '');
    if (!id) continue;
    ensure(id, path);
  }

  for (const [roomId, room] of Object.entries(project.roomsData)) {
    const enemies = (room.enemies as string[] | undefined) ?? [];
    for (const enemyId of enemies) {
      const walk = ensure(`${enemyId}_walk`, `assets/enemies/${enemyId}_walk.png`);
      walk.usedIn.push({ type: 'room', id: roomId, detail: 'enemy sprite' });
      const base = ensure(enemyId, `assets/enemies/${enemyId}.png`);
      base.usedIn.push({ type: 'room', id: roomId, detail: 'enemy' });
    }
    const biomeId = String(room.biomeId ?? 'biome_0');
    const tileset = ensure(`tileset_${biomeId}`, `assets/tilesets/${biomeId}/source.png`);
    tileset.usedIn.push({ type: 'biome', id: biomeId, detail: `room ${roomId}` });
  }

  const player = ensure('player', 'assets/characters/player.png');
  player.usedIn.push({ type: 'hud', id: 'player_hud' });
  const playerWalk = ensure('player_walk_sheet', 'assets/characters/player_walk.png');
  playerWalk.usedIn.push({ type: 'hud', id: 'player_animations' });

  const godotGraph = scanGodotResourceGraph(project.projectPath);
  for (const artifact of project.manifest.artifacts ?? []) {
    const relPath = String(artifact.path ?? '');
    if (!relPath) continue;
    const assetId = String(artifact.id ?? relPath);
    const resPath = assetPathToResPath(relPath);
    const resource = godotGraph.resources.get(resPath);
    if (!resource) continue;
    const usage = ensure(assetId, relPath);
    for (const ref of resource.referencedBy) {
      const kind = ref.file.endsWith('.gd') ? 'godot_script' : 'godot_scene';
      usage.usedIn.push({ type: kind, id: ref.file, detail: ref.kind });
    }
  }

  return {
    assets,
    godotResourceCount: godotGraph.resources.size,
    godotScannedFiles: godotGraph.scannedFiles,
  };
}

export function findAssetUsages(graph: DependencyGraph, assetId: string): AssetUsage | null {
  return graph.assets.get(assetId) ?? null;
}
