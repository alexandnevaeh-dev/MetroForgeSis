import { useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import type { DesktopConfig } from './metroforge-api.js';
import { Badge, EmptyState, Panel } from './ui/index.js';

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
      setMessage(`Set app.nvidia.imageModel to ${modelId}. Re-probe via refreshed Providers.`);
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
    <div className="panel" style={{ marginTop: '1rem' }}>
      <h3>NVIDIA image model suggestions</h3>
      <p className="hint">
        NVIDIA image health is DEGRADED and the configured model is not listed. Pick a nearby id to
        set <code>app.nvidia.imageModel</code>, or copy it into Settings.
      </p>
      <ul className="check-list">
        {suggestions.slice(0, 5).map((id) => (
          <li key={id}>
            <code>{id}</code>{' '}
            <button type="button" disabled={busy === id} onClick={() => applyModel(id)}>
              {busy === id ? 'Saving…' : 'Use model'}
            </button>{' '}
            <button type="button" onClick={() => copyModel(id)}>
              Copy
            </button>
          </li>
        ))}
      </ul>
      {message && <p className="hint">{message}</p>}
    </div>
  );
}

export function ProvidersScreen() {
  const { navigate } = useStudio();
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.metroforge?.listProviders) {
      setError('Desktop bridge unavailable');
      return;
    }
    Promise.all([window.metroforge.listProviders(), window.metroforge.getConfig()])
      .then(([list, cfg]) => {
        setProviders(list);
        setConfig(cfg);
      })
      .catch((err) => setError(String(err)));
  }, []);

  const healthyCount = providers.filter((p) => p.health === 'healthy').length;
  const allHealthy = providers.length > 0 && healthyCount === providers.length;

  return (
    <section>
      <ScreenHeader
        eyebrow="AI"
        title="Providers"
        description="Health of registered backends. Keys stay in .env; this screen only reports whether they are present."
        actions={
          <button type="button" onClick={() => navigate('Settings')}>
            Open Settings
          </button>
        }
      />
      {error && <p className="result error">{error}</p>}

      {providers.length === 0 && !error && (
        <EmptyState title="No providers reported" description="listProviders returned an empty catalog." />
      )}

      {providers.length > 0 && (
        <Panel level={1} className="provider-health-summary" title="Environment">
          <div className="dashboard-env-status">
            <span className={allHealthy ? 'status-dot ok' : 'status-dot error'} aria-hidden="true" />
            <span>
              Overall Status:{' '}
              <strong style={{ color: allHealthy ? 'var(--success)' : 'var(--warning)' }}>
                {allHealthy ? 'Healthy' : 'Attention'}
              </strong>
            </span>
          </div>
          <div className="dashboard-env-stats">
            <div>
              <span>Providers</span>
              <strong>
                {healthyCount}/{providers.length}
              </strong>
            </div>
            <div>
              <span>Enabled</span>
              <strong>{providers.filter((p) => p.enabled).length}</strong>
            </div>
            <div>
              <span>Local</span>
              <strong>{providers.filter((p) => p.local).length}</strong>
            </div>
          </div>
        </Panel>
      )}

      <div className="provider-grid">
        {providers.map((provider) => (
          <article key={provider.id} className="panel provider-card">
            <header className="provider-card-head">
              <h3>{provider.name}</h3>
              <Badge
                tone={
                  provider.health === 'healthy'
                    ? 'success'
                    : provider.health === 'degraded'
                      ? 'warning'
                      : 'danger'
                }
              >
                {provider.health}
              </Badge>
            </header>
            <div className="provider-card-status">
              <span className={provider.health === 'healthy' ? 'status-dot ok' : provider.health === 'degraded' ? 'status-dot warn' : 'status-dot error'} aria-hidden="true" />
              <span className="hint mono">{provider.id}</span>
            </div>
            <ul className="stat-list">
              <li>{provider.local ? 'Local' : 'Hosted'}</li>
              <li>{provider.enabled ? 'Enabled' : 'Disabled'}</li>
              <li>Priority {provider.priority}</li>
            </ul>
          </article>
        ))}
      </div>

      {config && (
        <div className="panel provider-health-log" style={{ marginTop: '0.55rem' }}>
          <h3>Health log</h3>
          <ul className="check-list">
            <li className={config.envKeys.nvidiaApiKey ? 'check-pass' : 'check-warn'}>
              <Badge tone={config.envKeys.nvidiaApiKey ? 'success' : 'warning'}>
                {config.envKeys.nvidiaApiKey ? 'PASS' : 'WARN'}
              </Badge>{' '}
              NVIDIA — {config.envKeys.nvidiaApiKey ? 'configured' : 'not set'}
            </li>
            <li className={config.envKeys.geminiApiKey ? 'check-pass' : 'check-warn'}>
              <Badge tone={config.envKeys.geminiApiKey ? 'success' : 'warning'}>
                {config.envKeys.geminiApiKey ? 'PASS' : 'WARN'}
              </Badge>{' '}
              Gemini — {config.envKeys.geminiApiKey ? 'configured' : 'not set'}
            </li>
            <li className={config.envKeys.groqApiKey ? 'check-pass' : 'check-warn'}>
              <Badge tone={config.envKeys.groqApiKey ? 'success' : 'warning'}>
                {config.envKeys.groqApiKey ? 'PASS' : 'WARN'}
              </Badge>{' '}
              Groq — {config.envKeys.groqApiKey ? 'configured' : 'not set'}
            </li>
            <li className={config.envKeys.openrouterApiKey ? 'check-pass' : 'check-warn'}>
              <Badge tone={config.envKeys.openrouterApiKey ? 'success' : 'warning'}>
                {config.envKeys.openrouterApiKey ? 'PASS' : 'WARN'}
              </Badge>{' '}
              OpenRouter — {config.envKeys.openrouterApiKey ? 'configured' : 'not set'}
            </li>
            <li className={config.envKeys.comfyuiUrl ? 'check-pass' : 'check-warn'}>
              <Badge tone={config.envKeys.comfyuiUrl ? 'success' : 'warning'}>
                {config.envKeys.comfyuiUrl ? 'PASS' : 'WARN'}
              </Badge>{' '}
              ComfyUI — {config.envKeys.comfyuiUrl ? 'configured' : 'not set'}
            </li>
          </ul>
          <h3>Image providers</h3>
          <table className="provider-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Local</th>
                <th>Priority</th>
                <th>Health</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {config.imageProviders.map((provider) => {
                const status = (provider.status ?? (provider.healthy ? 'HEALTHY' : 'UNAVAILABLE')).toUpperCase();
                const healthClass =
                  status === 'HEALTHY'
                    ? 'health-healthy'
                    : status === 'DEGRADED'
                      ? 'health-degraded'
                      : 'health-unavailable';
                return (
                  <tr key={provider.id}>
                    <td>{provider.id}</td>
                    <td>{provider.local ? 'yes' : 'no'}</td>
                    <td>{provider.priority}</td>
                    <td className={healthClass}>{status}</td>
                    <td>{provider.reason ?? (provider.healthy ? 'ok' : 'unavailable')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {config && (
        <NvidiaModelSuggestions
          config={config}
          onApplied={(cfg) => {
            setConfig(cfg);
          }}
        />
      )}
    </section>
  );
}
