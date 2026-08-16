import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import type { DesktopConfig } from './metroforge-api.js';
import { healthLabel, normalizeHealth } from './aiOpsShared.js';
import {
  AiOpsBody,
  AiOpsLog,
  AiOpsPrimary,
  AiOpsSummary,
  AiOpsWorkbench,
  Badge,
  Button,
  DataTable,
  EmptyState,
  HealthDot,
  Metric,
  StatusBadge,
} from './ui/index.js';

type ProviderRow = {
  id: string;
  name: string;
  local: boolean;
  enabled: boolean;
  health: string;
  priority: number;
};

function NvidiaModelSuggestions({
  config,
  onApplied,
}: {
  config: DesktopConfig;
  onApplied: (cfg: DesktopConfig) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const nvidia = config.imageProviders.find((p) => p.id === 'nvidia-image');
  const status = (nvidia?.status ?? '').toUpperCase();
  const suggestions =
    nvidia?.suggestedModelIds?.length
      ? nvidia.suggestedModelIds
      : nvidia?.nearbyModels?.length
        ? nvidia.nearbyModels
        : [];

  if (!nvidia || status !== 'DEGRADED' || suggestions.length === 0) {
    return null;
  }

  const applyModel = async (modelId: string) => {
    if (!window.metroforge?.setAppSettings || !window.metroforge?.getConfig) return;
    setBusy(modelId);
    setMessage(null);
    try {
      await window.metroforge.setAppSettings({ 'app.nvidia.imageModel': modelId });
      const refreshed = await window.metroforge.getConfig();
      onApplied(refreshed);
      setMessage(`Set app.nvidia.imageModel to ${modelId}. Re-probe via Refresh Health.`);
    } catch (err) {
      setMessage(String(err));
    } finally {
      setBusy(null);
    }
  };

  const copyModel = async (modelId: string) => {
    try {
      await navigator.clipboard.writeText(modelId);
      setMessage(`Copied ${modelId}`);
    } catch {
      setMessage(modelId);
    }
  };

  return (
    <div className="panel-l2 nvidia-suggestions" style={{ marginTop: '0.45rem' }}>
      <h3 className="mf-panel-title">NVIDIA image model suggestions</h3>
      <p className="hint">
        NVIDIA image health is DEGRADED and the configured model is not listed. Pick a nearby id to set{' '}
        <code className="mono">app.nvidia.imageModel</code>, or copy it into Settings.
      </p>
      <ul className="check-list">
        {suggestions.slice(0, 5).map((id) => (
          <li key={id}>
            <code className="mono">{id}</code>{' '}
            <Button size="sm" disabled={busy === id} onClick={() => void applyModel(id)}>
              {busy === id ? 'Saving…' : 'Use model'}
            </Button>{' '}
            <Button size="sm" variant="ghost" onClick={() => void copyModel(id)}>
              Copy
            </Button>
          </li>
        ))}
      </ul>
      {message && <p className="hint">{message}</p>}
    </div>
  );
}

const CREDENTIAL_ROWS: Array<{ key: keyof DesktopConfig['envKeys']; label: string }> = [
  { key: 'nvidiaApiKey', label: 'NVIDIA_API_KEY' },
  { key: 'geminiApiKey', label: 'GEMINI_API_KEY' },
  { key: 'groqApiKey', label: 'GROQ_API_KEY' },
  { key: 'openrouterApiKey', label: 'OPENROUTER_API_KEY' },
  { key: 'huggingfaceApiKey', label: 'HUGGINGFACE_API_KEY' },
  { key: 'comfyuiUrl', label: 'COMFYUI_URL' },
  { key: 'diffusersPython', label: 'DIFFUSERS_PYTHON' },
  { key: 'automatic1111Url', label: 'AUTOMATIC1111_BASE_URL' },
  { key: 'stabilityApiKey', label: 'STABILITY_API_KEY' },
  { key: 'deepaiApiKey', label: 'DEEPAI_API_KEY' },
  { key: 'replicateApiToken', label: 'REPLICATE_API_TOKEN' },
];

export function ProvidersScreen() {
  const { navigate } = useStudio();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!window.metroforge?.listProviders) {
      setError('Desktop bridge unavailable');
      return;
    }
    setRefreshing(true);
    try {
      const [list, cfg] = await Promise.all([
        window.metroforge.listProviders(),
        window.metroforge.getConfig(),
      ]);
      setProviders(list);
      setConfig(cfg);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const healthyCount = providers.filter((p) => normalizeHealth(p.health) === 'healthy').length;
  const unavailableCount = providers.filter((p) => {
    const h = normalizeHealth(p.health);
    return h === 'unavailable' || h === 'disabled' || h === 'unconfigured';
  }).length;
  const degradedCount = providers.filter((p) => normalizeHealth(p.health) === 'degraded').length;
  const localCount = providers.filter((p) => p.local).length;
  const hostedCount = providers.filter((p) => !p.local).length;
  const configuredKeys = useMemo(() => {
    if (!config) return 0;
    return CREDENTIAL_ROWS.filter((row) => config.envKeys[row.key]).length;
  }, [config]);

  return (
    <section className="workspace-screen providers-screen">
      <ScreenHeader
        eyebrow="AI"
        title="Providers"
        description="Registered AI backends, credentials, health, locality and routing priority."
        compact
        actions={
          <div className="row">
            <Button variant="primary" onClick={() => void load()} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh Health'}
            </Button>
            <Button variant="secondary" onClick={() => navigate('Settings')}>
              Settings
            </Button>
          </div>
        }
      />
      {error && <p className="result error">{error}</p>}

      <AiOpsWorkbench variant="providers">
        {providers.length === 0 && !error ? (
          <EmptyState title="No providers reported" description="listProviders returned an empty catalog." />
        ) : null}

        {providers.length > 0 ? (
          <AiOpsSummary title="Environment">
            <Metric label="Providers" value={providers.length} />
            <Metric label="Healthy" value={healthyCount} tone="success" />
            <Metric label="Offline" value={unavailableCount} tone={unavailableCount ? 'danger' : 'default'} />
            <Metric label="Degraded" value={degradedCount} tone={degradedCount ? 'warning' : 'default'} />
            <Metric label="Local" value={localCount} />
            <Metric label="Hosted" value={hostedCount} />
            <Metric label="Keys" value={config ? `${configuredKeys}/${CREDENTIAL_ROWS.length}` : '—'} />
          </AiOpsSummary>
        ) : null}

        <AiOpsBody className="ai-ops-body-providers">
          <AiOpsPrimary title="Provider health" className="providers-primary">
            <div className="provider-grid">
              {providers.map((provider) => {
                const kind = normalizeHealth(provider.health);
                return (
                  <article key={provider.id} className="panel provider-card">
                    <header className="provider-card-head">
                      <h3>{provider.name}</h3>
                      <Badge tone={provider.local ? 'info' : 'muted'}>
                        {provider.local ? 'LOCAL' : 'HOSTED'}
                      </Badge>
                    </header>
                    <div className="provider-card-status">
                      <HealthDot status={kind} label={healthLabel(kind)} />
                      <StatusBadge status={kind === 'healthy' ? 'PASS' : kind === 'degraded' ? 'WARN' : 'FAIL'}>
                        {healthLabel(kind)}
                      </StatusBadge>
                    </div>
                    <ul className="stat-list provider-card-stats">
                      <li>
                        <span className="hint">Priority</span>{' '}
                        <strong className="mono">{provider.priority}</strong>
                      </li>
                      <li>
                        <span className="hint">Enabled</span> {provider.enabled ? 'Yes' : 'No'}
                      </li>
                      <li>
                        <span className="hint">Id</span> <code className="mono">{provider.id}</code>
                      </li>
                    </ul>
                    <div className="row provider-card-actions">
                      <Button size="sm" variant="ghost" onClick={() => navigate('Routing')}>
                        Details
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => navigate('Models')}>
                        Models
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </AiOpsPrimary>
        </AiOpsBody>

        {config ? (
          <AiOpsLog
            title="Credentials & image providers"
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('Settings')}>
                Open Settings
              </Button>
            }
          >
            <div className="providers-log-grid">
              <div>
                <h3 className="mf-panel-title type-label">Credentials</h3>
                <p className="hint">Presence only — secret values are never shown.</p>
                <ul className="credential-list">
                  {CREDENTIAL_ROWS.map((row) => {
                    const present = Boolean(config.envKeys[row.key]);
                    return (
                      <li key={row.key} className={present ? 'check-pass' : 'check-warn'}>
                        <code className="mono">{row.label}</code>
                        <HealthDot status={present ? 'healthy' : 'degraded'} label={present ? 'Configured' : 'Not set'} />
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <h3 className="mf-panel-title type-label">Image providers</h3>
                {config.imageProviders.length === 0 ? (
                  <EmptyState title="No image providers" description="getConfig.imageProviders is empty." />
                ) : (
                  <DataTable columns={['Provider', 'Type', 'Priority', 'Status', 'Capability', 'Reason']}>
                    {config.imageProviders.map((provider) => {
                      const status = (
                        provider.status ?? (provider.healthy ? 'HEALTHY' : 'UNAVAILABLE')
                      ).toUpperCase();
                      const offline = status !== 'HEALTHY' && status !== 'DEGRADED';
                      return (
                        <tr key={provider.id}>
                          <td className="mono">{provider.id}</td>
                          <td>{provider.local ? 'Local' : 'Hosted'}</td>
                          <td className="mono">{provider.priority}</td>
                          <td>
                            <HealthDot
                              status={
                                status === 'HEALTHY' ? 'healthy' : status === 'DEGRADED' ? 'degraded' : 'unavailable'
                              }
                              label={offline && /comfy/i.test(provider.id) ? 'OFFLINE' : status}
                            />
                          </td>
                          <td className="mono">IMAGE_GENERATION</td>
                          <td>{provider.reason ?? (provider.healthy ? 'ok' : 'unavailable')}</td>
                        </tr>
                      );
                    })}
                  </DataTable>
                )}
              </div>
            </div>
            <NvidiaModelSuggestions config={config} onApplied={setConfig} />
          </AiOpsLog>
        ) : null}
      </AiOpsWorkbench>
    </section>
  );
}
