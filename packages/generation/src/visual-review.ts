import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VISUAL_QUALITY_CRITERIA, type VisualReviewState } from '@metroforge/schemas';

const FILE = 'visual_review.json';

export function visualReviewPath(projectPath: string): string {
  return join(projectPath, FILE);
}

export function writeVisualSliceReviewRequired(
  projectPath: string,
  extras: Partial<VisualReviewState> = {},
): VisualReviewState {
  const state: VisualReviewState = {
    status: 'VISUAL_SLICE_REVIEW_REQUIRED',
    fakeAnimationDetected: extras.fakeAnimationDetected ?? false,
    technicalQa: extras.technicalQa,
    notes: extras.notes,
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(visualReviewPath(projectPath), JSON.stringify(state, null, 2));
  return state;
}

export function applyVisualReviewDecision(
  projectPath: string,
  decision: 'approve' | 'reject',
  notes?: string,
): VisualReviewState {
  const state: VisualReviewState = {
    status: decision === 'approve' ? 'VISUAL_SLICE_APPROVED' : 'VISUAL_SLICE_REJECTED',
    notes,
    updatedAt: new Date().toISOString(),
    fakeAnimationDetected: false,
  };
  writeFileSync(visualReviewPath(projectPath), JSON.stringify(state, null, 2));
  return state;
}

export function emptyRubric(): Record<string, number> {
  return Object.fromEntries(VISUAL_QUALITY_CRITERIA.map((c) => [c, 0]));
}

export function visualReviewExists(projectPath: string): boolean {
  return existsSync(visualReviewPath(projectPath));
}
