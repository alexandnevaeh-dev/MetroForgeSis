import {expect,it} from 'vitest';
import {readBackgroundFraming} from './background-framing.js';
const input=(value:unknown)=>({outputDir:'E:/Metroforge/Recovery-Audit/nonexistent-framing-fixture',textureFiles:new Map([['assets/backgrounds/biome_0/presentation.json',Buffer.from(JSON.stringify(value))]])});
it('retains authored framing from supplied data without changing other biomes',()=>{
 const request=input({farCameraRelative:true,farParallax:0.1});
 expect(readBackgroundFraming(request,0)).toEqual({farCameraRelative:true,farParallax:0.1});
 expect(readBackgroundFraming(request,1)).toEqual({});
});
it.each([null,[],{farCameraRelative:'yes',farParallax:0},{farCameraRelative:true,farParallax:2},{farCameraRelative:true,farParallax:0,unknown:true}])('rejects invalid presentation data %j',value=>{
 expect(()=>readBackgroundFraming(input(value),0)).toThrow('Invalid background framing');
});
