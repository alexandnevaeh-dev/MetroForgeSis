import { decodePngRgba } from '../png.js';
import { critiqueAnimationIdentity } from '../sprite-qa.js';

export interface MeasuredQaCheck { id: string; passed: boolean; value: number; threshold: number; detail: string }
export interface AnimationTemporalQa { passed: boolean; checks: MeasuredQaCheck[]; issues: string[] }
export interface FamilyCohesionQa { passed: boolean; checks: MeasuredQaCheck[]; assetMetrics: Array<{ id: string; meanRgb: [number, number, number]; saturation: number; opaqueCoverage: number }> }
export interface TilesetAdjacencyQa { passed: boolean; checks: MeasuredQaCheck[]; tileSize: number }

function metrics(png: Buffer): { meanRgb: [number, number, number]; saturation: number; opaqueCoverage: number } {
  const { rgba } = decodePngRgba(png); let r = 0, g = 0, b = 0, n = 0, sat = 0, opaque = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]! / 255; if (a <= 0.05) continue;
    const rr = rgba[i]!, gg = rgba[i + 1]!, bb = rgba[i + 2]!; r += rr; g += gg; b += bb; n++; if (a > .5) opaque++;
    sat += Math.max(rr, gg, bb) - Math.min(rr, gg, bb);
  }
  return { meanRgb: [r / Math.max(n, 1), g / Math.max(n, 1), b / Math.max(n, 1)], saturation: sat / Math.max(n, 1), opaqueCoverage: opaque / Math.max(1, rgba.length / 4) };
}

function channelSpread(values: number[]): number { return values.length ? Math.max(...values) - Math.min(...values) : 0; }

export function analyzeFamilyCohesion(assets: Array<{ id: string; png: Buffer }>): FamilyCohesionQa {
  const assetMetrics = assets.map(({ id, png }) => ({ id, ...metrics(png) }));
  const rgbSpread = Math.max(0, ...[0,1,2].map((channel) => channelSpread(assetMetrics.map((m) => m.meanRgb[channel] ?? 0))));
  const saturationSpread = channelSpread(assetMetrics.map((m) => m.saturation));
  const checks: MeasuredQaCheck[] = [
    { id: 'palette_mean_channel_spread', passed: rgbSpread <= 125, value: rgbSpread, threshold: 125, detail: 'Maximum spread of family mean RGB channels' },
    { id: 'saturation_spread', passed: saturationSpread <= 110, value: saturationSpread, threshold: 110, detail: 'Maximum family saturation-range spread' },
  ];
  return { passed: assets.length > 1 && checks.every((c) => c.passed), checks, assetMetrics };
}

export function analyzeAnimationTemporal(sheet: Buffer, frameWidth: number, expectedFrames: number): AnimationTemporalQa {
  const base = critiqueAnimationIdentity(sheet, { frameWidth, expectedFrames });
  const { rgba, width, height } = decodePngRgba(sheet); const frames = Math.floor(width / frameWidth);
  const paletteMeans: number[] = []; const coverages: number[] = [];
  for (let frame = 0; frame < frames; frame++) {
    const pixels = new Uint8Array(frameWidth * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < frameWidth; x++) {
      const src = (y * width + frame * frameWidth + x) * 4; const dst = (y * frameWidth + x) * 4;
      pixels.set(rgba.subarray(src, src + 4), dst);
    }
    const m = metricsFromRgba(pixels); paletteMeans.push((m.meanRgb[0] + m.meanRgb[1] + m.meanRgb[2]) / 3); coverages.push(m.opaqueCoverage);
  }
  const paletteDrift = channelSpread(paletteMeans); const scaleDrift = channelSpread(coverages);
  const checks: MeasuredQaCheck[] = [
    { id: 'static_animation_qa', passed: base.passed, value: base.issues.length, threshold: 0, detail: base.issues.map((i) => i.message).join('; ') || 'structurally valid' },
    { id: 'palette_drift', passed: paletteDrift <= 35, value: paletteDrift, threshold: 35, detail: 'Frame mean-luma drift' },
    { id: 'silhouette_scale_drift', passed: scaleDrift <= .25, value: scaleDrift, threshold: .25, detail: 'Opaque-coverage drift across frames' },
  ];
  return { passed: checks.every((c) => c.passed), checks, issues: base.issues.map((i) => `${i.code}: ${i.message}`) };
}

function metricsFromRgba(rgba: Uint8Array) {
  let r=0,g=0,b=0,n=0,opaque=0;
  for(let i=0;i<rgba.length;i+=4){if(rgba[i+3]!<=12)continue;r+=rgba[i]!;g+=rgba[i+1]!;b+=rgba[i+2]!;n++;if(rgba[i+3]!>127)opaque++;}
  return { meanRgb:[r/Math.max(1,n),g/Math.max(1,n),b/Math.max(1,n)] as [number,number,number], opaqueCoverage:opaque/Math.max(1,rgba.length/4) };
}

export function analyzeTilesetAdjacency(atlas: Buffer, tileSize: number): TilesetAdjacencyQa {
  const { rgba, width, height } = decodePngRgba(atlas); const cols = Math.floor(width / tileSize); const rows = Math.floor(height / tileSize);
  let horizontal = 0, vertical = 0, hn = 0, vn = 0;
  for (let ty=0;ty<rows;ty++) for(let tx=0;tx<cols;tx++) for(let p=0;p<tileSize;p++) {
    const left=((ty*tileSize+p)*width+tx*tileSize)*4, right=((ty*tileSize+p)*width+tx*tileSize+tileSize-1)*4;
    const top=((ty*tileSize)*width+tx*tileSize+p)*4, bottom=((ty*tileSize+tileSize-1)*width+tx*tileSize+p)*4;
    for(let c=0;c<3;c++){horizontal+=Math.abs(rgba[left+c]!-rgba[right+c]!);vertical+=Math.abs(rgba[top+c]!-rgba[bottom+c]!);hn++;vn++;}
  }
  const h=horizontal/Math.max(1,hn),v=vertical/Math.max(1,vn); const threshold=72;
  const checks=[{id:'horizontal_repeat_edges',passed:h<=threshold,value:h,threshold,detail:'Mean opposite-edge RGB delta'}, {id:'vertical_repeat_edges',passed:v<=threshold,value:v,threshold,detail:'Mean opposite-edge RGB delta'}];
  return { passed: cols>=8 && rows>=6 && checks.every((c)=>c.passed), checks, tileSize };
}
