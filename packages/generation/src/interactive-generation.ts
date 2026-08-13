import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ReviewMilestone =
  | 'game_dna'
  | 'world_layout'
  | 'player_concept'
  | 'biome_art'
  | 'bosses'
  | 'final_qa';

export type GenerationControlMode = 'autonomous' | 'interactive' | 'custom';

export const DEFAULT_INTERACTIVE_MILESTONES: ReviewMilestone[] = [
  'game_dna',
  'world_layout',
  'biome_art',
  'bosses',
  'final_qa',
];

export interface ReviewPauseContext {
  milestone: ReviewMilestone;
  phase: string;
  projectPath: string;
  message: string;
}

export interface GenerationReviewState {
  status: 'paused' | 'approved' | 'cancelled';
  milestone: ReviewMilestone;
  phase: string;
  timestamp: string;
  message?: string;
}

const REVIEW_FILE = 'generation_review.json';

export function writeReviewState(projectPath: string, state: GenerationReviewState): void {
  writeFileSync(join(projectPath, REVIEW_FILE), JSON.stringify(state, null, 2));
}

export function readReviewState(projectPath: string): GenerationReviewState | null {
  const path = join(projectPath, REVIEW_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as GenerationReviewState;
  } catch {
    return null;
  }
}

export function clearReviewState(projectPath: string): void {
  const path = join(projectPath, REVIEW_FILE);
  if (existsSync(path)) {
    writeFileSync(path, JSON.stringify({ status: 'approved', milestone: 'final_qa', phase: 'done', timestamp: new Date().toISOString() }));
  }
}

export function shouldPauseAtMilestone(
  mode: GenerationControlMode | undefined,
  milestones: ReviewMilestone[] | undefined,
  milestone: ReviewMilestone,
): boolean {
  if (!mode || mode === 'autonomous') return false;
  if (mode === 'interactive') return DEFAULT_INTERACTIVE_MILESTONES.includes(milestone);
  return (milestones ?? []).includes(milestone);
}
