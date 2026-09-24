import { useEffect, useRef, useState } from 'react';
import type { TerrainPresentation } from '@metroforge/engines';

/** An unsaved appearance swatch, not a simulation of Unity's tiled geometry. */
export function TerrainAppearancePreview({ dataUrl, settings }: { dataUrl?: string; settings: TerrainPresentation }) {
 const canvas = useRef<HTMLCanvasElement>(null);
 const [image, setImage] = useState<HTMLImageElement | null>(null);
 const [failed, setFailed] = useState(false);
 useEffect(() => {
  let alive = true;
  setImage(null); setFailed(false);
  if (!dataUrl) return;
  const next = new Image();
  next.onload = () => { if (alive) setImage(next); };
  next.onerror = () => { if (alive) setFailed(true); };
  next.src = dataUrl;
  return () => { alive = false; };
 }, [dataUrl]);
 const { x, y, width, height, tintR, tintG, tintB, smoothFiltering } = settings;
 const valid = !!image && [x,y,width,height,tintR,tintG,tintB].every(Number.isFinite)
  && x >= 0 && y >= 0 && width > 0 && height > 0
  && x + width <= image.naturalWidth && y + height <= image.naturalHeight
  && [tintR,tintG,tintB].every(value => value >= 0 && value <= 1);
 useEffect(() => {
  if (!valid || !image || !canvas.current) return;
  const target = canvas.current;
  const scale = Math.min(1, 320 / Math.max(width, height));
  target.width = Math.max(1, Math.round(width * scale));
  target.height = Math.max(1, Math.round(height * scale));
  const context = target.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  context.imageSmoothingEnabled = smoothFiltering;
  context.drawImage(image, x, image.naturalHeight - y - height, width, height, 0, 0, target.width, target.height);
  const pixels = context.getImageData(0, 0, target.width, target.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
   pixels.data[i] *= tintR; pixels.data[i + 1] *= tintG; pixels.data[i + 2] *= tintB;
  }
  context.putImageData(pixels, 0, 0);
 }, [image, valid, x, y, width, height, tintR, tintG, tintB, smoothFiltering]);
 return <div className="terrain-appearance-preview">
  <p className="hint">Live crop and tint · unsaved draft</p>
  {!dataUrl || failed ? <p className="hint">Source image unavailable.</p>
   : !image ? <p role="status">Loading appearance preview…</p>
   : !valid ? <p className="hint">Enter a crop within the image and tint values from 0 to 1.</p>
   : <canvas ref={canvas} role="img" aria-label="Terrain crop and tint preview" style={{maxWidth:'100%',height:'auto',imageRendering:smoothFiltering?'auto':'pixelated'}} />}
  <p className="hint">Tiling, borders and world scale require saving and restarting Unity preview.</p>
 </div>;
}
