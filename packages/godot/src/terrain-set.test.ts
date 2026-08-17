import { describe, expect, it } from 'vitest';
import { compileGodotTerrainSet } from '../src/terrain-set.js';

describe('Godot terrain set compiler', () => {
  it('emits a TileSet resource with terrain names and atlas tiles', () => {
    const tres = compileGodotTerrainSet({
      biomeId: 'biome_0',
      texturePath: 'assets/tilesets/biome_0/source.png',
      tileSize: 32,
      roles: { ground: { col: 0, row: 0 }, wall: { col: 1, row: 0 } },
    });
    expect(tres).toContain('[gd_resource type="TileSet"');
    expect(tres).toContain('terrain_set_0/terrain_0/name = "masonry"');
    expect(tres).toContain('texture_region_size = Vector2i(32, 32)');
    expect(tres).toContain('assets/tilesets/biome_0/source.png');
    expect(tres).toContain('0:0/0 = 0');
  });
});
