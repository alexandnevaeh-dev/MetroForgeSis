import { expect, it } from 'vitest';
import { assetReviewPresentation, manualActorReview, manualPropReview } from './asset-review.js';
const review = (state: 'pending' | 'passed' | 'rejected') => ({state, scope: 'source-image', humanReviewRequired: true});
it('shows pending furnishing review independently of deterministic validity and private metadata',()=>{
  const prop={state:'pending',scope:'source-image-and-native-placement',humanReviewRequired:true};
  expect(assetReviewPresentation({executionMetadata:{manualPropReview:prop},critiquePassed:false,critiqueScore:0,maturity:'COMPILED'})).toMatchObject({tone:'warning',label:'Visual review pending',score:undefined});
  expect(manualPropReview({...prop,modelPath:'private'})).toEqual(prop);
  expect(manualPropReview({...prop,state:'approved'})).toBeUndefined();
  expect(assetReviewPresentation({manualPropReview:prop,maturity:'REJECTED'}).tone).toBe('danger');
});
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
