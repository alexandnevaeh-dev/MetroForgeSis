import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import {LocalImageModelPreparation} from './LocalImageModelPreparation.js';
import { useStudio } from './StudioContext.js';
import type { CatalogModel, HardwareSnapshot } from './metroforge-api.js';
import { computeHardwareFit, formatMbAsGb, type HardwareFitKind } from './aiOpsShared.js';
import {
  AiOpsBody,
  AiOpsContext,
  AiOpsInspector,
  AiOpsPrimary,
  AiOpsSummary,
  AiOpsWorkbench,
  Badge,
  Button,
  EmptyState,
  HealthDot,
  Metric,
  PropertyRow,
  PropertySection,
  SearchField,
  Select,
  StatusBadge,
} from './ui/index.js';

const ROW_HEIGHT = 40;
const OVERSCAN = 8;
const modelKey = (model: Pick<CatalogModel, 'provider' | 'id'>) =>
  JSON.stringify([model.provider, model.id]);
const configurableProviders = new Set(['ollama', 'lmstudio', 'together', 'cerebras', 'mistral']);

function modelAvailabilityLabel(
  model: CatalogModel,
): 'ROUTABLE' | 'CATALOG' | 'BLOCKED' | 'HARDWARE' | 'RUNTIME' {
  if (model.routable) return 'ROUTABLE';
  if (model.hardwareCompatible === false) return 'HARDWARE';
  if (model.runtimeEligible === false || model.providerAvailable === false) return 'RUNTIME';
  if (model.providerEnabled === false || model.enabled === false) return 'BLOCKED';
  if (model.liveListed === false) return 'BLOCKED';
  if (model.catalogEligible !== false) return 'CATALOG';
  return 'BLOCKED';
}

function modelAvailabilityDetail(model: CatalogModel): string {
  const label = modelAvailabilityLabel(model);
  if (label === 'ROUTABLE')
    return 'Available candidate. The provider uses its saved model; generation mode and fallback rules still apply.';
  if (label === 'HARDWARE') return 'Local RAM or VRAM is below this model’s declared requirements.';
  if (label === 'RUNTIME') return 'Provider offline, disabled, or unconfigured for live route';
  if (model.providerEnabled === false) return 'Provider disabled or not configured';
  if (model.liveListed === false) return 'Not listed by live provider /models';
  if (label === 'CATALOG') return 'In catalog; not currently ranked as live-routable';
  return 'Not eligible';
}

function availabilityTone(label: ReturnType<typeof modelAvailabilityLabel>) {
  if (label === 'ROUTABLE') return 'success' as const;
  if (label === 'CATALOG') return 'info' as const;
  if (label === 'HARDWARE' || label === 'RUNTIME') return 'warning' as const;
  return 'danger' as const;
}

function installedLabel(model: CatalogModel): string {
  if (model.installed) return 'Installed';
  if (!model.local) return 'Remote';
  return 'Available';
}

function fitTone(fit: HardwareFitKind): 'success' | 'warning' | 'danger' | 'muted' | 'info' {
  if (fit === 'Fits') return 'success';
  if (fit === 'Cloud') return 'info';
  if (fit === 'Low VRAM' || fit === 'RAM blocked') return 'danger';
  return 'muted';
}

function profileTone(profile: string): 'warning' | 'info' | 'success' | 'muted' {
  if (profile === 'LOW_RESOURCE') return 'warning';
  if (profile === 'BALANCED') return 'info';
  if (profile === 'HIGH_QUALITY') return 'success';
  return 'muted';
}

export function ModelsScreen() {
  const { navigate } = useStudio();
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [hardware, setHardware] = useState<HardwareSnapshot | null>(null);
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [capabilityFilter, setCapabilityFilter] = useState('all');
  const [modalityFilter, setModalityFilter] = useState('all');
  const [licenseFilter, setLicenseFilter] = useState('all');
  const [installedFilter, setInstalledFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [routableFilter, setRoutableFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [fitFilter, setFitFilter] = useState<'all' | HardwareFitKind>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mounted = useRef(false);
  const loadLock = useRef(false);
  const actionLock = useRef(false);
  const [savingModel, setSavingModel] = useState(false);
  const [scouting, setScouting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (loadLock.current) return;
    loadLock.current = true;
    if (mounted.current) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      if (!window.metroforge) throw new Error('Desktop connection unavailable');
      const [list, hw] = await Promise.all([
        window.metroforge.listModels(),
        window.metroforge.getHardwareProfile(),
      ]);
      if (mounted.current) {
        setModels(list);
        setHardware(hw);
      }
    } catch {
      if (mounted.current)
        setLoadError(
          'Could not refresh the model catalog. Your last loaded models are retained. Check provider connections and try again.',
        );
    } finally {
      loadLock.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const providers = useMemo(() => [...new Set(models.map((m) => m.provider))].sort(), [models]);
  const capabilities = useMemo(
    () => [...new Set(models.flatMap((m) => m.capabilities ?? []))].sort(),
    [models],
  );
  const licenses = useMemo(
    () => [...new Set(models.map((m) => m.license).filter(Boolean))].sort(),
    [models],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((model) => {
      if (providerFilter !== 'all' && model.provider !== providerFilter) return false;
      if (
        capabilityFilter !== 'all' &&
        !(model.capabilities ?? []).includes(capabilityFilter as never)
      ) {
        return false;
      }
      if (modalityFilter !== 'all' && model.modality !== modalityFilter) return false;
      if (licenseFilter !== 'all' && model.license !== licenseFilter) return false;
      if (installedFilter === 'yes' && !model.installed) return false;
      if (installedFilter === 'no' && model.installed) return false;
      if (routableFilter === 'yes' && !model.routable) return false;
      if (routableFilter === 'no' && model.routable) return false;
      const fit = computeHardwareFit(model, hardware);
      if (fitFilter !== 'all' && fit !== fitFilter) return false;
      if (!q) return true;
      return (
        model.name.toLowerCase().includes(q) ||
        model.id.toLowerCase().includes(q) ||
        model.provider.toLowerCase().includes(q) ||
        model.license.toLowerCase().includes(q)
      );
    });
  }, [
    models,
    hardware,
    query,
    providerFilter,
    capabilityFilter,
    modalityFilter,
    licenseFilter,
    installedFilter,
    routableFilter,
    fitFilter,
  ]);

  const selected = filtered.find((model) => modelKey(model) === selectedId) ?? filtered[0] ?? null;

  const handleScout = async () => {
    if (actionLock.current || loadLock.current || !window.metroforge) return;
    actionLock.current = true;
    setScouting(true);
    setDownloadError(null);
    setDownloadMessage(null);
    try {
      const report = await window.metroforge.scoutModels({ benchmark: false });
      if (!mounted.current) return;
      setDownloadMessage(
        `Checked ${report.sourcesChecked.length} sources: ${report.modelsAdded} added, ${report.modelsUpdated} updated. No generation requests were sent.`,
      );
      if (report.errors.length) setDownloadError(report.errors.join(' '));
      await load();
    } catch {
      if (mounted.current)
        setDownloadError(
          'Catalog discovery failed. Check provider connections or the saved catalog, then retry.',
        );
    } finally {
      actionLock.current = false;
      if (mounted.current) setScouting(false);
    }
  };

  const handleDownload = async (model: CatalogModel) => {
    if (actionLock.current || loadLock.current || !window.metroforge) return;
    actionLock.current = true;
    setDownloadingId(modelKey(model));
    setDownloadError(null);
    setDownloadMessage(null);
    try {
      const result = await window.metroforge.downloadModel(model.id, model.provider);
      if (!mounted.current) return;
      if (result.success) {
        setDownloadMessage(result.message ?? `Installed ${model.name} from ${model.provider}`);
        await load();
      } else setDownloadError(result.error ?? `Download failed for ${model.name}`);
    } catch {
      if (mounted.current)
        setDownloadError('The model download failed. Check its provider and retry.');
    } finally {
      actionLock.current = false;
      if (mounted.current) setDownloadingId(null);
    }
  };

  const handleSetModel = async (model: CatalogModel) => {
    if (
      actionLock.current ||
      loadLock.current ||
      !window.metroforge ||
      !model.routable ||
      !configurableProviders.has(model.provider)
    )
      return;
    actionLock.current = true;
    setSavingModel(true);
    setDownloadError(null);
    setDownloadMessage(null);
    try {
      const key = `app.${model.provider}.model`;
      const result = await window.metroforge.setAppSettings({ [key]: model.id });
      if (!result.success || result.saved[key] !== model.id)
        throw new Error('Setting not acknowledged');
      if (mounted.current)
        setDownloadMessage(
          `${model.provider} will use ${model.name} when that provider is chosen for a new generation request. Generation mode and fallback rules still apply. No request was sent.`,
        );
    } catch {
      if (mounted.current)
        setDownloadError(
          'Could not save the provider model. Your current setting is unchanged or unconfirmed; retry or check Settings → Runtime.',
        );
    } finally {
      actionLock.current = false;
      if (mounted.current) setSavingModel(false);
    }
  };
  const busy = loading || scouting || savingModel || downloadingId !== null;

  const routableCount = models.filter((m) => m.routable).length;
  const installedCount = models.filter((m) => m.installed).length;
  const blockedCount = models.filter((m) => modelAvailabilityLabel(m) === 'BLOCKED').length;
  const selectedFit = selected ? computeHardwareFit(selected, hardware) : null;
  const selectedAvail = selected ? modelAvailabilityLabel(selected) : null;

  const starterInstalled = useMemo(() => {
    const pack = hardware?.starterPack ?? [];
    return pack.map((id) => {
      const hit = models.find(
        (m) => m.local && (m.id === id || m.id.endsWith(`/${id}`) || m.name === id),
      );
      return { id, installed: Boolean(hit?.installed) };
    });
  }, [hardware, models]);

  return (
    <section className="workspace-screen models-screen">
      <ScreenHeader
        eyebrow="AI"
        title="Models"
        description="Registered models, local availability, hardware compatibility, licensing, and routing eligibility."
        compact
        actions={
          <Button
            variant="primary"
            onClick={handleScout}
            disabled={busy}
            aria-busy={scouting || loading}
          >
            Refresh Catalog
          </Button>
        }
      />

      <LocalImageModelPreparation disabled={busy} />
      {loadError && (
        <div className="result error" role="alert">
          {loadError}{' '}
          <Button disabled={busy} onClick={() => void load()}>
            Retry catalog
          </Button>
        </div>
      )}
      <AiOpsWorkbench variant="models">
        <AiOpsSummary title="Catalog">
          <Metric label="Models" value={models.length} />
          <Metric label="Routable" value={routableCount} tone="success" />
          <Metric label="Installed" value={installedCount} />
          <Metric
            label="Blocked"
            value={blockedCount}
            tone={blockedCount ? 'warning' : 'default'}
          />
          {hardware ? (
            <Metric
              label="Profile"
              value={hardware.profile}
              tone={profileTone(hardware.profile)}
              hint={
                hardware.profile === 'LOW_RESOURCE' ? 'Prefer starter-pack local models' : undefined
              }
            />
          ) : null}
        </AiOpsSummary>

        <AiOpsBody>
          <AiOpsContext title="Hardware profile">
            {hardware ? (
              <>
                <div className="hw-profile-head">
                  <StatusBadge status={hardware.profile === 'LOW_RESOURCE' ? 'WARN' : 'INFO'}>
                    {hardware.profile}
                  </StatusBadge>
                  {hardware.cudaAvailable ? <Badge tone="info">CUDA</Badge> : null}
                </div>
                <dl className="hw-profile-dl settings-dl">
                  <dt>RAM</dt>
                  <dd className="mono">{formatMbAsGb(hardware.totalRamMb)}</dd>
                  <dt>VRAM</dt>
                  <dd className="mono">
                    {hardware.vramMb != null ? formatMbAsGb(hardware.vramMb) : '—'}
                  </dd>
                  <dt>GPU</dt>
                  <dd>
                    {hardware.gpuModel
                      ? `${hardware.gpuVendor ? `${hardware.gpuVendor} ` : ''}${hardware.gpuModel}`
                      : '—'}
                  </dd>
                  <dt>CPU</dt>
                  <dd className="mono">
                    {hardware.cpuCores != null ? `${hardware.cpuCores} cores` : '—'}
                  </dd>
                  <dt>Tier</dt>
                  <dd>{hardware.profile}</dd>
                </dl>
                {starterInstalled.length > 0 ? (
                  <div className="starter-pack">
                    <h3 className="mf-panel-title type-label">Local starter pack</h3>
                    <ul className="starter-pack-list">
                      {starterInstalled.map((entry) => (
                        <li key={entry.id}>
                          <span aria-hidden="true">{entry.installed ? '✓' : '○'}</span>
                          <code className="mono">{entry.id}</code>
                          <span className="hint">
                            {entry.installed ? 'installed' : 'recommended'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="Hardware unavailable"
                description="getHardwareProfile returned no snapshot."
              />
            )}
          </AiOpsContext>

          <AiOpsPrimary
            title="Catalog"
            actions={
              <span className="hint mono">
                {filtered.length}/{models.length}
              </span>
            }
            toolbar={
              <>
                <SearchField
                  onClear={() => setQuery('')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search models…"
                  aria-label="Search models"
                />
                <Select
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value)}
                  aria-label="Filter by provider"
                >
                  <option value="all">All providers</option>
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
                <Select
                  value={capabilityFilter}
                  onChange={(e) => setCapabilityFilter(e.target.value)}
                  aria-label="Filter by capability"
                >
                  <option value="all">Capability</option>
                  {capabilities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <Select
                  value={modalityFilter}
                  onChange={(e) => setModalityFilter(e.target.value)}
                  aria-label="Filter by modality"
                >
                  <option value="all">Modality</option>
                  <option value="text">Text</option>
                  <option value="vision">Vision</option>
                  <option value="image">Image</option>
                  <option value="audio">Audio</option>
                  <option value="speech">Speech</option>
                </Select>
                <Select
                  value={licenseFilter}
                  onChange={(e) => setLicenseFilter(e.target.value)}
                  aria-label="Filter by license"
                >
                  <option value="all">License</option>
                  {licenses.map((lic) => (
                    <option key={lic} value={lic}>
                      {lic}
                    </option>
                  ))}
                </Select>
                <Select
                  value={installedFilter}
                  onChange={(e) => setInstalledFilter(e.target.value as typeof installedFilter)}
                  aria-label="Filter by installed"
                >
                  <option value="all">Installed</option>
                  <option value="yes">Installed only</option>
                  <option value="no">Not installed</option>
                </Select>
                <Select
                  value={routableFilter}
                  onChange={(e) => setRoutableFilter(e.target.value as typeof routableFilter)}
                  aria-label="Filter by routable"
                >
                  <option value="all">Routable</option>
                  <option value="yes">Routable only</option>
                  <option value="no">Not routable</option>
                </Select>
                <Select
                  value={fitFilter}
                  onChange={(e) => setFitFilter(e.target.value as typeof fitFilter)}
                  aria-label="Filter by hardware fit"
                >
                  <option value="all">Hardware fit</option>
                  <option value="Fits">Fits</option>
                  <option value="Low VRAM">Low VRAM</option>
                  <option value="RAM blocked">RAM blocked</option>
                  <option value="Cloud">Cloud</option>
                </Select>
              </>
            }
          >
            {filtered.length === 0 ? (
              <EmptyState
                title={
                  loading
                    ? 'Loading models'
                    : loadError
                      ? 'Catalog unavailable'
                      : 'No matching models'
                }
                description={
                  models.length === 0
                    ? loading
                      ? 'Checking your catalog and provider connections…'
                      : loadError
                        ? 'Retry the catalog read to see your models.'
                        : 'Refresh after configuring providers in API Keys and Settings → Runtime.'
                    : 'Try changing provider, capability, license, or hardware filters.'
                }
              />
            ) : (
              <VirtualizedModelTable
                models={filtered}
                hardware={hardware}
                selectedId={selected ? modelKey(selected) : undefined}
                onSelect={setSelectedId}
                downloadingId={downloadingId}
              />
            )}
            {downloadMessage && (
              <p className="hint" role="status">
                {downloadMessage}
              </p>
            )}
            {downloadError && (
              <p className="result error" role="alert">
                {downloadError}
              </p>
            )}
          </AiOpsPrimary>

          <AiOpsInspector
            title="Model"
            empty={
              !selected ? (
                <EmptyState title="No selection" description="No model in this filter." />
              ) : undefined
            }
          >
            {selected && selectedAvail && selectedFit ? (
              <>
                <PropertySection title="Identity">
                  <PropertyRow label="Name">{selected.name}</PropertyRow>
                  <PropertyRow label="Id">
                    <code className="mono">{selected.id}</code>
                  </PropertyRow>
                  <PropertyRow label="Provider">{selected.provider}</PropertyRow>
                  <PropertyRow label="Modality">{selected.modality}</PropertyRow>
                </PropertySection>
                <PropertySection title="Status">
                  <PropertyRow label="Availability">
                    <Badge tone={availabilityTone(selectedAvail)}>{selectedAvail}</Badge>
                  </PropertyRow>
                  <PropertyRow label="Detail">
                    <span className="hint">{modelAvailabilityDetail(selected)}</span>
                  </PropertyRow>
                  <PropertyRow label="Installed">{installedLabel(selected)}</PropertyRow>
                  <PropertyRow label="Locality">{selected.local ? 'local' : 'hosted'}</PropertyRow>
                  <PropertyRow label="Health">
                    <HealthDot
                      status={selected.health ?? 'unknown'}
                      label={selected.health ?? 'unknown'}
                    />
                  </PropertyRow>
                </PropertySection>
                <PropertySection title="License">
                  <PropertyRow label="License">
                    <code className="mono">{selected.license}</code>
                  </PropertyRow>
                  <PropertyRow label="Commercial">{selected.commercialUse}</PropertyRow>
                </PropertySection>
                <PropertySection title="Hardware">
                  <PropertyRow label="Required RAM">
                    <span className="mono">
                      {(selected.minRamMb ?? selected.recommendedRamMb)
                        ? formatMbAsGb(selected.minRamMb ?? selected.recommendedRamMb)
                        : '—'}
                    </span>
                  </PropertyRow>
                  <PropertyRow label="Required VRAM">
                    <span className="mono">
                      {(selected.minVramMb ?? selected.recommendedVramMb)
                        ? formatMbAsGb(selected.minVramMb ?? selected.recommendedVramMb)
                        : '—'}
                    </span>
                  </PropertyRow>
                  {hardware &&
                  (selected.minVramMb || selected.recommendedVramMb) &&
                  selected.local ? (
                    <PropertyRow label="VRAM">
                      <span className="mono">
                        {formatMbAsGb(hardware.vramMb ?? 0)} / ~
                        {formatMbAsGb(selected.minVramMb ?? selected.recommendedVramMb)} required
                      </span>{' '}
                      {selectedFit === 'Low VRAM' || selectedFit === 'RAM blocked' ? (
                        <Badge tone="danger">BLOCKED</Badge>
                      ) : (
                        <Badge tone="success">OK</Badge>
                      )}
                    </PropertyRow>
                  ) : null}
                  <PropertyRow label="Fit">
                    <Badge tone={fitTone(selectedFit)}>{selectedFit}</Badge>
                  </PropertyRow>
                </PropertySection>
                <PropertySection title="Capabilities">
                  <div className="cap-tag-list">
                    {(selected.capabilities ?? []).length ? (
                      (selected.capabilities ?? []).map((cap) => (
                        <span key={cap} className="cap-tag mono">
                          {cap}
                        </span>
                      ))
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </div>
                </PropertySection>
                <PropertySection title="Quality">
                  <PropertyRow label="Quality">{selected.estimatedQuality ?? '—'}</PropertyRow>
                  <PropertyRow label="Speed">{selected.estimatedSpeed ?? '—'}</PropertyRow>
                </PropertySection>
                <PropertySection title="Actions">
                  <p className="hint">
                    Setting a model affects new requests to its provider. Model discovery does not
                    verify output quality or commercial licensing.
                  </p>
                  <div className="row">
                    <Button onClick={() => navigate('Routing')}>Open Routing Inspector</Button>
                    <Button onClick={() => navigate('Providers')}>Providers</Button>
                    <Button onClick={() => navigate('Settings')}>Runtime settings</Button>
                    {selected.modality === 'text' &&
                    configurableProviders.has(selected.provider) ? (
                      <Button
                        variant="primary"
                        disabled={busy || !selected.routable}
                        aria-busy={savingModel}
                        onClick={() => void handleSetModel(selected)}
                      >
                        Set provider model
                      </Button>
                    ) : null}
                    {selected.downloadable && !selected.installed ? (
                      <Button
                        variant="primary"
                        disabled={busy}
                        aria-busy={downloadingId === modelKey(selected)}
                        onClick={() => void handleDownload(selected)}
                      >
                        Install / Get
                      </Button>
                    ) : null}
                  </div>
                </PropertySection>
              </>
            ) : null}
          </AiOpsInspector>
        </AiOpsBody>
      </AiOpsWorkbench>
    </section>
  );
}

function VirtualizedModelTable({
  models,
  hardware,
  selectedId,
  onSelect,
  downloadingId,
}: {
  models: CatalogModel[];
  hardware: HardwareSnapshot | null;
  selectedId?: string;
  onSelect: (id: string) => void;
  downloadingId: string | null;
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
    <div className="virtualized-table-wrap models-catalog-table">
      <div className="virtualized-table-head">
        <span>Model</span>
        <span>Provider</span>
        <span>Modality</span>
        <span>Routable</span>
        <span>Installed</span>
        <span>License</span>
        <span>Hardware</span>
        <span>Action</span>
      </div>
      <div
        ref={ref}
        className="virtualized-table"
        tabIndex={0}
        role="listbox"
        aria-label="Model catalog"
        aria-activedescendant={
          visible.some((model) => modelKey(model) === selectedId)
            ? `model-row-${models.findIndex((model) => modelKey(model) === selectedId)}`
            : undefined
        }
        onScroll={() => {
          if (ref.current) setScrollTop(ref.current.scrollTop);
        }}
        onKeyDown={(event) => {
          if (!models.length) return;
          const current = Math.max(
            0,
            models.findIndex((m) => modelKey(m) === selectedId),
          );
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            const next = models[Math.min(models.length - 1, current + 1)];
            if (next) {
              onSelect(modelKey(next));
              ref.current?.scrollTo({ top: Math.min(models.length - 1, current + 1) * ROW_HEIGHT });
            }
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            const prev = models[Math.max(0, current - 1)];
            if (prev) {
              onSelect(modelKey(prev));
              ref.current?.scrollTo({ top: Math.max(0, current - 1) * ROW_HEIGHT });
            }
          }
          if (event.key === 'Home') {
            event.preventDefault();
            onSelect(modelKey(models[0]!));
            ref.current?.scrollTo({ top: 0 });
          }
          if (event.key === 'End') {
            event.preventDefault();
            onSelect(modelKey(models[models.length - 1]!));
            ref.current?.scrollTo({ top: (models.length - 1) * ROW_HEIGHT });
          }
        }}
      >
        <div style={{ height: models.length * ROW_HEIGHT, position: 'relative' }}>
          {visible.map((model, index) => {
            const row = start + index;
            const avail = modelAvailabilityLabel(model);
            const fit = computeHardwareFit(model, hardware);
            return (
              <button
                key={modelKey(model)}
                id={`model-row-${row}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={selectedId === modelKey(model)}
                className={
                  selectedId === modelKey(model) ? 'virtualized-row selected' : 'virtualized-row'
                }
                style={{
                  position: 'absolute',
                  top: row * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT - 2,
                }}
                onClick={() => {
                  onSelect(modelKey(model));
                  ref.current?.focus();
                }}
              >
                <span title={model.id}>{model.name}</span>
                <span className="mono">{model.provider}</span>
                <span>{model.modality}</span>
                <span title={modelAvailabilityDetail(model)}>
                  <HealthDot
                    status={
                      avail === 'ROUTABLE'
                        ? 'healthy'
                        : avail === 'CATALOG'
                          ? 'degraded'
                          : avail === 'HARDWARE' || avail === 'RUNTIME'
                            ? 'degraded'
                            : 'unavailable'
                    }
                    label={avail}
                  />
                </span>
                <span>{installedLabel(model)}</span>
                <span className="mono" title={model.commercialUse}>
                  {model.license.slice(0, 18)}
                </span>
                <span>
                  <Badge tone={fitTone(fit)} className="mf-badge-inline">
                    {fit}
                  </Badge>
                </span>
                <span>
                  {model.downloadable && !model.installed ? (
                    <span
                      className="model-get-action"
                      title="Select this model and install from its details"
                    >
                      {downloadingId === modelKey(model) ? 'Installing' : 'Details'}
                    </span>
                  ) : (
                    <Badge tone={availabilityTone(avail)} className="mf-badge-inline">
                      {avail === 'ROUTABLE' ? 'R' : avail === 'BLOCKED' ? 'B' : 'A'}
                    </Badge>
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
