import { describe, it, expect } from 'vitest';
import { computeOverallProgress, PHASE_WEIGHTS } from './progress.js';

describe('computeOverallProgress', () => {
  it('returns 0 when no phases have started', () => {
    expect(computeOverallProgress([])).toBe(0);
  });

  it('returns weighted progress from real phase statuses', () => {
    const progress = computeOverallProgress([
      { phase: 'intake', status: 'PASSED' },
      { phase: 'game_dna', status: 'PASSED' },
      { phase: 'design_bible', status: 'RUNNING' },
    ]);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
  });

  it('returns 100 when all phases passed', () => {
    const phases = [
      'intake',
      'game_dna',
      'design_bible',
      'world_topology',
      'progression_graph',
      'enemy_families',
      'bosses',
      'quests',
      'npcs',
      'audio',
      'environment_assets',
      'project_assembly',
      'static_validation',
      'automated_repair',
      'final_qa',
      'export',
    ].map((phase) => ({ phase, status: 'PASSED' }));
    expect(computeOverallProgress(phases)).toBe(100);
  });

  it('weights sum to 100', () => {
    expect(Object.values(PHASE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it('counts DEGRADED and WARN as completed weight (not failure)', () => {
    const progress = computeOverallProgress([
      { phase: 'intake', status: 'PASSED' },
      { phase: 'game_dna', status: 'PASSED' },
      { phase: 'design_bible', status: 'PASSED' },
      { phase: 'world_topology', status: 'PASSED' },
      { phase: 'progression_graph', status: 'PASSED' },
      { phase: 'enemy_families', status: 'PASSED' },
      { phase: 'bosses', status: 'PASSED' },
      { phase: 'quests', status: 'PASSED' },
      { phase: 'npcs', status: 'PASSED' },
      { phase: 'audio', status: 'PASSED' },
      {
        phase: 'environment_assets',
        status: 'DEGRADED',
        message: 'DEGRADED — placeholders; not production-ready',
      },
      { phase: 'project_assembly', status: 'PASSED' },
      { phase: 'static_validation', status: 'PASSED' },
      { phase: 'automated_repair', status: 'PASSED' },
      { phase: 'final_qa', status: 'WARN' },
      { phase: 'export', status: 'PASSED' },
    ]);
    expect(progress).toBe(100);
  });
});
