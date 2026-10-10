import { expect, it } from 'vitest';
import { assetReviewPresentation, manualActorReview } from './asset-review.js';
const review = (state: 'pending' | 'passed' | 'rejected') => ({state, scope: 'source-image', humanReviewRequired: true});
it('presents pending source review without a false rejection or numeric quality score', () => {
  const asset = {executionMetadata: {manualActorReview: review('pending')}, critiquePassed: false, critiqueScore: 0, maturity: 'COMPILED'};
  expect(assetReviewPresentation(asset)).toMatchObject({label:'Visual review pending', tone:'warning', score:undefined});
  expect(assetReviewPresentation({...asset, manualActorReview: review('pending')})).toEqual(assetReviewPresentation(asset));
});
it('retains explicit rejection despite a high score or conflicting pending metadata', () => {
  expect(assetReviewPresentation({manualActorReview:review('rejected'),critiqueScore:95})).toMatchObject({tone:'danger',score:95});
  expect(assetReviewPresentation({manualActorReview:review('pending'),maturity:'REJECTED'}).tone).toBe('danger');
});
it('does not present an automated source pass as human or production approval', () => {
  expect(assetReviewPresentation({manualActorReview:review('passed'),critiquePassed:true,critiqueScore:95})).toMatchObject({tone:'warning',label:'Automated review passed; human review required'});
});
it('validates review metadata and omits private or unrelated provider fields', () => {
  expect(manualActorReview({...review('pending'),modelPath:'private',credential:'private'})).toEqual(review('pending'));
  for (const value of [null, [], 'pending', {state:'approved'}, {...review('passed'),humanReviewRequired:false}]) expect(manualActorReview(value)).toBeUndefined();
  expect(assetReviewPresentation({critiquePassed:false,critiqueScore:40}).tone).toBe('danger');
});
