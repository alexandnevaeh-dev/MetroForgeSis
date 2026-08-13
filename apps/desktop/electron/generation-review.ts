import type { ReviewPauseContext } from '@metroforge/generation';

type ReviewDecision = 'approve' | 'cancel';

interface PendingReview {
  resolve: (decision: ReviewDecision) => void;
  context: ReviewPauseContext;
}

const pending = new Map<string, PendingReview>();

export function waitForGenerationReview(
  context: ReviewPauseContext,
): Promise<ReviewDecision> {
  return new Promise((resolve) => {
    pending.set(context.projectPath, { resolve, context });
  });
}

export function resolveGenerationReview(
  projectPath: string,
  approved: boolean,
): ReviewPauseContext | null {
  const entry = pending.get(projectPath);
  if (!entry) return null;
  entry.resolve(approved ? 'approve' : 'cancel');
  pending.delete(projectPath);
  return entry.context;
}

export function getPendingReview(projectPath: string): ReviewPauseContext | null {
  return pending.get(projectPath)?.context ?? null;
}

export function listPendingReviews(): ReviewPauseContext[] {
  return [...pending.values()].map((p) => p.context);
}
