import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { processLocalAssetImage, TILE_ATLAS } from '@metroforge/assets';
import { compileGodotTerrainSet, compileStyleBoxTexture, writePixelArtImport } from '@metroforge/godot';
import { resolveGameArchetype, type GameArchetype } from '@metroforge/shared';

export type LocalGameAssetType = 'tileset' | 'ui' | 'sprite_sheet' | 'sprite' | 'prop';

export interface LocalGameAssetOptions {
  prompt?: string;
  /** Generated Godot project root (GeneratedGames/<slug>), never the source templates. */
  projectPath: string;
  archetype?: GameArchetype | string;
  assetType: LocalGameAssetType;
  assetName: string;
  sourcePng: Buffer;
  rows?: number;
  cols?: number;
  tileSize?: number;
  knockout?: boolean;
}

export interface LocalGameAssetResult {
  savedTo: string;
  relPath: string;
  companions: string[];
  slices: string[];
  via: 'python' | 'typescript';
  archetype: GameArchetype;
}

export function localAssetRelPath(assetType: LocalGameAssetType, assetName: string): string {
  const id = assetName.replace(/[^a-zA-Z0-9_-]/g, '_');
  switch (assetType) {
    case 'tileset':
      return `assets/tilesets/${id}/source.png`;
    case 'ui':
      return `assets/ui/${id}.png`;
    case 'sprite_sheet':
      return `assets/characters/${id}_walk.png`;
    case 'prop':
      return `assets/props/${id}.png`;
    default:
      return `assets/characters/${id}.png`;
  }
}

export async function generateGameAsset(options: LocalGameAssetOptions): Promise<LocalGameAssetResult> {
  const archetype = resolveGameArchetype(options.archetype);
  const relPath = localAssetRelPath(options.assetType, options.assetName);
  const fullPath = join(options.projectPath, relPath);
  mkdirSync(dirname(fullPath), { recursive: true });

  const rows = options.assetType === 'sprite_sheet' ? (options.rows ?? 1) : options.rows;
  const cols = options.assetType === 'sprite_sheet' ? (options.cols ?? 4) : options.cols;
  const processed = await processLocalAssetImage({
    image: options.sourcePng,
    knockout: options.knockout !== false,
    rows,
    cols,
    outputPath: fullPath,
    outputDir: join(dirname(fullPath), options.assetName),
  });

  writeFileSync(fullPath, processed.image);
  writePixelArtImport(fullPath, relPath);

  const companions: string[] = [`${relPath}.import`];
  const safeName = options.assetName.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (options.assetType === 'tileset') {
    const tresRel = `assets/tilesets/${safeName}/terrain.tres`;
    const tres = compileGodotTerrainSet({
      biomeId: options.assetName,
      texturePath: relPath,
      tileSize: options.tileSize ?? 32,
      roles: TILE_ATLAS.roles,
    });
    writeFileSync(join(options.projectPath, tresRel), tres);
    companions.push(tresRel);
  }
  if (options.assetType === 'ui') {
    const tresRel = relPath.replace(/\.png$/i, '.tres');
    writeFileSync(join(options.projectPath, tresRel), compileStyleBoxTexture({ texturePath: relPath }));
    companions.push(tresRel);
  }

  const slices: string[] = [];
  if (processed.slices.length > 0) {
    const gridCols = cols ?? 1;
    processed.slices.forEach((buf, i) => {
      const rel = `${dirname(relPath)}/${safeName}/sprite_${Math.floor(i / gridCols)}_${i % gridCols}.png`;
      const sliceFull = join(options.projectPath, rel);
      mkdirSync(dirname(sliceFull), { recursive: true });
      writeFileSync(sliceFull, buf);
      writePixelArtImport(sliceFull, rel);
      slices.push(rel);
    });
  }

  return {
    savedTo: fullPath,
    relPath,
    companions,
    slices,
    via: processed.via,
    archetype,
  };
}
