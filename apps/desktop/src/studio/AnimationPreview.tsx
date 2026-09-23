import { useEffect, useRef, useState } from 'react';
import type { AssetRecord } from './types.js';
import { Button, Input } from './ui/index.js';

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

export function AnimationPreview({ asset, frame, playing, onToggle, onStep, onSeek }: {
  asset: AssetRecord; frame: number; playing: boolean; onToggle: () => void; onStep: () => void; onSeek: (frame: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setImage(null); setFailed(false);
    const next = new Image();
    next.onload = () => { if (current) setImage(next); };
    next.onerror = () => { if (current) setFailed(true); };
    next.src = asset.dataUrl ?? '';
    return () => { current = false; };
  }, [asset.dataUrl]);
  const count = asset.frameCount ?? 0;
  const rect = image ? animationFrameRect(image.naturalWidth, image.naturalHeight, count, frame, asset.frameWidth, asset.frameHeight) : null;
  useEffect(() => {
    if (!image || !rect || !canvas.current) return;
    const target = canvas.current;
    target.width = rect.width; target.height = rect.height;
    const context = target.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, rect.width, rect.height);
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  }, [image, rect?.x, rect?.y, rect?.width, rect?.height]);
  if (failed) return <p className="hint" role="alert">Animation image could not be loaded.</p>;
  if (!image) return <p className="hint" role="status">Loading animation…</p>;
  if (!rect) return <div><img className="detail-preview" src={asset.dataUrl} alt={asset.id} /><p className="hint">Frame metadata is missing or does not match this sheet. Showing the full image.</p></div>;
  return <div className="anim-preview">
    <div className="anim-viewport"><canvas ref={canvas} role="img" aria-label={asset.id + ', frame ' + (frame % count + 1)} /></div>
    <div className="row">
      <Button type="button" onClick={onToggle}>{playing ? 'Pause' : 'Play'}</Button>
      <Button type="button" onClick={onStep}>Frame step</Button>
      <label>Frame<Input type="range" min={0} max={count - 1} step={1} value={frame % count} aria-label="Animation frame" aria-valuetext={`Frame ${frame % count + 1} of ${count}`} onChange={(event) => onSeek(Number(event.currentTarget.value))} /></label>
      <span>Frame {frame % count + 1}/{count}</span>
    </div>
  </div>;
}
