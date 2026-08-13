import { useEffect, useState } from 'react';

export function TilesetPreview({
  projectPath,
  biomeId,
}: {
  projectPath: string;
  biomeId: string;
}) {
  const [preview, setPreview] = useState<{
    dataUrl?: string;
    tileSize?: number;
    atlasSize?: number;
    path?: string;
  } | null>(null);

  useEffect(() => {
    if (!projectPath || !window.metroforge?.getTilesetPreview) return;
    window.metroforge.getTilesetPreview(projectPath, biomeId).then(setPreview);
  }, [projectPath, biomeId]);

  if (!preview?.dataUrl) return <p className="hint">No tileset atlas found.</p>;

  const tileSize = preview.tileSize ?? 16;
  const cols = Math.floor((preview.atlasSize ?? 128) / tileSize);

  return (
    <div className="tileset-preview panel">
      <h4>{biomeId}</h4>
      <div className="tileset-atlas-wrap">
        <img src={preview.dataUrl} alt={biomeId} className="tileset-atlas" />
        <div
          className="tileset-grid-overlay"
          style={{
            backgroundSize: `${tileSize}px ${tileSize}px`,
            width: preview.atlasSize,
            height: preview.atlasSize,
          }}
        />
      </div>
      <p className="hint">
        {preview.path} · {cols}×{cols} tiles @ {tileSize}px
      </p>
    </div>
  );
}

export function AudioPreview({ projectPath, relPath }: { projectPath: string; relPath: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!projectPath || !relPath || !window.metroforge?.getAudioPreview) return;
    window.metroforge.getAudioPreview(projectPath, relPath).then((r) => {
      if (r.dataUrl) setSrc(r.dataUrl);
    });
  }, [projectPath, relPath]);

  if (!src) return <p className="hint">Audio unavailable</p>;

  return (
    <div className="audio-preview panel">
      <audio controls src={src} style={{ width: '100%' }} />
      <code>{relPath}</code>
    </div>
  );
}
