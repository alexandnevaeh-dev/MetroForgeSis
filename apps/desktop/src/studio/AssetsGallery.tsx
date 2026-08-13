import { useEffect, useMemo, useState } from 'react';
import type { AssetRecord } from './types.js';
import { categorizeAssetPath, GALLERY_CATEGORIES } from './types.js';
import { TilesetPreview, AudioPreview } from './MediaPreviews.js';
import { VirtualizedAssetGrid } from './VirtualizedAssetGrid.js';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';

export function AssetsGallery() {
  const { selectedPath, hasActiveProject, openRoom, openGenerator, focusAssetId } = useStudio();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AssetRecord | null>(null);
  const [animPlaying, setAnimPlaying] = useState(true);
  const [animFrame, setAnimFrame] = useState(0);
  const [loading, setLoading] = useState(false);
  const [usages, setUsages] = useState<Array<{ type: string; id: string; detail?: string }> | null>(
    null,
  );
  const [history, setHistory] = useState<
    Array<{ version: number; timestamp: string; prompt?: string; provider?: string; backupPath?: string }>
  >([]);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [compareUrl, setCompareUrl] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);

  const reloadAssets = () => {
    if (!selectedPath || !window.metroforge?.listAssets) return;
    setLoading(true);
    window.metroforge
      .listAssets(selectedPath)
      .then((list) => setAssets(list))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reloadAssets();
  }, [selectedPath]);

  const runBackfill = async () => {
    if (!selectedPath || !window.metroforge?.backfillAssetMaturity) return;
    setBackfillBusy(true);
    setBackfillMessage(null);
    try {
      const result = await window.metroforge.backfillAssetMaturity(selectedPath);
      if (!result.success) {
        setBackfillMessage(result.errors?.join('; ') ?? 'Backfill failed');
        return;
      }
      setBackfillMessage(
        `Backfill maturity: updated ${result.updatedCount} / ${result.artifactCount} artifacts` +
          (result.skippedCount ? ` (${result.skippedCount} already complete)` : ''),
      );
      reloadAssets();
    } catch (err) {
      setBackfillMessage(String(err));
    } finally {
      setBackfillBusy(false);
    }
  };

  useEffect(() => {
    if (!selectedPath || !selected || !window.metroforge?.getAssetUsages) {
      setUsages(null);
      return;
    }
    window.metroforge.getAssetUsages(selectedPath, selected.id).then((u) => setUsages(u?.usedIn ?? null));
    window.metroforge.getAssetHistory?.(selectedPath, selected.id).then((h) => {
      setHistory(h ?? []);
      setCompareVersion(null);
      setCompareUrl(null);
    });
  }, [selectedPath, selected?.id]);

  useEffect(() => {
    if (!selectedPath || compareVersion == null || !selected) return;
    const record = history.find((h) => h.version === compareVersion);
    if (!record?.backupPath) return;
    window.metroforge?.getAssetVersionPreview?.(selectedPath, record.backupPath).then((p) => {
      setCompareUrl(p?.dataUrl ?? null);
    });
  }, [selectedPath, selected?.id, compareVersion, history]);

  useEffect(() => {
    if (!selected?.isAnimation || !animPlaying) return;
    const frames = selected.frameCount ?? 4;
    const id = window.setInterval(() => setAnimFrame((f) => (f + 1) % frames), 180);
    return () => window.clearInterval(id);
  }, [selected, animPlaying]);

  const classified = useMemo(
    () => assets.map((asset) => ({ ...asset, category: categorizeAssetPath(asset.path) || asset.category })),
    [assets],
  );

  useEffect(() => {
    if (!focusAssetId) return;
    const found = classified.find((asset) => asset.id === focusAssetId);
    if (found) setSelected(found);
  }, [focusAssetId, classified]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classified.filter((a) => {
      if (category !== 'All' && a.category !== category) return false;
      if (!q) return true;
      return (
        a.id.toLowerCase().includes(q) ||
        a.path.toLowerCase().includes(q) ||
        (a.provider ?? '').toLowerCase().includes(q) ||
        (a.prompt ?? '').toLowerCase().includes(q)
      );
    });
  }, [classified, category, query]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const asset of classified) {
      map.set(asset.category, (map.get(asset.category) ?? 0) + 1);
    }
    return map;
  }, [classified]);

  return (
    <section>
      <ScreenHeader
        eyebrow="Library"
        title="Asset Gallery"
        description="Browse real project artifacts. Previews, animation playback, tiles, and audio use IPC — empty categories mean the project has no files of that type yet."
        actions={<ProjectSelect />}
      />
      <NoProjectHint />

      {hasActiveProject && (
        <>
      <div className="toolbar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search id, path, provider, prompt…"
          aria-label="Search assets"
        />
        <button type="button" disabled={!selectedPath || backfillBusy} onClick={() => void runBackfill()}>
          {backfillBusy ? 'Backfilling…' : 'Backfill maturity'}
        </button>
      </div>
      {backfillMessage && <p className="hint">{backfillMessage}</p>}

      <div className="category-bar row" role="tablist" aria-label="Asset categories">
        {GALLERY_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            className={category === c ? 'tab active' : 'tab'}
            onClick={() => setCategory(c)}
          >
            {c}
            {c !== 'All' && counts.get(c) ? ` ${counts.get(c)}` : c === 'All' ? ` ${classified.length}` : ''}
          </button>
        ))}
      </div>

      {loading && <p className="hint">Loading assets…</p>}

      {!loading && classified.length === 0 && (
        <div className="empty-state panel">
          <p>No assets in this project yet.</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => openGenerator()}>
              Manual Generator
            </button>
          </div>
        </div>
      )}

      {!loading && classified.length > 0 && filtered.length === 0 && (
        <div className="empty-state panel">
          <p>No assets match this search or category.</p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategory('All');
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
      <div className="gallery-layout">
        <VirtualizedAssetGrid
          assets={filtered}
          selectedId={selected?.id}
          onSelect={setSelected}
        />

        {selected && (
          <aside className="asset-detail panel">
            <h3>{selected.id}</h3>
            {selected.isAnimation && selected.dataUrl ? (
              <AnimationPreview
                asset={selected}
                frame={animFrame}
                playing={animPlaying}
                onToggle={() => setAnimPlaying((p) => !p)}
                onStep={() => setAnimFrame((f) => (f + 1) % (selected.frameCount ?? 4))}
              />
            ) : selected.dataUrl ? (
              <button type="button" className="zoom-preview" onClick={() => setZoomOpen(true)}>
                <img className="detail-preview" src={selected.dataUrl} alt={selected.id} />
              </button>
            ) : null}
            <dl className="settings-dl">
              <dt>Path</dt>
              <dd><code>{selected.path}</code></dd>
              <dt>Category</dt>
              <dd>{selected.category}</dd>
              <dt>Provider</dt>
              <dd>{selected.provider ?? '—'}</dd>
              <dt>Maturity</dt>
              <dd>
                {selected.maturity ??
                  (selected.fallbackGenerated ? 'PLACEHOLDER' : '—')}
                {selected.productionReady === true
                  ? ' · production-ready'
                  : selected.productionReady === false
                    ? ' · not production-ready'
                    : ''}
                {selected.sourceType ? ` · ${selected.sourceType}` : ''}
                {selected.fallbackGenerated ? ' · procedural fallback' : ''}
              </dd>
              <dt>QA</dt>
              <dd>{selected.critiquePassed ? 'Passed' : 'Needs review'} ({selected.critiqueScore ?? '—'})</dd>
              {selected.prompt && (
                <>
                  <dt>Prompt</dt>
                  <dd>{selected.prompt}</dd>
                </>
              )}
              {usages && usages.length > 0 && (
                <>
                  <dt>Where Used</dt>
                  <dd>
                    {usages.map((u) => (
                      <button
                        key={`${u.type}-${u.id}`}
                        type="button"
                        className="tab"
                        onClick={() => {
                          if (u.type.toLowerCase().includes('room')) openRoom(u.id);
                        }}
                      >
                        {u.type}:{u.id}
                      </button>
                    ))}
                  </dd>
                </>
              )}
              {history.length > 0 && (
                <>
                  <dt>Version History</dt>
                  <dd className="version-list">
                    {history.map((v) => (
                      <div key={v.version} className="row">
                        <button
                          type="button"
                          className="tab"
                          onClick={async () => {
                            if (!selectedPath || !selected) return;
                            const result = await window.metroforge?.restoreAssetVersion?.(
                              selectedPath,
                              selected.id,
                              v.version,
                            );
                            if (result?.success) {
                              const list = await window.metroforge!.listAssets(selectedPath);
                              setAssets(list);
                              const refreshed = list.find((a) => a.id === selected.id);
                              if (refreshed) setSelected(refreshed);
                            }
                          }}
                        >
                          Restore v{v.version}
                        </button>
                        <button type="button" className="tab" onClick={() => setCompareVersion(v.version)}>
                          Compare v{v.version}
                        </button>
                        <span className="hint">{new Date(v.timestamp).toLocaleString()}</span>
                      </div>
                    ))}
                  </dd>
                </>
              )}
              {compareUrl && selected.dataUrl && (
                <>
                  <dt>Version Compare</dt>
                  <dd className="asset-compare">
                    <figure>
                      <img src={selected.dataUrl} alt="current" />
                      <figcaption>Current</figcaption>
                    </figure>
                    <figure>
                      <img src={compareUrl} alt="historical" />
                      <figcaption>v{compareVersion}</figcaption>
                    </figure>
                  </dd>
                </>
              )}
            </dl>
            {selected.category === 'Tileset' && selectedPath && (
              <TilesetPreview
                projectPath={selectedPath}
                biomeId={selected.path.match(/biome_(\d+)/)?.[0] ?? 'biome_0'}
              />
            )}
            {(selected.category === 'SFX' || selected.category === 'Music' || selected.category === 'Voice') &&
              selectedPath && <AudioPreview projectPath={selectedPath} relPath={selected.path} />}
            <div className="row" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="primary"
                onClick={() =>
                  openGenerator({
                    description: selected.prompt || `Regenerate ${selected.id} in this project's art style.`,
                    assetType: categoryToAssetType(selected.category),
                    assetId: selected.id,
                  })
                }
              >
                Open in Manual Generator
              </button>
            </div>
          </aside>
        )}
      </div>
      )}
      {zoomOpen && selected?.dataUrl && (
        <button type="button" className="zoom-overlay" onClick={() => setZoomOpen(false)} aria-label="Close zoom">
          <img src={selected.dataUrl} alt={selected.id} />
        </button>
      )}
        </>
      )}
    </section>
  );
}

function AnimationPreview({
  asset,
  frame,
  playing,
  onToggle,
  onStep,
}: {
  asset: AssetRecord;
  frame: number;
  playing: boolean;
  onToggle: () => void;
  onStep: () => void;
}) {
  const frames = asset.frameCount ?? 4;
  const clipStyle = {
    width: '128px',
    height: '32px',
    objectFit: 'contain' as const,
    objectPosition: `-${frame * 32}px 0`,
  };

  return (
    <div className="anim-preview">
      <div className="anim-viewport">
        <img src={asset.dataUrl} alt={asset.id} style={clipStyle} />
      </div>
      <div className="row">
        <button type="button" onClick={onToggle}>{playing ? 'Pause' : 'Play'}</button>
        <button type="button" onClick={onStep}>Frame Step</button>
        <span>Frame {frame + 1}/{frames}</span>
      </div>
    </div>
  );
}

export { categorizeAssetPath };

function categoryToAssetType(category: string): string {
  switch (category) {
    case 'Player':
      return 'player_sprite';
    case 'NPC':
      return 'npc';
    case 'Enemy':
      return 'enemy';
    case 'Boss':
      return 'boss';
    case 'Tileset':
      return 'tileset';
    case 'Background':
      return 'background';
    case 'Weapon':
      return 'weapon';
    case 'Item':
      return 'item';
    case 'UI':
    case 'Icon':
      return 'ui_icon';
    case 'VFX':
      return 'vfx_texture';
    default:
      return 'prop';
  }
}
