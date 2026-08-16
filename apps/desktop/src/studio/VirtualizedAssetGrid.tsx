import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetRecord } from './types.js';
import { Badge } from './ui/index.js';

const CARD_HEIGHT = 148;
const CARD_WIDTH = 148;
const OVERSCAN = 4;

function maturityLabel(asset: AssetRecord): string {
  const raw = (asset.maturity ?? (asset.fallbackGenerated ? 'PLACEHOLDER' : '')).toUpperCase();
  switch (raw) {
    case 'PLACEHOLDER':
      return 'Placeholder';
    case 'BLOCKOUT':
      return 'Blockout';
    case 'GENERATED_SOURCE':
      return 'Generated';
    case 'COMPILED':
      return 'Compiled';
    case 'QA_REVIEW':
      return 'Needs Review';
    case 'PRODUCTION_READY':
      return 'Production Ready';
    case 'REJECTED':
      return 'Rejected';
    default:
      return asset.fallbackGenerated ? 'Placeholder' : 'Unknown';
  }
}

function maturityTone(asset: AssetRecord): 'success' | 'warning' | 'danger' | 'muted' | 'info' {
  const raw = (asset.maturity ?? '').toUpperCase();
  if (asset.productionReady || raw === 'PRODUCTION_READY') return 'success';
  if (asset.critiquePassed === false || raw === 'REJECTED') return 'danger';
  if (asset.fallbackGenerated || raw === 'PLACEHOLDER' || raw === 'QA_REVIEW') return 'warning';
  if (raw === 'COMPILED' || raw === 'GENERATED_SOURCE') return 'info';
  return 'muted';
}

interface VirtualizedAssetGridProps {
  assets: AssetRecord[];
  selectedId?: string;
  onSelect: (asset: AssetRecord) => void;
}

export function VirtualizedAssetGrid({ assets, selectedId, onSelect }: VirtualizedAssetGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const [viewportWidth, setViewportWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
      setViewportWidth(el.clientWidth);
    });
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    setViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const columns = useMemo(
    () => Math.max(1, Math.floor(viewportWidth / (CARD_WIDTH + 12))),
    [viewportWidth],
  );

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
              className={selectedId === asset.id ? 'asset-card dense selected' : 'asset-card dense'}
              style={{
                position: 'absolute',
                top: row * CARD_HEIGHT,
                left: col * (CARD_WIDTH + 12),
                width: CARD_WIDTH,
                height: CARD_HEIGHT - 8,
              }}
              onClick={() => onSelect(asset)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(asset);
                }
              }}
            >
              {asset.dataUrl ? (
                <img src={asset.dataUrl} alt={asset.id} />
              ) : (
                <div className="asset-placeholder">{asset.category}</div>
              )}
              <div className="asset-card-badges">
                <Badge tone={maturityTone(asset)} className="asset-maturity-badge">
                  {maturityLabel(asset)}
                </Badge>
                {asset.provider ? (
                  <Badge tone="muted" className="asset-provider-badge">
                    {asset.provider}
                  </Badge>
                ) : null}
                {typeof asset.critiqueScore === 'number' ? (
                  <Badge
                    tone={asset.critiquePassed === false ? 'danger' : asset.critiquePassed ? 'success' : 'muted'}
                    className="asset-qa-badge"
                  >
                    QA {asset.critiqueScore}
                  </Badge>
                ) : null}
              </div>
              <figcaption>
                <strong>{asset.id}</strong>
                <span>{asset.category}</span>
              </figcaption>
            </button>
          );
        })}
      </div>
    </div>
  );
}
