import { describe, expect, it } from 'vitest';
import { manualPropCanvasOptions } from './manual-prop-canvas.js';
import { manualImagePlan, compileManualImage } from './manual-image-plan.js';
import { encodePng, decodePngRgba } from './png.js';

describe('new manual prop canvas', () => {
  it('keeps default props and actor canvases unchanged', () => {
    expect(manualImagePlan('prop', 'desk')).toMatchObject({width:64,height:96});
    expect(manualImagePlan('enemy', 'caster')).toMatchObject({width:64,height:64});
  });
  it('compiles a wide detailed source to the authored prop dimensions', () => {
    const plan=manualImagePlan('prop','desk',undefined,undefined,'detailed',{width:192,height:64});
    expect(plan).toMatchObject({width:192,height:64,sourceWidth:1024,sourceHeight:344,transparent:true,grounded:true});
    const rgba=new Uint8Array(96*32*4);
    for(let y=4;y<28;y++) for(let x=4;x<92;x++) rgba.set([89,63,42,255],(y*96+x)*4);
    const output=decodePngRgba(compileManualImage(encodePng(96,32,rgba),plan));
    expect([output.width,output.height]).toEqual([192,64]);
    expect(output.rgba.some((value,i)=>i%4===3&&value>0)).toBe(true);
  });
  it('preserves replacement dimensions and rejects explicit resizing', () => {
    const existing=encodePng(192,64,new Uint8Array(192*64*4).fill(255));
    expect(manualImagePlan('prop','desk',existing)).toMatchObject({width:192,height:64});
    expect(()=>manualImagePlan('prop','desk',existing,undefined,undefined,{width:64,height:96})).toThrow('only to new prop');
  });
  it.each(['enemy','boss','background','item','player_sprite'])('rejects a prop canvas on %s',type=>{
    expect(()=>manualPropCanvasOptions({width:192,height:64},type,false)).toThrow('only to new prop');
  });
  it.each([null,[],{},'192x64',{width:0,height:64},{width:192,height:-1},{width:4097,height:64},{width:192.5,height:64},{width:'192',height:64},{width:NaN,height:64},{width:192,height:Infinity}])('rejects invalid dimensions %j',value=>{
    expect(()=>manualPropCanvasOptions(value,'prop',false)).toThrow('whole prop dimensions');
  });
});
