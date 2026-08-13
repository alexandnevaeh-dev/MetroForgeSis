import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import type { CatalogModel, HardwareSnapshot } from './metroforge-api.js';

const ROW_HEIGHT = 36;
const OVERSCAN = 8;

/** Compact catalog status: AVAILABLE (provider up, not selected), ROUTABLE, or BLOCKED. */
function modelAvailabilityLabel(model: CatalogModel): 'AVAILABLE' | 'ROUTABLE' | 'BLOCKED' {
  if (model.routable) return 'ROUTABLE';
  if (model.providerEnabled === false || model.enabled === false) return 'BLOCKED';
  if (model.liveListed === false) return 'BLOCKED';
  return 'AVAILABLE';
}

function modelAvailabilityDetail(model: CatalogModel): string {
  const label = modelAvailabilityLabel(model);
  if (label === 'ROUTABLE') return 'Router can select this model now';
  if (model.providerEnabled === false) return 'Provider disabled or not configured';
  if (model.liveListed === false) return 'Not listed by live provider /models';
  if (model.enabled === false) return 'Catalog entry disabled';
  return 'In catalog; not currently ranked as routable';
}

export function ModelsScreen() {
  const { navigate } = useStudio();
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [hardware, setHardware] = useState<HardwareSnapshot | null>(null);
  const [filter, setFilter] = useState<'all' | 'installed' | 'text' | 'vision' | 'image' | 'audio'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scouting, setScouting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!window.metroforge) return;
    try {
      const [list, hw] = await Promise.all([
        window.metroforge.listModels(),
        window.metroforge.getHardwareProfile(),
      ]);
      if (list) setModels(list);
      if (hw) setHardware(hw);
    } catch {
      /* empty catalog */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((model) => {
      if (filter === 'installed' && !model.installed) return false;
      if (filter === 'text' && model.modality !== 'text') return false;
      if (filter === 'vision' && model.modality !== 'vision') return false;
      if (filter === 'image' && model.modality !== 'image') return false;
      if (filter === 'audio' && model.modality !== 'audio' && model.modality !== 'speech') return false;
      if (!q) return true;
      return (
        model.name.toLowerCase().includes(q) ||
        model.id.toLowerCase().includes(q) ||
        model.provider.toLowerCase().includes(q) ||
        model.license.toLowerCase().includes(q)
      );
    });
  }, [models, filter, query]);

  const selected = filtered.find((model) => model.id === selectedId) ?? filtered[0] ?? null;

  const handleScout = async () => {
    setScouting(true);
    await window.metroforge?.scoutModels({ benchmark: false });
    await load();
    setScouting(false);
  };

  const handleDownload = async (modelId: string) => {
    if (!window.metroforge?.downloadModel) return;
    setDownloadingId(modelId);
    setDownloadError(null);
    setDownloadMessage(null);
    const result = await window.metroforge.downloadModel(modelId);
    setDownloadingId(null);
    if (result.success) {
      setDownloadMessage(result.message ?? `Installed ${modelId}`);
      await load();
    } else {
      setDownloadError(result.error ?? `Download failed for ${modelId}`);
    }
  };

  return (
    <section>
      <ScreenHeader
        eyebrow="AI"
        title="Models"
        description="Live catalog reconciled with provider keys and hardware. Status: ROUTABLE (can be selected), AVAILABLE (present but not selected), BLOCKED (provider/model disabled or not live)."
        actions={
          <button type="button" className="primary" onClick={handleScout} disabled={scouting}>
            {scouting ? 'Scouting…' : 'Refresh catalog'}
          </button>
        }
      />

      <div className="models-layout">
        <div className="panel">
          <h3>Hardware</h3>
          {hardware ? (
            <ul className="stat-list">
              <li>
                {hardware.profile} · {hardware.totalRamMb} MB RAM
                {hardware.vramMb ? ` · ${hardware.vramMb} MB VRAM` : ''}
              </li>
              {hardware.gpuModel && (
                <li>
                  GPU: {hardware.gpuVendor ? `${hardware.gpuVendor} ` : ''}
                  {hardware.gpuModel}
                  {hardware.cudaAvailable ? ' · CUDA' : ''}
                </li>
              )}
              {hardware.cpuCores != null && <li>{hardware.cpuCores} CPU cores</li>}
            </ul>
          ) : (
            <p className="hint">Hardware profile unavailable.</p>
          )}
          {hardware?.starterPack && hardware.starterPack.length > 0 && (
            <>
              <h3>Starter pack</h3>
              <ul className="stat-list">
                {hardware.starterPack.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="panel models-table-panel">
          <div className="toolbar">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, provider, license…"
              aria-label="Filter models"
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">All</option>
              <option value="installed">Installed</option>
              <option value="text">Text</option>
              <option value="vision">Vision</option>
              <option value="image">Image</option>
              <option value="audio">Audio</option>
            </select>
          </div>
          <VirtualizedModelTable
            models={filtered}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            downloadingId={downloadingId}
            onDownload={handleDownload}
          />
          <p className="hint">{filtered.length} of {models.length} models</p>
          {downloadMessage && <p className="hint">{downloadMessage}</p>}
          {downloadError && <p className="result error">{downloadError}</p>}
        </div>

        <aside className="panel">
          <h3>Inspector</h3>
          {selected ? (
            <dl className="settings-dl">
              <dt>Model</dt>
              <dd>{selected.name}</dd>
              <dt>Id</dt>
              <dd>
                <code>{selected.id}</code>
              </dd>
              <dt>Provider</dt>
              <dd>{selected.provider}</dd>
              <dt>Modality</dt>
              <dd>{selected.modality}</dd>
              <dt>Availability</dt>
              <dd>{modelAvailabilityLabel(selected)}</dd>
              <dt>Routable</dt>
              <dd>{selected.routable ? 'ROUTABLE' : 'not routable'}</dd>
              <dt>Provider enabled</dt>
              <dd>{selected.providerEnabled === false ? 'no' : 'yes'}</dd>
              <dt>Installed / local</dt>
              <dd>
                {selected.installed ? 'installed' : 'not installed'} · {selected.local ? 'local' : 'hosted'}
              </dd>
              <dt>License</dt>
              <dd>
                {selected.license} · {selected.commercialUse}
              </dd>
              <dt>Hardware</dt>
              <dd>
                {selected.recommendedRamMb ? `${selected.recommendedRamMb} MB RAM` : '—'}
                {selected.minVramMb ? ` / min ${selected.minVramMb} MB VRAM` : ''}
              </dd>
              <dt>Capabilities</dt>
              <dd>{selected.capabilities?.slice(0, 12).join(', ') || '—'}</dd>
              <dt>Quality / speed</dt>
              <dd>
                {selected.estimatedQuality ?? '—'} / {selected.estimatedSpeed ?? '—'}
              </dd>
            </dl>
          ) : (
            <p className="hint">No model in this filter.</p>
          )}
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button type="button" onClick={() => navigate('Routing')}>
              Open Routing Inspector
            </button>
            <button type="button" onClick={() => navigate('Providers')}>
              Providers
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function VirtualizedModelTable({
  models,
  selectedId,
  onSelect,
  downloadingId,
  onDownload,
}: {
  models: CatalogModel[];
  selectedId?: string;
  onSelect: (id: string) => void;
  downloadingId: string | null;
  onDownload: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(420);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(models.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
  const visible = models.slice(start, end);

  return (
    <div className="virtualized-table-wrap">
      <div className="virtualized-table-head">
        <span>Model</span>
        <span>Provider</span>
        <span>Status</span>
        <span>Installed</span>
        <span>License</span>
        <span></span>
      </div>
      <div
        ref={ref}
        className="virtualized-table"
        tabIndex={0}
        role="listbox"
        aria-label="Model catalog"
        aria-activedescendant={selectedId ? `model-row-${selectedId}` : undefined}
        onScroll={() => {
          if (ref.current) setScrollTop(ref.current.scrollTop);
        }}
        onKeyDown={(event) => {
          if (!models.length) return;
          const current = Math.max(0, models.findIndex((m) => m.id === selectedId));
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            const next = models[Math.min(models.length - 1, current + 1)];
            if (next) {
              onSelect(next.id);
              ref.current?.scrollTo({ top: Math.min(models.length - 1, current + 1) * ROW_HEIGHT });
            }
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            const prev = models[Math.max(0, current - 1)];
            if (prev) {
              onSelect(prev.id);
              ref.current?.scrollTo({ top: Math.max(0, current - 1) * ROW_HEIGHT });
            }
          }
          if (event.key === 'Home') {
            event.preventDefault();
            onSelect(models[0]!.id);
            ref.current?.scrollTo({ top: 0 });
          }
          if (event.key === 'End') {
            event.preventDefault();
            onSelect(models[models.length - 1]!.id);
            ref.current?.scrollTo({ top: (models.length - 1) * ROW_HEIGHT });
          }
        }}
      >
        <div style={{ height: models.length * ROW_HEIGHT, position: 'relative' }}>
          {visible.map((model, index) => {
            const row = start + index;
            return (
              <button
                key={model.id}
                id={`model-row-${model.id}`}
                type="button"
                role="option"
                aria-selected={selectedId === model.id}
                className={selectedId === model.id ? 'virtualized-row selected' : 'virtualized-row'}
                style={{ position: 'absolute', top: row * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT - 2 }}
                onClick={() => onSelect(model.id)}
              >
                <span>{model.name}</span>
                <span>{model.provider}</span>
                <span title={modelAvailabilityDetail(model)}>{modelAvailabilityLabel(model)}</span>
                <span>{model.installed ? 'yes' : '—'}</span>
                <span title={model.commercialUse}>{model.license.slice(0, 18)}</span>
                <span>
                  {model.downloadable && !model.installed ? (
                    <span
                      role="presentation"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDownload(model.id);
                      }}
                    >
                      {downloadingId === model.id ? '…' : 'Get'}
                    </span>
                  ) : (
                    '—'
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
