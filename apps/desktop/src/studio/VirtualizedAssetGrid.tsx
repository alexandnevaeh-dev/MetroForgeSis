import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetRecord } from './types';

const CARD_HEIGHT = 168;
const OVERSCAN = 4;

interface VirtualizedAssetGridProps {
  assets: AssetRecord[];
  selectedId?: string;
  onSelect: (asset: AssetRecord) => void;
}

export function VirtualizedAssetGrid({ assets, selectedId, onSelect }: VirtualizedAssetGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const columns = useMemo(() => {
    const width = containerRef.current?.clientWidth ?? 800;
    return Math.max(1, Math.floor(width / 180));
  }, [viewportHeight, assets.length]);

  const rowCount = Math.ceil(assets.length / columns);
  const totalHeight = rowCount * CARD_HEIGHT;
  const startRow = Math.max(0, Math.floor(scrollTop / CARD_HEIGHT) - OVERSCAN);
  const endRow = Math.min(rowCount, Math.ceil((scrollTop + viewportHeight) / CARD_HEIGHT) + OVERSCAN);
  const visible = assets.slice(startRow * columns, endRow * columns);

  const onScroll = useCallback(() => {
    if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
  }, []);

  return (
    <div ref={containerRef} className="virtualized-grid" onScroll={onScroll}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visible.map((asset, index) => {
          const absoluteIndex = startRow * columns + index;
          const row = Math.floor(absoluteIndex / columns);
          const col = absoluteIndex % columns;
          return (
            <button
              key={asset.id}
              type="button"
              className={selectedId === asset.id ? 'asset-card selected' : 'asset-card'}
              style={{
                position: 'absolute',
                top: row * CARD_HEIGHT,
                left: col * 180,
                width: 168,
                height: CARD_HEIGHT - 8,
              }}
              onClick={() => onSelect(asset)}
            >
              {asset.dataUrl ? (
                <img src={asset.dataUrl} alt={asset.id} />
              ) : (
                <div className="asset-placeholder">{asset.category}</div>
              )}
              <figcaption>
                <strong>{asset.id}</strong>
                <span>{asset.provider ?? 'unknown'}</span>
              </figcaption>
            </button>
          );
        })}
      </div>
    </div>
  );
}
