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
    expect(tres).toContain('terrain_set_0/terrain_1/name = "platform"');
    expect(tres).toContain('tile_size = Vector2i(32, 32)');
  });

  it('includes every supplied adjacency role as an atlas tile', () => {
    const roles = {
      ground: { col: 0, row: 0 },
      wall: { col: 1, row: 0 },
      ceiling: { col: 2, row: 0 },
      platform: { col: 3, row: 0 },
      left_edge: { col: 4, row: 0 },
      right_edge: { col: 5, row: 0 },
      top_edge: { col: 6, row: 0 },
      bottom_edge: { col: 7, row: 0 },
      outside_tl: { col: 0, row: 1 },
      inside_br: { col: 7, row: 1 },
    };
    const tres = compileGodotTerrainSet({
      biomeId: 'biome_0',
      texturePath: 'assets/tilesets/biome_0/source.png',
      tileSize: 32,
      roles,
    });
    for (const pos of Object.values(roles)) {
      expect(tres).toContain(`0:${pos.col}/${pos.row} = 0`);
    }
    expect(tres).not.toContain('Texture2D_missing');
  });
});
