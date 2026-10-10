import {expect,it} from 'vitest';
import {manualReferenceOptions} from './manual-reference.js';
it('keeps omitted reference behavior unchanged and chooses explicit defaults',()=>{
  expect(manualReferenceOptions(undefined,undefined,false)).toBeUndefined();
  expect(manualReferenceOptions('ip_adapter',undefined,true)).toEqual({mode:'ip_adapter',strength:0.55});
  expect(manualReferenceOptions('img2img',undefined,true)).toEqual({mode:'img2img',strength:0.35});
});
it('rejects ignored, invalid or nonreplacement reference options',()=>{
  expect(()=>manualReferenceOptions('img2img',0.35,false)).toThrow('existing selected asset');
  for(const mode of ['none','controlnet_canny','',null,undefined])expect(()=>manualReferenceOptions(mode,0.35,true)).toThrow('Choose identity');
  for(const strength of [0,-0.2,1.01,NaN,Infinity,'0.35',null])expect(()=>manualReferenceOptions('img2img',strength,true)).toThrow('Reference strength');
});
