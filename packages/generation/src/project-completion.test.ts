import { describe, it, expect } from 'vitest';
import { analyzeProjectCompletion } from './project-completion.js';
import type { LoadedProject } from './project-loader.js';

function stubProject(overrides: Partial<LoadedProject> = {}): LoadedProject {
  return {
    projectPath: '/tmp/game',
    gameDna: {
      profile: 'TINY_TEST',
      seed: 1,
      identity: { title: 'Test', visualStyle: 'pixel', tone: 'dark' },
      narrative: { centralConflict: 'evil' },
      abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
    } as unknown as LoadedProject['gameDna'],
    worldGraph: { nodes: [{ id: 'room_000' }], edges: [] } as unknown as LoadedProject['worldGraph'],
    roomIds: ['room_000', 'room_001'],
    gameContent: {
      enemies: [{ id: 'enemy_000' } as never],
      bosses: [{ id: 'boss_final', name: 'Final' } as never],
      quests: [
        {
          id: 'quest_000',
          objectives: [{ type: 'BossKill', target: 'boss_final' }],
        } as never,
      ],
      items: [],
      npcs: [],
      dialogues: [],
      shops: [],
    },
    roomsData: {},
    manifest: {
      artifacts: [
        { path: 'assets/characters/player_attack.png' },
        { path: 'assets/enemies/enemy_000_attack.png' },
        { path: 'assets/bosses/boss_final_attack.png' },
      ],
    },
    validationReport: { passed: true, validationLevel: 'RUNTIME_VALIDATED' },
    ...overrides,
  };
}

describe('analyzeProjectCompletion', () => {
  it('marks a fully wired project as production ready', () => {
    const status = analyzeProjectCompletion(stubProject());
    expect(status.victoryPathReady).toBe(true);
    expect(status.productionReady).toBe(true);
    expect(status.completionScore).toBe(100);
    expect(status.finalBossId).toBe('boss_final');
  });

  it('flags missing victory quest objective', () => {
    const status = analyzeProjectCompletion(
      stubProject({
        gameContent: {
          ...stubProject().gameContent,
          quests: [{ id: 'quest_000', objectives: [{ type: 'Reach', target: 'room_001' }] } as never],
        },
      }),
    );
    expect(status.victoryPathReady).toBe(false);
    expect(status.blockers.some((b) => b.includes('BossKill'))).toBe(true);
  });

  it('warns on missing attack sheets', () => {
    const status = analyzeProjectCompletion(
      stubProject({
        manifest: { artifacts: [] },
      }),
    );
    expect(status.missingAttackSheets.length).toBeGreaterThan(0);
    expect(status.productionReady).toBe(false);
  });
});
