import type {AssetRecord} from './types.js';

export function animationSourceLayout(asset: AssetRecord, sizes: Array<{width:number;height:number}>) {
  const regions=asset.sourceRegions, anchors=asset.frameFootAnchors, scale=asset.displayScale;
  if (!regions?.length || !anchors || anchors.length!==regions.length || !scale || !Number.isFinite(scale) || scale<=0
    || asset.frameCount!==regions.length || sizes.length!==(asset.sourceFrames ? regions.length : 1)) return null;
  for(let i=0;i<regions.length;i++) {
    const r=regions[i]!,a=anchors[i]!,size=sizes[asset.sourceFrames?i:0];
    if (!size || r.length!==4 || a.length!==2 || ![...r,...a,size.width,size.height].every(Number.isFinite)
      || r[0]<0 || r[1]<0 || r[2]<=0 || r[3]<=0 || r[0]+r[2]>size.width || r[1]+r[3]>size.height) return null;
  }
  const left=Math.min(...anchors.map(a=>-a[0]*scale)),top=Math.min(...anchors.map(a=>-a[1]*scale));
  const right=Math.max(...regions.map((r,i)=>(r[2]-anchors[i]![0])*scale));
  const bottom=Math.max(...regions.map((r,i)=>(r[3]-anchors[i]![1])*scale));
  const width=Math.ceil(right-left),height=Math.ceil(bottom-top);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>4096||height>4096) return null;
  return {width,height,frames:regions.map((source,i)=>({image:asset.sourceFrames?i:0,source,
    destination:{x:-anchors[i]![0]*scale-left,y:-anchors[i]![1]*scale-top,width:source[2]*scale,height:source[3]*scale}}))};
}
