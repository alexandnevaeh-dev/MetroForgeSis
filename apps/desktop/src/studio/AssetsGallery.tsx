import { useEffect, useMemo, useState } from 'react';
import type { AssetRecord, StudioProject } from './types';
import { categorizeAssetPath } from './types';
import { TilesetPreview, AudioPreview } from './MediaPreviews';
import { VirtualizedAssetGrid } from './VirtualizedAssetGrid';

const CATEGORIES = [
  'All',
  'Player',
  'Characters',
  'Enemies',
  'Bosses',
  'Tilesets',
  'Animations',
  'Items',
  'UI',
  'Music',
  'SFX',
];

export function AssetsGallery() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [category, setCategory] = useState('All');
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

  useEffect(() => {
    window.metroforge?.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) setSelectedPath((p) => p || list[0]!.path);
    });
  }, []);

  useEffect(() => {
    if (!selectedPath || !window.metroforge?.listAssets) return;
    setLoading(true);
    window.metroforge
      .listAssets(selectedPath)
      .then((list) => setAssets(list))
      .finally(() => setLoading(false));
  }, [selectedPath]);

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

  const filtered = useMemo(() => {
    if (category === 'All') return assets;
    return assets.filter((a) => a.category === category);
  }, [assets, category]);

  return (
    <section>
      <h2>Assets</h2>
      <p className="hint">Browse generated assets from the real project manifest and disk.</p>
      <label>
        Project
        <select value={selectedPath} onChange={(e) => setSelectedPath(e.target.value)}>
          {projects.map((p) => (
            <option key={p.slug} value={p.path}>
              {p.title ?? p.slug}
            </option>
          ))}
        </select>
      </label>

      <div className="category-bar row">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={category === c ? 'tab active' : 'tab'}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {loading && <p className="hint">Loading assets…</p>}

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
              <img className="detail-preview" src={selected.dataUrl} alt={selected.id} />
            ) : null}
            <dl className="settings-dl">
              <dt>Path</dt>
              <dd><code>{selected.path}</code></dd>
              <dt>Category</dt>
              <dd>{selected.category}</dd>
              <dt>Provider</dt>
              <dd>{selected.provider ?? '—'}</dd>
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
                    {usages.map((u) => `${u.type}:${u.id}`).join(', ')}
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
            {selected.category === 'Tilesets' && selectedPath && (
              <TilesetPreview
                projectPath={selectedPath}
                biomeId={selected.path.match(/biome_(\d+)/)?.[0] ?? 'biome_0'}
              />
            )}
            {(selected.category === 'SFX' || selected.category === 'Music') && selectedPath && (
              <AudioPreview projectPath={selectedPath} relPath={selected.path} />
            )}
          </aside>
        )}
      </div>
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
