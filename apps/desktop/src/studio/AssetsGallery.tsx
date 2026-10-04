import { TerrainPresentationEditor } from './TerrainPresentationEditor.js';
import { previewFrameAtTime } from './animation-clock.js';
import { AnimationPreview } from './AnimationPreview.js';
import { LootDefinitionEditor } from './LootDefinitionEditor.js';
import { ItemDefinitionEditor } from './ItemDefinitionEditor.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetRecord } from './types.js';
import { categorizeAssetPath, GALLERY_CATEGORIES } from './types.js';
import { TilesetPreview, AudioPreview } from './MediaPreviews.js';
import { VirtualizedAssetGrid } from './VirtualizedAssetGrid.js';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import { Badge, Button, EmptyState, SearchField, Tabs } from './ui/index.js';

export function AssetsGallery() {
  const { selectedPath } = useStudio();
  return <ProjectAssetsGallery key={selectedPath} />;
}

function ProjectAssetsGallery() {
  const { selectedPath, hasActiveProject, openRoom, openGenerator, focusAssetId } = useStudio();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AssetRecord | null>(null);
  const [animPlaying, setAnimPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [animFrame, setAnimFrame] = useState(0);
  const lastAnimation = useRef<AssetRecord | null>(null);
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
  const [restoreStatus, setRestoreStatus] = useState('');
  const [restoring, setRestoring] = useState(false);
  useEffect(() => { setRestoreStatus(''); }, [selectedPath, selected?.id]);
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
    let cancelled = false;
    if (!selectedPath || !selected || !window.metroforge?.getAssetUsages) {
      setUsages(null);
      setHistory([]);
      return;
    }
    window.metroforge.getAssetUsages(selectedPath, selected.id).then((u) => {
      if (!cancelled) setUsages(u?.usedIn ?? null);
    }).catch(() => { if (!cancelled) setUsages(null); });
    window.metroforge.getAssetHistory?.(selectedPath, selected.id).then((h) => {
      if (cancelled) return;
      setHistory(h ?? []);
      setCompareVersion(null);
      setCompareUrl(null);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setHistory([]);
      setCompareVersion(null);
      setCompareUrl(null);
      setRestoreStatus(`Version history unavailable: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { cancelled = true; };
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
    if (!selected?.isAnimation || !animPlaying || !selected.frameCount) return;
    const frames = selected.frameCount;
    const startFrame = lastAnimation.current === selected ? animFrame : 0;
    lastAnimation.current = selected;
    const startTime = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      setAnimFrame(previewFrameAtTime(startFrame, now - startTime, frames, selected.fps));
      handle = window.requestAnimationFrame(tick);
    };
    handle = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(handle);
  }, [selected, animPlaying]);

  useEffect(() => { setAnimFrame(0); lastAnimation.current = selected; }, [selected?.id, selected?.dataUrl]);

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
    <section className="workspace-screen assets-gallery-screen">
      <ScreenHeader
        eyebrow="Library"
        title="Asset Gallery"
        description="Browse real project artifacts. Previews, animation playback, tiles, and audio use IPC — empty categories mean the project has no files of that type yet."
        actions={<ProjectSelect />}
      />
      <NoProjectHint />
      {hasActiveProject && <LootDefinitionEditor key={`loot-${selectedPath}`} projectPath={selectedPath} />}
      {hasActiveProject && <ItemDefinitionEditor key={selectedPath} projectPath={selectedPath} />}

      {hasActiveProject && (
        <>
      <div className="toolbar">
        <SearchField
              onClear={() => setQuery('')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search id, path, provider, prompt…"
          aria-label="Search assets"
        />
        <Button disabled={!selectedPath || backfillBusy} onClick={() => void runBackfill()}>
          {backfillBusy ? 'Backfilling…' : 'Backfill maturity'}
        </Button>
      </div>
      {backfillMessage && <p className="hint">{backfillMessage}</p>}

      <Tabs
        className="category-bar"
        items={GALLERY_CATEGORIES.map((c) => ({
          id: c,
          label:
            c === 'All'
              ? `All ${classified.length}`
              : counts.get(c)
                ? `${c} ${counts.get(c)}`
                : c,
        }))}
        value={category}
        onChange={setCategory}
      />

      {loading && <p className="hint">Loading assets…</p>}

      {!loading && classified.length === 0 && (
        <EmptyState
          title="No assets in this project yet"
          description="Generate a game or create assets manually to populate the gallery. Categories stay empty until real artifacts exist."
          actions={
            <Button variant="primary" onClick={() => openGenerator()}>
              Manual Generator
            </Button>
          }
        />
      )}

      {!loading && classified.length > 0 && filtered.length === 0 && (
        <EmptyState
          title={category === 'All' ? 'No matching assets' : `No ${category} assets`}
          description={
            category === 'All'
              ? 'No assets match this search.'
              : `This category is empty for the current project — not a placeholder browser.`
          }
          actions={
            <Button
              onClick={() => {
                setQuery('');
                setCategory('All');
              }}
            >
              Clear filters
            </Button>
          }
        />
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
            <div className="asset-inspector-preview">
              {selected.isAnimation && selected.dataUrl ? (
                <AnimationPreview
                  key={selected.id}
                  asset={selected}
                  frame={animFrame}
                  playing={animPlaying}
                  onSeek={(frame) => { setAnimPlaying(false); setAnimFrame(frame); }}
                  onToggle={() => setAnimPlaying((p) => !p)}
                  onStep={() => { setAnimPlaying(false); setAnimFrame((f) => (f + 1) % Math.max(1, selected.frameCount ?? 1)); }}
                />
              ) : selected.dataUrl ? (
                <button type="button" className="zoom-preview" onClick={() => setZoomOpen(true)}>
                  <img className="detail-preview" src={selected.dataUrl} alt={selected.id} />
                </button>
              ) : (
                <p className="hint">No preview</p>
              )}
            </div>
            <h3 className="asset-inspector-title">{selected.id}</h3>
            {selectedPath && /^assets\/tilesets\/biome_\d+\/(floor|wall)(\.coping)?\.png$/.test(selected.path) && <TerrainPresentationEditor key={JSON.stringify([selectedPath,selected.path])} projectPath={selectedPath} asset={selected.path} dataUrl={selected.dataUrl} />}
            <dl className="settings-dl asset-inspector-dl">
              <dt>Path</dt>
              <dd>
                <code>{selected.path}</code>
              </dd>
              <dt>Category</dt>
              <dd>{selected.category}</dd>
              <dt>Provider</dt>
              <dd>{selected.provider ?? '—'}</dd>
              <dt>Maturity</dt>
              <dd>
                <Badge
                  tone={
                    selected.productionReady
                      ? 'success'
                      : selected.fallbackGenerated || selected.maturity === 'PLACEHOLDER'
                        ? 'warning'
                        : 'muted'
                  }
                >
                  {selected.maturity ?? (selected.fallbackGenerated ? 'PLACEHOLDER' : '—')}
                </Badge>
                {selected.productionReady === true
                  ? ' · production-ready'
                  : selected.productionReady === false
                    ? ' · not production-ready'
                    : ''}
                {selected.sourceType ? ` · ${selected.sourceType}` : ''}
                {selected.fallbackGenerated ? ' · procedural fallback' : ''}
              </dd>
              <dt>QA</dt>
              <dd>
                {selected.critiquePassed ? 'Passed' : 'Needs review'} ({selected.critiqueScore ?? '—'})
              </dd>
              {selected.prompt && (
                <>
                  <dt>Prompt</dt>
                  <dd>{selected.prompt}</dd>
                </>
              )}
              {usages && usages.length > 0 && (
                <>
                  <dt>Where Used</dt>
                  <dd className="asset-where-used">
                    {usages.map((u) => (
                      <button
                        key={`${u.type}-${u.id}`}
                        type="button"
                        className="usage-chip"
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
              {(history.length > 0 || restoreStatus) && (
                <>
                  <dt>Version History</dt>
                  <dd className="version-list">
                    {restoreStatus && <p role="status">{restoreStatus}</p>}
                    {history.map((v) => (
                      <div key={v.version} className="row">
                        <button
                          type="button"
                          className="tab"
                          disabled={restoring}
                          onClick={async () => {
                            if (!selectedPath || !selected || restoring) return;
                            setRestoring(true);
                            setRestoreStatus('Restoring artwork…');
                            try {
                              const result = await window.metroforge?.restoreAssetVersion?.(selectedPath, selected.id, v.version);
                              if (!result?.success) {
                                setRestoreStatus(result?.error ?? 'Artwork could not be restored.');
                                return;
                              }
                              setRestoreStatus('Artwork restored. Restart any open game preview to load the restored image.');
                              try {
                                const list = await window.metroforge!.listAssets(selectedPath);
                                setAssets(list);
                                const refreshed = list.find((a) => a.id === selected.id);
                                if (refreshed) setSelected(refreshed);
                              } catch {
                                setRestoreStatus('Artwork restored, but the gallery could not refresh. Reopen the gallery and restart any open game preview.');
                              }
                            } catch (error) {
                              setRestoreStatus(`Artwork restore failed: ${error instanceof Error ? error.message : String(error)}`);
                            } finally {
                              setRestoring(false);
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
            <div className="asset-inspector-actions">
              <Button
                variant="primary"
                className="asset-inspector-cta"
                onClick={() =>
                  openGenerator({
                    description: selected.prompt || `Regenerate ${selected.id} in this project's art style.`,
                    assetType: categoryToAssetType(selected.category),
                    assetId: selected.id,
                  })
                }
              >
                Open in Manual Generator
              </Button>
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
