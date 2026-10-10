import { describe, expect, it } from 'vitest';
import { applyMaterialColors } from './material-colors.js';
import { encodePng, decodePngRgba } from './png.js';
const source = () => encodePng(3, 1, new Uint8Array([100, 50, 50, 255, 50, 25, 25, 128, 100, 50, 50, 0]));
const rule = (extra = {}) => ({ region: { x: 0, y: 0, width: 3, height: 1 }, from: '#643232', to: '#202020', tolerance: 50, preserveShading: true, ...extra });
describe('Material color correction', () => {
  it('preserves dimensions, every alpha value and relative shading without recoloring hidden pixels', () => {
    const result = applyMaterialColors(source(), [rule()]), pixels = decodePngRgba(result.buffer);
    expect([pixels.width, pixels.height, result.changedPixels]).toEqual([3, 1, 2]);
    expect([...pixels.rgba]).toEqual([32,32,32,255,16,16,16,128,100,50,50,0]);
  });
  it('limits edits to the rectangle and exact color when tolerance is zero', () => {
    const result = applyMaterialColors(source(), [rule({ tolerance: 0, region: { x: 1, y: 0, width: 1, height: 1 } })]);
    expect(result.changedPixels).toBe(0);
    expect([...decodePngRgba(result.buffer).rgba]).toEqual([...decodePngRgba(source()).rgba]);
  });
  it('uses the original pixels for overlapping rules instead of cascading prior replacements', () => {
    const result = applyMaterialColors(source(), [rule({ tolerance:0, preserveShading:false }), rule({ from:'#202020', to:'#ffffff', tolerance:0, preserveShading:false })]);
    expect([...decodePngRgba(result.buffer).rgba].slice(0,4)).toEqual([32,32,32,255]);
  });
  it('rejects malformed colors, bounds, flags and tolerance', () => {
    for (const patch of [{ from:'red' }, { to:'#abc' }, { tolerance:NaN }, { tolerance:256 }, { preserveShading:'yes' }, { region:{x:-1,y:0,width:1,height:1} }, { region:{x:0,y:0,width:4,height:1} }, { region:{x:0.5,y:0,width:1,height:1} }])
      expect(() => applyMaterialColors(source(), [rule(patch)])).toThrow();
    expect(() => applyMaterialColors(source(), [])).toThrow();
  });
});
