import { describe, expect, it } from 'vitest';
import {
  expandFoundryTextureAliases,
  foundryBackdropCoverScale,
  remapTileCellsForFoundry,
} from './foundry-visual-pack.js';

describe('remapTileCellsForFoundry', () => {
  it('maps procedural ground/wall/platform cells onto the Foundry 8x4 atlas', () => {
    const mapped = remapTileCellsForFoundry([
      { x: 0, y: 10, col: 0, row: 0 },
      { x: 1, y: 10, col: 1, row: 0 },
      { x: 2, y: 8, col: 3, row: 0 },
      { x: 3, y: 10, col: 3, row: 2 },
    ]);
    expect(mapped).toEqual([
      { x: 0, y: 10, col: 0, row: 0 },
      { x: 1, y: 10, col: 0, row: 1 },
      { x: 2, y: 8, col: 2, row: 0 },
      { x: 3, y: 10, col: 3, row: 3 },
    ]);
  });

  it('clamps unknown atlas coords into the 8x4 Foundry sheet', () => {
    expect(remapTileCellsForFoundry([{ x: 0, y: 0, col: 9, row: 6 }])).toEqual([
      { x: 0, y: 0, col: 7, row: 3 },
    ]);
  });
});

describe('expandFoundryTextureAliases', () => {
  it('aliases locomotion/idle onto template sheet paths and mirrors biome_0 art', () => {
    const loco = Buffer.from('loco');
    const idle = Buffer.from('idle');
    const tiles = Buffer.from('tiles');
    const far = Buffer.from('far');
    const files = new Map<string, Buffer>([
      ['assets/characters/player_locomotion.png', loco],
      ['assets/characters/player_idle.png', idle],
      ['assets/enemies/melee_locomotion.png', Buffer.from('melee')],
      ['assets/bosses/boss_locomotion.png', Buffer.from('boss')],
      ['assets/tilesets/biome_0/source.png', tiles],
      ['assets/backgrounds/biome_0/far.png', far],
    ]);

    expandFoundryTextureAliases(files);

    expect(files.get('assets/characters/player_run.png')).toBe(loco);
    expect(files.get('assets/characters/player_jump.png')).toBe(idle);
    expect(files.get('assets/enemies/enemy_000_walk.png')?.equals(Buffer.from('melee'))).toBe(true);
    expect(files.get('assets/bosses/boss_final_walk.png')?.equals(Buffer.from('boss'))).toBe(true);
    expect(files.get('assets/tilesets/biome_1/source.png')).toBe(tiles);
    expect(files.get('assets/backgrounds/biome_2/far.png')).toBe(far);
  });

  it('overwrites procedural leftovers so extra biomes and template sheet paths use pack pixels', () => {
    const loco = Buffer.from('loco');
    const tiles = Buffer.from('foundry-tiles');
    const files = new Map<string, Buffer>([
      ['assets/characters/player_locomotion.png', loco],
      ['assets/characters/player_run.png', Buffer.from('procedural-run')],
      ['assets/tilesets/biome_0/source.png', tiles],
      ['assets/tilesets/biome_1/source.png', Buffer.from('procedural-biome-1')],
    ]);
    expandFoundryTextureAliases(files);
    expect(files.get('assets/characters/player_run.png')).toBe(loco);
    expect(files.get('assets/tilesets/biome_1/source.png')).toBe(tiles);
  });
});

describe('foundryBackdropCoverScale', () => {
  it('covers the navy ColorRect pad around a visual-slice room, not only the room rect', () => {
    expect(foundryBackdropCoverScale(1920, 320)).toBeCloseTo((320 + 180 * 2) / 320);
    expect(foundryBackdropCoverScale(720, 520)).toBeCloseTo((520 + 180 * 2) / 320);
  });
});
