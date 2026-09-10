import { describe, it, expect } from 'vitest';
import { buildAssetCoverageReport } from './asset-coverage.js';
import type { LoadedProject } from './project-loader.js';

describe('buildAssetCoverageReport', () => {
  it('computes coverage from manifest artifacts', () => {
    const project = {
      projectPath: '/tmp/game',
      gameDna: {
        world: { biomeCount: 1 },
        abilities: [{ id: 'dash', enabled: true }],
      },
      worldGraph: { nodes: [{ id: 'room_000' }], edges: [] },
      roomIds: ['room_000'],
      gameContent: {
        enemies: [{ id: 'enemy_000' }],
        bosses: [{ id: 'boss_final' }],
        quests: [{ id: 'quest_000', objectives: [{ type: 'BossKill', target: 'boss_final' }] }],
        items: [],
        npcs: [{ id: 'npc_000' }],
        dialogues: [],
        shops: [],
      },
      manifest: {
        artifacts: [
          { path: 'assets/characters/player.png' },
          { path: 'assets/enemies/enemy_000.png' },
          { path: 'assets/bosses/boss_final.png' },
        ],
      },
    } as unknown as LoadedProject;

    const report = buildAssetCoverageReport(project);
    expect(report.totalExpected).toBeGreaterThan(3);
    expect(report.totalPresent).toBe(3);
    expect(report.coveragePercent).toBeLessThan(100);
    expect(report.missing).toContain('assets/npcs/npc_000.png');
    expect(report.missing).toContain('assets/npcs/npc_000_walk.png');
  });

  it('only requires tileset art for biomes rooms actually use, not every declared world biome', () => {
    const project = {
      projectPath: '/tmp/game',
      gameDna: {
        world: { biomeCount: 6 },
        abilities: [],
      },
      worldGraph: { nodes: [{ id: 'room_000' }], edges: [] },
      roomIds: ['room_000', 'room_001'],
      roomsData: {
        room_000: { biomeId: 'biome_0' },
        room_001: { biomeId: 'biome_1' },
      },
      gameContent: {
        enemies: [],
        bosses: [],
        quests: [],
        items: [],
        npcs: [],
        dialogues: [],
        shops: [],
      },
      manifest: {
        artifacts: [
          { path: 'assets/characters/player.png' },
          { path: 'assets/tilesets/biome_0/source.png' },
          { path: 'assets/tilesets/biome_1/source.png' },
        ],
      },
    } as unknown as LoadedProject;

    const report = buildAssetCoverageReport(project);
    // A VISUAL_VERTICAL_SLICE generates only a handful of rooms out of a much larger declared
    // world — requiring tileset art for biome_2..biome_5 (never referenced by any room) is what
    // dragged coveragePercent/productionReady down for real slices even though nothing was
    // actually missing from the game those rooms build.
    expect(report.missing).not.toContain('assets/tilesets/biome_2/source.png');
    expect(report.missing).not.toContain('assets/tilesets/biome_5/source.png');
    expect(report.entries.filter((e) => e.category === 'tileset')).toHaveLength(2);
  });

  it('falls back to biomeCount when no room records a biomeId', () => {
    const project = {
      projectPath: '/tmp/game',
      gameDna: { world: { biomeCount: 2 }, abilities: [] },
      worldGraph: { nodes: [{ id: 'room_000' }], edges: [] },
      roomIds: ['room_000'],
      roomsData: { room_000: {} },
      gameContent: { enemies: [], bosses: [], quests: [], items: [], npcs: [], dialogues: [], shops: [] },
      manifest: { artifacts: [] },
    } as unknown as LoadedProject;

    const report = buildAssetCoverageReport(project);
    expect(report.entries.filter((e) => e.category === 'tileset')).toHaveLength(2);
  });
});
