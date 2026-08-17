import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REQUIRED_TILE_ROLES, TILE_ATLAS } from '@metroforge/assets';

export function evaluateTerrainProject(projectPath: string, biomeId = 'biome_0'): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  const texture = join(projectPath, 'assets', 'tilesets', biomeId, 'source.png');
  const terrainJson = join(projectPath, 'assets', 'tilesets', biomeId, 'terrain.json');
  const tres = join(projectPath, 'assets', 'tilesets', biomeId, 'terrain.tres');
  if (!existsSync(texture)) issues.push('missing tileset texture');
  if (!existsSync(terrainJson)) issues.push('missing terrain.json metadata');
  if (!existsSync(tres)) issues.push('missing terrain.tres');
  for (const role of REQUIRED_TILE_ROLES) {
    if (!(role in TILE_ATLAS.roles)) issues.push(`atlas missing ${role}`);
  }
  return { passed: issues.length === 0, issues };
}

export function evaluateParallaxProject(projectPath: string, biomeId = 'biome_0'): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  const dir = join(projectPath, 'assets', 'backgrounds', biomeId);
  for (const layer of ['far', 'mid', 'near'] as const) {
    if (!existsSync(join(dir, `${layer}.png`))) issues.push(`missing ${layer} parallax`);
  }
  return { passed: issues.length === 0, issues };
}
