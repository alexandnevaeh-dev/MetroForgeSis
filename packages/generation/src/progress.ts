import { GENERATION_PHASES } from '@metroforge/shared';

/** Weighted phase completion — weights sum to 100, derived from real pipeline phases. */
export const PHASE_WEIGHTS: Record<(typeof GENERATION_PHASES)[number], number> = {
  intake: 1,
  game_dna: 6,
  design_bible: 4,
  world_topology: 12,
  progression_graph: 6,
  enemy_families: 3,
  bosses: 3,
  quests: 2,
  npcs: 2,
  audio: 5,
  environment_assets: 36,
  project_assembly: 8,
  static_validation: 4,
  automated_repair: 3,
  final_qa: 3,
  export: 2,
};

export type PhaseProgressState = {
  phase: string;
  status: string;
  message?: string;
};

export function computeOverallProgress(phases: PhaseProgressState[]): number {
  let earned = 0;
  for (const phase of GENERATION_PHASES) {
    const weight = PHASE_WEIGHTS[phase] ?? 0;
    const state = phases.find((p) => p.phase === phase);
    if (!state) continue;
    if (state.status === 'PASSED' || state.status === 'SKIPPED' || state.status === 'WARN' || state.status === 'DEGRADED') {
      earned += weight;
    } else if (state.status === 'RUNNING') {
      earned += weight * 0.5;
    } else if (state.status === 'REPAIRING') {
      earned += weight * 0.75;
    }
  }
  return Math.min(100, Math.round(earned));
}

export function phaseLabel(phase: string): string {
  return phase
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
