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
        { path: 'assets/characters/player_attack.png', maturity: 'PRODUCTION_READY' },
        { path: 'assets/enemies/enemy_000_attack.png', maturity: 'PRODUCTION_READY' },
        { path: 'assets/bosses/boss_final_attack.png', maturity: 'PRODUCTION_READY' },
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

  it('blocks productionReady when visual assets are PLACEHOLDER unless allowPlaceholders', () => {
    const blocked = analyzeProjectCompletion(
      stubProject({
        manifest: {
          artifacts: [
            {
              path: 'assets/characters/player_attack.png',
              fallbackGenerated: true,
              maturity: 'PLACEHOLDER',
              provider: 'procedural',
            },
            {
              path: 'assets/enemies/enemy_000_attack.png',
              maturity: 'GENERATED_SOURCE',
              provider: 'comfyui',
            },
            {
              path: 'assets/bosses/boss_final_attack.png',
              maturity: 'GENERATED_SOURCE',
              provider: 'comfyui',
            },
          ],
        },
      }),
    );
    expect(blocked.assetProductionGate?.passed).toBe(false);
    expect(blocked.productionReady).toBe(false);
    expect(blocked.blockers.some((b) => b.includes('AssetProductionGate'))).toBe(true);

    const allowed = analyzeProjectCompletion(
      stubProject({
        projectMeta: { allowPlaceholders: true },
        manifest: {
          artifacts: [
            {
              path: 'assets/characters/player_attack.png',
              fallbackGenerated: true,
              maturity: 'PLACEHOLDER',
              provider: 'procedural',
            },
            { path: 'assets/enemies/enemy_000_attack.png', maturity: 'PRODUCTION_READY' },
            { path: 'assets/bosses/boss_final_attack.png', maturity: 'PRODUCTION_READY' },
          ],
        },
      }),
    );
    expect(allowed.assetProductionGate?.passed).toBe(true);
    expect(allowed.assetProductionGate?.allowPlaceholders).toBe(true);
    expect(allowed.productionReady).toBe(true);
  });

  it('blocks unreviewed GENERATED_SOURCE and COMPILED visuals under the strict production gate', () => {
    const status = analyzeProjectCompletion(
      stubProject({
        manifest: {
          artifacts: [
            { path: 'assets/characters/player_attack.png', maturity: 'GENERATED_SOURCE' },
            { path: 'assets/enemies/enemy_000_attack.png', maturity: 'COMPILED' },
            { path: 'assets/bosses/boss_final_attack.png', maturity: 'PRODUCTION_READY' },
          ],
        },
      }),
    );

    expect(status.assetProductionGate?.passed).toBe(false);
    expect(status.assetProductionGate?.blockedAssets.map((asset) => asset.maturity)).toEqual([
      'GENERATED_SOURCE',
      'COMPILED',
    ]);
    expect(status.productionReady).toBe(false);
  });

  it('blocks unknown abilities with repairable=false guidance', () => {
    const status = analyzeProjectCompletion(
      stubProject({
        gameDna: {
          ...stubProject().gameDna,
          abilities: [
            { id: 'dash', name: 'Dash', category: 'movement', enabled: true },
            { id: 'wind_disc', name: 'Wind Disc', category: 'movement', enabled: true },
          ],
        } as unknown as LoadedProject['gameDna'],
      }),
    );
    expect(status.victoryPathReady).toBe(false);
    expect(status.blockers.some((b) => b.includes('repairable=false') && b.includes('wind_disc'))).toBe(
      true,
    );
    expect(status.blockers.some((b) => b.includes('Do not invent GDScript'))).toBe(true);
  });
});


describe('genre-aware completion abilities', () => {
  it.each([
    ['TOP_DOWN_ACTION_ADVENTURE', 'wind_disc', true],
    ['TOP_DOWN_ACTION_ADVENTURE', 'double_jump', false],
    ['SIDE_VIEW_METROIDVANIA', 'wind_disc', false],
    ['SIDE_VIEW_METROIDVANIA', 'double_jump', true],
    ['TOP_DOWN_ACTION_ADVENTURE', 'invented_spell', false],
  ] as const)('checks %s / %s against its runtime', (archetype, id, expected) => {
    const project = stubProject();
    project.gameDna.archetype = archetype;
    project.gameDna.abilities = [{ id, name: id, category: 'movement', enabled: true }];
    const result = analyzeProjectCompletion(project);
    expect(result.checklist.find((item) => item.id === 'abilities')?.passed).toBe(expected);
    expect(result.registeredAbilityCount).toBe(expected ? 1 : 0);
    if (!expected && archetype === 'TOP_DOWN_ACTION_ADVENTURE') {
      const warning = result.blockers.find((item) => item.startsWith('Unknown abilities'));
      expect(warning).toContain('wind_disc');
      expect(warning).not.toContain('wall_jump');
    }
  });
});
