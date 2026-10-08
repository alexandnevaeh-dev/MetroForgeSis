import { useEffect, useRef, useState } from 'react';
import type { AssetRecord } from './types.js';
import { Button, Input } from './ui/index.js';
import {animationSourceLayout} from './animation-source-layout.js';

export function animationFrameRect(
  width: number, height: number, count: number, frame: number,
  authoredWidth?: number, authoredHeight?: number,
) {
  const w = authoredWidth ?? width / count;
  const h = authoredHeight ?? height;
  if (![w, h, count].every(v => Number.isInteger(v) && v > 0)) return null;
  const columns = Math.floor(width / w);
  const rows = Math.floor(height / h);
  if (columns < 1 || rows < 1 || count > columns * rows) return null;
  const index = ((Math.trunc(frame) % count) + count) % count;
  return { x: (index % columns) * w, y: Math.floor(index / columns) * h, width: w, height: h };
}

export function AnimationPreview({ asset, frame, playing, onToggle, onStep, onSeek, loadSource, onReady }: {
  asset: AssetRecord; frame: number; playing: boolean; onToggle: () => void; onStep: () => void; onSeek: (frame: number) => void;
  loadSource?: (path:string)=>Promise<{dataUrl?:string}>; onReady?: (ready:boolean)=>void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loadedImages, setImages] = useState<HTMLImageElement[] | null>(null);
  const [loadedKey,setLoadedKey]=useState('');
  const [failed, setFailed] = useState(false);
  const [retry,setRetry]=useState(0);
  const paths=asset.sourceFrames ?? (asset.sourceSheet ? [asset.sourceSheet] : []);
  const pathKey=JSON.stringify(paths);
  const sourceKey=JSON.stringify([asset.dataUrl,pathKey]);
  const images=loadedKey===sourceKey?loadedImages:null;
  useEffect(() => {
    let current = true;
    setImages(null); setFailed(false);
    const decode=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
      const next=new Image(); next.onload=()=>resolve(next); next.onerror=reject; next.src=url;
    });
    const request=paths.length ? Promise.all(paths.map(async path=>{
      const preview=await loadSource?.(path);
      if(!preview?.dataUrl)throw Error('Source unavailable');
      return decode(preview.dataUrl);
    })) : asset.dataUrl ? decode(asset.dataUrl).then(image=>[image]) : Promise.reject(Error('Image unavailable'));
    request.then(value=>{if(current){setImages(value);setLoadedKey(sourceKey);}}).catch(()=>{if(current)setFailed(true);});
    return () => { current = false; };
  }, [asset.dataUrl,pathKey,loadSource,retry]);
  const count = asset.frameCount ?? 0;
  const image=images?.[0]??null;
  const sourceLayout=paths.length && images ? animationSourceLayout(asset,images.map(i=>({width:i.naturalWidth,height:i.naturalHeight}))) : null;
  const rect = image ? animationFrameRect(image.naturalWidth, image.naturalHeight, count, frame, asset.frameWidth, asset.frameHeight) : null;
  const ready=Boolean(images && !failed && !asset.animationSourceError && (paths.length ? sourceLayout : rect));
  useEffect(()=>{onReady?.(ready);},[ready,onReady]);
  useEffect(() => {
    if (!ready || !canvas.current) return;
    const target = canvas.current;
    if(sourceLayout && images){
      target.width=sourceLayout.width; target.height=sourceLayout.height;
      const context=target.getContext('2d');
      if(!context)return;
      context.imageSmoothingEnabled=false;
      context.clearRect(0,0,target.width,target.height);
      const index=((Math.trunc(frame)%count)+count)%count;
      const item=sourceLayout.frames[index]!;
      const r=item.source,d=item.destination;
      context.drawImage(images[item.image]!,r[0],r[1],r[2],r[3],d.x,d.y,d.width,d.height);
      return;
    }
    if(!image||!rect)return;
    target.width = rect.width; target.height = rect.height;
    const context = target.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, rect.width, rect.height);
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  }, [ready,images,frame,sourceLayout,rect?.x,rect?.y,rect?.width,rect?.height]);
  const invalid=asset.animationSourceError || (images && paths.length && !sourceLayout);
  if (image && !paths.length && !rect && !invalid) return <div><img className="detail-preview" src={asset.dataUrl} alt={asset.id} /><p className="hint">Frame metadata is missing or does not match this sheet. Showing the full image.</p></div>;
  return <div className="anim-preview">
    <div className="anim-viewport">
      {invalid ? <p className="hint" role="alert">Animation frame metadata does not match its source images. Check the animation metadata.</p>
        : failed ? <div><p className="hint" role="alert">Animation frames could not be loaded. Check the source files.</p><Button type="button" onClick={()=>setRetry(v=>v+1)}>Retry</Button></div>
          : !images ? <p className="hint" role="status">Loading animation…</p>
            : <canvas ref={canvas} role="img" aria-label={asset.id + ', frame ' + (frame % count + 1)} />}
    </div>
    <div className="row">
      <Button type="button" disabled={!ready} onClick={onToggle}>{playing ? 'Pause' : asset.loop === false && count>0 && frame >= count - 1 ? 'Replay' : 'Play'}</Button>
      <Button type="button" disabled={!ready} onClick={onStep}>Frame step</Button>
      <label>Frame<Input type="range" min={0} max={Math.max(0,count - 1)} step={1} disabled={!ready} value={count?frame % count:0} aria-label="Animation frame" aria-valuetext={`Frame ${count?frame % count + 1:0} of ${count}`} onChange={(event) => onSeek(Number(event.currentTarget.value))} /></label>
      <span>Frame {count?frame % count + 1:0}/{count}</span>
    </div>
    <p className="hint" aria-label="Animation timing">{asset.fps ? `${asset.fps} fps · ${(count / asset.fps).toFixed(2)}s` : 'Authored timing unavailable; preview uses 8 fps'} · {asset.loop === false ? 'Plays once' : asset.loop === true ? 'Loops' : 'Loop metadata unavailable; preview loops'}</p>
  </div>;
}
