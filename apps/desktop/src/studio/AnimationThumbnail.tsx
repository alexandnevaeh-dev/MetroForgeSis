import { useEffect, useRef, useState } from 'react';
import type { AssetRecord } from './types.js';

/** Static first authored frame; only mounted (virtualized) cards read a source. */
export function AnimationThumbnail({ asset, loadSource }: {
  asset: AssetRecord;
  loadSource: (path: string) => Promise<{ dataUrl?: string }>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const path = asset.sourceFrames?.[0] ?? asset.sourceSheet;
  const region = asset.sourceRegions?.[0];
  const regionKey = JSON.stringify(region);
  const key = JSON.stringify([path, regionKey, asset.animationSourceError]);
  const [loadedKey, setLoadedKey] = useState('');
  useEffect(() => {
    let current = true;
    setState('loading');
    if (!path || !region || asset.animationSourceError) {
      setState('failed'); return;
    }
    loadSource(path).then(preview => new Promise<HTMLImageElement>((resolve, reject) => {
      if (!preview.dataUrl) { reject(Error('Source unavailable')); return; }
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject;
      image.src = preview.dataUrl;
    })).then(image => {
      if (!current || !canvas.current) return;
      const [x,y,w,h] = region;
      if (![x,y,w,h].every(Number.isFinite) || x<0 || y<0 || w<=0 || h<=0 || x+w>image.naturalWidth || y+h>image.naturalHeight) throw Error('Invalid frame bounds');
      const target = canvas.current;
      // Bound thumbnail pixels independently of the source's working resolution.
      const scale = Math.min(1, 216 / Math.max(w,h));
      target.width = Math.max(1,Math.round(w*scale)); target.height = Math.max(1,Math.round(h*scale));
      const context = target.getContext('2d');
      if (!context) throw Error('Preview unavailable');
      context.imageSmoothingEnabled = false;
      context.clearRect(0,0,target.width,target.height);
      context.drawImage(image,x,y,w,h,0,0,target.width,target.height);
      setLoadedKey(key); setState('ready');
    }).catch(() => { if (current) setState('failed'); });
    return () => { current = false; };
  }, [path,regionKey,asset.animationSourceError,loadSource]);
  const ready = state==='ready' && loadedKey===key;
  return <div className="asset-animation-thumbnail" aria-busy={state==='loading'}>
    <canvas ref={canvas} hidden={!ready} role="img" aria-label={`${asset.id}, first authored frame`} />
    {!ready && <span>{state==='failed' ? 'Frame unavailable' : 'Loading frame…'}</span>}
  </div>;
}
