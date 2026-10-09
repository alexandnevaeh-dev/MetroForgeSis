import {describe,it,expect} from 'vitest';
import {animationSourceLayout} from './animation-source-layout.js';
import type {AssetRecord} from './types.js';
const asset:AssetRecord={id:'watchman_attack',path:'assets/watchman_attack.png',category:'Enemy',frameCount:2,sourceFrames:['assets/a.png','assets/b.png'],sourceRegions:[[0,0,1254,1254],[0,0,1254,1254]],frameFootAnchors:[[625,1078],[597.3,1081]],displayScale:64/843};
const sizes=[{width:1254,height:1254},{width:1254,height:1254}];
describe('independent animation source layout',()=>{
 it('keeps declared foot anchors at the same preview point without cropping either source',()=>{
  const layout=animationSourceLayout(asset,sizes)!;
  expect(layout).not.toBeNull();
  const feet=layout.frames.map((f,i)=>({x:f.destination.x+asset.frameFootAnchors![i]![0]*asset.displayScale!,y:f.destination.y+asset.frameFootAnchors![i]![1]*asset.displayScale!}));
  expect(feet[0]!.x).toBeCloseTo(feet[1]!.x,10);expect(feet[0]!.y).toBeCloseTo(feet[1]!.y,10);
  for(const frame of layout.frames){expect(frame.destination.x).toBeGreaterThanOrEqual(0);expect(frame.destination.y).toBeGreaterThanOrEqual(0);expect(frame.destination.x+frame.destination.width).toBeLessThanOrEqual(layout.width);expect(frame.destination.y+frame.destination.height).toBeLessThanOrEqual(layout.height);}
  expect(layout.frames.map(f=>f.image)).toEqual([0,1]);
 });
 it('samples declared regions from one legacy source sheet',()=>{
  const single={...asset,sourceFrames:undefined,sourceSheet:'assets/sheet.png',sourceRegions:[[0,0,64,64],[64,0,64,64]] as [number,number,number,number][],frameFootAnchors:[[32,60],[32,60]] as [number,number][],displayScale:1};
  expect(animationSourceLayout(single,[{width:128,height:64}])?.frames.map(f=>f.image)).toEqual([0,0]);
 });
 it('rejects a source region outside the actual decoded image',()=>{
  expect(animationSourceLayout(asset,[sizes[0]!,{width:1200,height:1254}])).toBeNull();
 });
 it('rejects excessive output extent and mismatched frame metadata',()=>{
  expect(animationSourceLayout({...asset,displayScale:100},sizes)).toBeNull();
  expect(animationSourceLayout({...asset,frameCount:8},sizes)).toBeNull();
  expect(animationSourceLayout({...asset,frameFootAnchors:[[625,NaN],[625,1081]]},sizes)).toBeNull();
 });
});
