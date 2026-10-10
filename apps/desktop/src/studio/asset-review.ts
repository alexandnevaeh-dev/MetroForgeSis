import { manualActorReview } from '@metroforge/shared/manual-actor-review';
export { manualActorReview, type ManualActorReview } from '@metroforge/shared/manual-actor-review';

export function assetReviewPresentation(asset: {
  manualActorReview?: unknown;
  executionMetadata?: { manualActorReview?: unknown };
  critiquePassed?: boolean; critiqueScore?: number; maturity?: string;
}) {
  const review = manualActorReview(asset.manualActorReview ?? asset.executionMetadata?.manualActorReview);
  const rejected = asset.maturity === 'REJECTED' || review?.state === 'rejected' ||
    (!review && asset.critiquePassed === false);
  if (rejected) return { tone: 'danger' as const, label: 'Automated review rejected', score: asset.critiqueScore,
    message: 'Automated check rejected this image. Saved for inspection; review before use.' };
  if (review?.state === 'pending') return { tone: 'warning' as const, label: 'Visual review pending', score: undefined,
    message: 'Actor image saved. Automated visual review is unavailable. Inspect the source and compiled sprite before game use.' };
  if (review?.state === 'passed') return { tone: 'warning' as const, label: 'Automated review passed; human review required', score: asset.critiqueScore,
    message: 'Actor image saved. Automated source review passed. Verify the compiled sprite and animation before game use.' };
  return { tone: 'muted' as const, label: asset.critiquePassed ? 'Automated checks passed' : 'Needs review', score: asset.critiqueScore,
    message: 'Draft image saved for review. Verify appearance and animation before game use.' };
}
