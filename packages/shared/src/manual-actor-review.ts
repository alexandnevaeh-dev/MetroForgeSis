export type ManualActorReview = {
  state: 'pending' | 'passed' | 'rejected';
  scope: 'source-image';
  humanReviewRequired: true;
};

/** Return only the review summary, excluding private provider metadata. */
export function manualActorReview(value: unknown): ManualActorReview | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const review = value as Record<string, unknown>;
  if (!['pending', 'passed', 'rejected'].includes(String(review.state)) ||
      review.scope !== 'source-image' || review.humanReviewRequired !== true) return undefined;
  return { state: review.state as ManualActorReview['state'], scope: 'source-image', humanReviewRequired: true };
}
