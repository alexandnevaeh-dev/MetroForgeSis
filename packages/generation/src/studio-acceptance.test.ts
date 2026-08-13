import { describe, expect, it } from 'vitest';
import { GENERATION_PHASES } from '@metroforge/shared';
import { withCategory } from './events.js';
import { shouldPauseAtMilestone } from './interactive-generation.js';
import { computeOverallProgress } from './progress.js';
import { analyzeProjectCompletion } from './project-completion.js';
import type { LoadedProject } from './project-loader.js';

describe('studio acceptance — event protocol', () => {
  it('includes review events with categories', () => {
    const paused = withCategory({
      type: 'ReviewPauseStarted',
      timestamp: new Date().toISOString(),
      milestone: 'game_dna',
      phase: 'design_bible',
    });
    expect(paused.category).toBe('ALL');

    const approved = withCategory({
      type: 'ReviewApproved',
      timestamp: new Date().toISOString(),
      milestone: 'game_dna',
      phase: 'design_bible',
    });
    expect(approved.category).toBe('ALL');
  });

  it('interactive mode defines expected milestone gates', () => {
    expect(shouldPauseAtMilestone('interactive', undefined, 'game_dna')).toBe(true);
    expect(shouldPauseAtMilestone('interactive', undefined, 'final_qa')).toBe(true);
    expect(shouldPauseAtMilestone('autonomous', undefined, 'final_qa')).toBe(false);
  });

  it('progress reaches 100% when all phases pass', () => {
    const phases = GENERATION_PHASES.map((phase) => ({ phase, status: 'PASSED' as const }));
    expect(computeOverallProgress(phases)).toBe(100);
  });

  it('completion analysis exposes production-ready checklist for dashboard IPC', () => {
    const project = {
      projectPath: '/tmp/demo',
      gameDna: {
        profile: 'TINY_TEST',
        seed: 1,
        identity: { title: 'Demo', visualStyle: 'pixel', tone: 'dark' },
        narrative: { centralConflict: 'test' },
        abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
      },
      worldGraph: { nodes: [{ id: 'room_000' }], edges: [] },
      roomIds: ['room_000'],
      gameContent: {
        enemies: [],
        bosses: [{ id: 'boss_final' }],
        quests: [{ id: 'quest_000', objectives: [{ type: 'BossKill', target: 'boss_final' }] }],
        items: [],
        npcs: [],
        dialogues: [],
        shops: [],
      },
      roomsData: {},
      manifest: { artifacts: [{ path: 'assets/characters/player_attack.png' }, { path: 'assets/bosses/boss_final_attack.png' }] },
      validationReport: { validationLevel: 'RUNTIME_VALIDATED', passed: true },
    } as unknown as LoadedProject;

    const status = analyzeProjectCompletion(project);
    expect(status.victoryPathReady).toBe(true);
    expect(status.checklist.length).toBeGreaterThanOrEqual(4);
    expect(status.checklist.every((c) => c.id && c.label)).toBe(true);
  });
});
