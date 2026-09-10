import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodePng } from '@metroforge/assets';
import { generateGameAsset, localAssetRelPath } from '../src/local-game-asset.js';

function solidPng(width = 32, height = 32): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 58;
    rgba[i + 1] = 72;
    rgba[i + 2] = 78;
    rgba[i + 3] = 255;
  }
  return encodePng(width, height, rgba);
}

describe('generateGameAsset', () => {
  it('maps asset types onto generated-project paths, not source templates', () => {
    expect(localAssetRelPath('tileset', 'biome_0')).toBe('assets/tilesets/biome_0/source.png');
    expect(localAssetRelPath('ui', 'hud_frame')).toBe('assets/ui/hud_frame.png');
    expect(localAssetRelPath('sprite_sheet', 'player')).toBe('assets/characters/player_walk.png');
  });

  it('writes PNG, .import, and TileSet .tres into the generated project', async () => {
    const projectPath = join(tmpdir(), `metroforge-local-asset-${Date.now()}`);
    mkdirSync(projectPath, { recursive: true });
    const result = await generateGameAsset({
      projectPath,
      archetype: 'SIDE_VIEW_METROIDVANIA',
      assetType: 'tileset',
      assetName: 'biome_0',
      sourcePng: solidPng(256, 192),
      tileSize: 32,
      knockout: false,
    });
    expect(result.relPath).toBe('assets/tilesets/biome_0/source.png');
    expect(result.savedTo.startsWith(projectPath)).toBe(true);
    expect(result.savedTo.includes('templates/')).toBe(false);
    expect(existsSync(join(projectPath, result.relPath))).toBe(true);
    expect(existsSync(join(projectPath, `${result.relPath}.import`))).toBe(true);
    const tres = readFileSync(join(projectPath, 'assets/tilesets/biome_0/terrain.tres'), 'utf-8');
    expect(tres).toContain('[gd_resource type="TileSet"');
    expect(tres).toContain('res://assets/tilesets/biome_0/source.png');
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('writes a StyleBoxTexture companion for UI panels', async () => {
    const projectPath = join(tmpdir(), `metroforge-local-ui-${Date.now()}`);
    mkdirSync(projectPath, { recursive: true });
    const result = await generateGameAsset({
      projectPath,
      archetype: 'TOP_DOWN_ACTION_ADVENTURE',
      assetType: 'ui',
      assetName: 'button_frame',
      sourcePng: solidPng(),
      knockout: false,
    });
    expect(result.archetype).toBe('TOP_DOWN_ACTION_ADVENTURE');
    const tres = readFileSync(join(projectPath, 'assets/ui/button_frame.tres'), 'utf-8');
    expect(tres).toContain('StyleBoxTexture');
    expect(result.companions).toContain('assets/ui/button_frame.tres');
    rmSync(projectPath, { recursive: true, force: true });
  });
});
