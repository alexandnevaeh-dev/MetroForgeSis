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
});
