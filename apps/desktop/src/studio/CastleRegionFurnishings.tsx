import { useEffect, useState } from 'react';
import { furnishingSilhouette, validFurnishingAsset, type CastleFurnishing } from './castle-furnishing-layout.js';
import type { CastleRegionPreview } from './CastleRegionBackdrop.js';

type Artwork = { url: string; width: number; height: number; bottomInset: number; halfWidth: number };

/** Saved furnishing composition; native physics remains the placement authority. */
export function CastleRegionFurnishings({ projectPath, plan }: { projectPath: string; plan: CastleRegionPreview }) {
  const [state, setState] = useState<{ projectPath: string; furnishings: CastleFurnishing[] | undefined; items: Map<string, Artwork>; failed: number } | null>(null);
  const furnishings = plan.furnishings;
  useEffect(() => {
    let cancelled = false;
    setState(null);
    const paths = [...new Set((furnishings ?? []).filter(validFurnishingAsset).map(item => item.asset))];
    void Promise.all(paths.map(async path => {
      const preview = await window.metroforge?.getAssetPreview(projectPath, path);
      if (!preview?.dataUrl) throw new Error('Furnishing artwork unavailable');
      const image = new Image();
      image.src = preview.dataUrl;
      await image.decode();
      const width = image.naturalWidth, height = image.naturalHeight;
      if (!width || !height || width * height > 4_194_304) throw new Error('Unsupported furnishing dimensions');
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Furnishing image decoding unavailable');
      context.drawImage(image, 0, 0);
      return [path, { url: preview.dataUrl, width, height, ...furnishingSilhouette(context.getImageData(0, 0, width, height).data, width, height) }] as const;
    }).map(promise => promise.then(value => ({ value }), () => ({ value: null })))).then(results => {
      if (!cancelled) setState({ projectPath, furnishings, items: new Map(results.flatMap(result => result.value ? [result.value] : [])), failed: results.filter(result => !result.value).length });
    });
    return () => { cancelled = true; };
  }, [projectPath, furnishings]);
  if (!furnishings?.length) return null;
  const current = state?.projectPath === projectPath && state.furnishings === furnishings ? state : null;
  return <g aria-label="Saved castle furnishings" data-furnishing-state={!current ? 'loading' : current.failed ? 'partial' : 'ready'} pointerEvents="none">
    <title>{!current ? 'Loading saved furnishings' : current.failed ? `${current.failed} furnishing images unavailable. Reload the room to retry.` : 'Saved furnishing layout. Play Preview verifies floor support and lighting.'}</title>
    {(!current || current.failed > 0) && <text x={64} y={96} fontSize={48} fill="var(--text-muted)">{!current ? 'Loading furnishings…' : 'Some furnishing artwork is unavailable. Reload the room to retry.'}</text>}
    {furnishings.filter(validFurnishingAsset).map((item: CastleFurnishing) => {
      const artwork = current?.items.get(item.asset);
      const section = plan.sections.find(section => section.id === item.sectionId);
      if (!artwork || !section || section.floorY !== item.floorY) return null;
      const scale = item.targetHeight / artwork.height;
      const width = artwork.width * scale;
      if (item.x - width / 2 < section.x + 160 || item.x + width / 2 > section.x + section.width - 160) return null;
      const centerY = item.mounting === 'rear-wall' ? item.floorY - 384 : item.floorY - item.targetHeight / 2 + artwork.bottomInset * scale;
      return <image key={item.id} data-furnishing-id={item.id} data-mounting={item.mounting} data-center-x={item.x} data-center-y={centerY} href={artwork.url} x={item.x - width / 2} y={centerY - item.targetHeight / 2} width={width} height={item.targetHeight} style={{ imageRendering: 'pixelated' }}><title>{`${item.chamberName}: ${item.role.replaceAll('_', ' ')} (${item.mounting})`}</title></image>;
    })}
  </g>;
}
