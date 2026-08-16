import { useEffect, useMemo, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ConcurrencyMeters } from './ConcurrencyMeters.js';
import { useStudio } from './StudioContext.js';
import { ProjectSelect } from './ProjectSelect.js';
import { AllowPlaceholdersControl } from './AllowPlaceholdersControl.js';
import type { DesktopConfig, GodotResolveInfo } from './metroforge-api.js';
import { GENERATION_MODES, GENERATION_PROFILES } from './generation-options.js';
import {
  IMAGE_PROVIDER_TOGGLE_IDS,
  TEXT_PROVIDER_TOGGLE_IDS,
  isProviderUserEnabled,
  parseProviderEnabledMap,
  providerEnabledSettingKey,
} from '@metroforge/shared/provider-toggles';
import { Badge, Button, ErrorState, LoadingState, Panel } from './ui/index.js';

const TEXT_LABELS: Record<string, string> = {
  ollama: 'Ollama (local)',
  gemini: 'Google Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  huggingface: 'Hugging Face',
  nvidia: 'NVIDIA NIM (text)',
};

const IMAGE_LABELS: Record<string, string> = {
  comfyui: 'ComfyUI',
  'nvidia-image': 'NVIDIA NIM (image)',
  diffusers: 'Diffusers (local)',
  automatic1111: 'AUTOMATIC1111',
  'huggingface-image': 'Hugging Face (image)',
  kenney: 'Kenney (CC0 library)',
  opengameart: 'OpenGameArt (per-asset license)',
  stability: 'Stability AI (paid)',
  deepai: 'DeepAI (paid)',
  replicate: 'Replicate (paid)',
};

type SettingsCategory =
  | 'General'
  | 'Generation'
  | 'Runtime'
  | 'Providers'
  | 'Paths'
  | 'Performance'
  | 'Export'
  | 'Diagnostics';

const CATEGORIES: SettingsCategory[] = [
  'General',
  'Generation',
  'Runtime',
  'Providers',
  'Paths',
  'Performance',
  'Export',
  'Diagnostics',
];

export function SettingsScreen() {
  const { navigate, hasActiveProject, selectedPath } = useStudio();
  const [category, setCategory] = useState<SettingsCategory>('General');
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [providerToggles, setProviderToggles] = useState<Record<string, boolean>>({});
  const [godotResolve, setGodotResolve] = useState<GodotResolveInfo | null>(null);
  const [godotTestMessage, setGodotTestMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    defaultMode: 'LOCAL_ONLY',
    defaultProfile: 'TINY_TEST',
    godotExecutable: '',
    concurrencyImage: '1',
    concurrencyLlm: '2',
    concurrencyAudio: '1',
    concurrencyCpu: '2',
    nvidiaImageModel: '',
  });

  const load = async () => {
    if (!window.metroforge?.getConfig) {
      setError('Desktop bridge unavailable');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const cfg = await window.metroforge.getConfig();
      setConfig(cfg);
      setForm({
        defaultMode: cfg.defaultMode,
        defaultProfile: cfg.defaultProfile,
        godotExecutable: cfg.godotExecutable ?? '',
        concurrencyImage: String(cfg.concurrency?.image ?? 1),
        concurrencyLlm: String(cfg.concurrency?.llm ?? 2),
        concurrencyAudio: String(cfg.concurrency?.audio ?? 1),
        concurrencyCpu: String(cfg.concurrency?.cpu ?? 2),
        nvidiaImageModel:
          cfg.appPreferences?.['app.nvidia.imageModel']?.trim() || cfg.nvidiaImageModel || '',
      });
      const map = parseProviderEnabledMap(cfg.appPreferences);
      const next: Record<string, boolean> = {};
      for (const id of [...TEXT_PROVIDER_TOGGLE_IDS, ...IMAGE_PROVIDER_TOGGLE_IDS]) {
        next[id] = isProviderUserEnabled(map, id);
      }
      setProviderToggles(next);
      setGodotResolve(cfg.godotResolve ?? null);
      if (window.metroforge.resolveGodot) {
        setGodotResolve(await window.metroforge.resolveGodot(selectedPath));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath]);

  const savePreferences = async () => {
    if (!window.metroforge?.setAppSettings) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const providerSettings: Record<string, string> = {};
      for (const [id, enabled] of Object.entries(providerToggles)) {
        providerSettings[providerEnabledSettingKey(id)] = enabled ? 'true' : 'false';
      }
      await window.metroforge.setAppSettings({
        'app.defaultMode': form.defaultMode,
        'app.defaultProfile': form.defaultProfile,
        'app.godotExecutable': form.godotExecutable.trim(),
        'app.concurrency.image': form.concurrencyImage,
        'app.concurrency.llm': form.concurrencyLlm,
        'app.concurrency.audio': form.concurrencyAudio,
        'app.concurrency.cpu': form.concurrencyCpu,
        'app.nvidia.imageModel': form.nvidiaImageModel.trim(),
        ...providerSettings,
      });
      const refreshed = await window.metroforge.getConfig();
      setConfig(refreshed);
      if (window.metroforge.resolveGodot) {
        setGodotResolve(await window.metroforge.resolveGodot(selectedPath));
      } else {
        setGodotResolve(refreshed.godotResolve ?? null);
      }
      setSaveMessage('Preferences saved. Concurrency and Godot path apply immediately for Doctor / Play / Export.');
    } catch (err) {
      setSaveMessage(String(err));
    } finally {
      setSaving(false);
    }
  };

  const testGodot = async () => {
    setGodotTestMessage(null);
    if (!window.metroforge?.resolveGodot) {
      setGodotTestMessage('resolveGodot IPC unavailable — rebuild desktop preload.');
      return;
    }
    // Persist current field first so Test uses the typed preference.
    if (window.metroforge.setAppSettings) {
      await window.metroforge.setAppSettings({
        'app.godotExecutable': form.godotExecutable.trim(),
      });
    }
    const resolved = await window.metroforge.resolveGodot(selectedPath);
    setGodotResolve(resolved);
    if (!resolved.path) {
      setGodotTestMessage('Godot not found via preference → project → env → PATH → known paths.');
      return;
    }
    if (!resolved.version) {
      setGodotTestMessage(
        `Path resolved (${resolved.sourceLabel}) but --version failed: ${resolved.path}`,
      );
      return;
    }
    setGodotTestMessage(`OK · ${resolved.version} · ${resolved.sourceLabel} · ${resolved.path}`);
  };

  const diagnosticsLines = useMemo(() => {
    if (!config) return [];
    return [
      `App: ${config.appName}`,
      `Repo: ${config.repoRoot}`,
      `Generated games: ${config.generatedGamesDir}`,
      `Ollama URL: ${config.ollamaBaseUrl}`,
      `Godot: ${godotResolve?.path ?? config.godotExecutable ?? '—'} (${godotResolve?.sourceLabel ?? '—'})`,
      `Default mode: ${config.defaultMode}`,
      `Default profile: ${config.defaultProfile}`,
      `NVIDIA image model id: ${form.nvidiaImageModel.trim() || config.nvidiaImageModel || '—'}`,
      `Keys present: NVIDIA=${config.envKeys.nvidiaApiKey ? 'yes' : 'no'} GEMINI=${config.envKeys.geminiApiKey ? 'yes' : 'no'} GROQ=${config.envKeys.groqApiKey ? 'yes' : 'no'} OPENROUTER=${config.envKeys.openrouterApiKey ? 'yes' : 'no'} HF=${config.envKeys.huggingfaceApiKey ? 'yes' : 'no'} COMFY=${config.envKeys.comfyuiUrl ? 'yes' : 'no'} DIFFUSERS=${config.envKeys.diffusersPython ? 'yes' : 'no'} A1111=${config.envKeys.automatic1111Url ? 'yes' : 'no'} STABILITY=${config.envKeys.stabilityApiKey ? 'yes' : 'no'} DEEPAI=${config.envKeys.deepaiApiKey ? 'yes' : 'no'} REPLICATE=${config.envKeys.replicateApiToken ? 'yes' : 'no'}`,
    ];
  }, [config, form.nvidiaImageModel, godotResolve]);

  return (
    <section className="workspace-screen settings-screen">
      <ScreenHeader
        eyebrow="Ship"
        title="Settings"
        description="App preferences persist in the MetroForge database. API keys remain in .env (presence only below). Project gates live on project.json."
        actions={
          <>
            <ProjectSelect />
            <Button variant="secondary" onClick={() => navigate('Providers')}>
              Providers
            </Button>
            <Button variant="primary" disabled={saving || !config} onClick={() => void savePreferences()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      />
      {loading && <LoadingState title="Loading settings…" description="Reading desktop config from the live bridge." />}
      {error && <ErrorState title="Settings unavailable" description={error} />}
      {saveMessage && <p className="hint">{saveMessage}</p>}

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings categories">
          {CATEGORIES.map((id) => (
            <button
              key={id}
              type="button"
              className={category === id ? 'settings-nav-item active' : 'settings-nav-item'}
              onClick={() => {
                if (id === 'Providers') {
                  navigate('Providers');
                  return;
                }
                setCategory(id);
              }}
            >
              {id}
              {id === 'Providers' ? <span className="hint"> ↗</span> : null}
            </button>
          ))}
        </nav>

        <div className="settings-panels">
          {category === 'General' && config && (
            <Panel level={1} title="General">
              <p className="hint">Active project production gate opt-out (Dashboard / Export re-read on open).</p>
              {hasActiveProject ? (
                <AllowPlaceholdersControl />
              ) : (
                <p className="hint">Select a project to set allowPlaceholders.</p>
              )}
              <div className="row" style={{ marginTop: '0.5rem' }}>
                <Button onClick={() => navigate('Export')}>Open Export</Button>
                <Button onClick={() => navigate('Dashboard')}>Open Dashboard</Button>
              </div>
            </Panel>
          )}

          {category === 'Generation' && config && (
            <Panel level={1} title="Generation defaults">
              <div className="form-grid">
                <label>
                  Default Mode
                  <select
                    value={form.defaultMode}
                    onChange={(e) => setForm((f) => ({ ...f, defaultMode: e.target.value }))}
                  >
                    {GENERATION_MODES.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Default Profile
                  <select
                    value={form.defaultProfile}
                    onChange={(e) => setForm((f) => ({ ...f, defaultProfile: e.target.value }))}
                  >
                    {GENERATION_PROFILES.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  NVIDIA Image Model
                  <input
                    type="text"
                    value={form.nvidiaImageModel}
                    onChange={(e) => setForm((f) => ({ ...f, nvidiaImageModel: e.target.value }))}
                    placeholder="black-forest-labs/flux.1-dev"
                  />
                </label>
              </div>
            </Panel>
          )}

          {category === 'Runtime' && config && (
            <Panel level={1} title="Runtime providers (enable/disable)">
              <p className="hint">
                Opt-out toggles in the app settings DB. Disabled providers stay out of bootstrap and probes. Keys stay
                in <code>.env</code>.
              </p>
              <div className="form-grid">
                {TEXT_PROVIDER_TOGGLE_IDS.map((id) => (
                  <label key={id} className="check-row">
                    <input
                      type="checkbox"
                      checked={providerToggles[id] !== false}
                      onChange={(e) =>
                        setProviderToggles((prev) => ({ ...prev, [id]: e.target.checked }))
                      }
                    />
                    {TEXT_LABELS[id] ?? id}
                  </label>
                ))}
              </div>
              <div className="form-grid" style={{ marginTop: '0.5rem' }}>
                {IMAGE_PROVIDER_TOGGLE_IDS.map((id) => (
                  <label key={id} className="check-row">
                    <input
                      type="checkbox"
                      checked={providerToggles[id] !== false}
                      onChange={(e) =>
                        setProviderToggles((prev) => ({ ...prev, [id]: e.target.checked }))
                      }
                    />
                    {IMAGE_LABELS[id] ?? id}
                  </label>
                ))}
              </div>
              <Button variant="secondary" onClick={() => navigate('Providers')}>
                Open Providers health
              </Button>
            </Panel>
          )}

          {category === 'Paths' && config && (
            <Panel level={1} title="Paths">
              <label>
                Godot Executable
                <input
                  type="text"
                  value={form.godotExecutable}
                  onChange={(e) => setForm((f) => ({ ...f, godotExecutable: e.target.value }))}
                  placeholder="Auto-detect (preference → project → env → PATH → known)"
                />
              </label>
              <div className="row" style={{ marginTop: '0.5rem' }}>
                <Button onClick={() => void testGodot()}>Test Godot</Button>
                {godotResolve && (
                  <Badge tone={godotResolve.version ? 'success' : 'warning'}>
                    {godotResolve.sourceLabel}
                  </Badge>
                )}
              </div>
              {godotTestMessage && <p className="hint mono">{godotTestMessage}</p>}
              {godotResolve && (
                <p className="hint mono">
                  Resolved: {godotResolve.path ?? '—'} · {godotResolve.version ?? 'no version'} ·{' '}
                  {godotResolve.sourceLabel}
                </p>
              )}
              <dl className="settings-dl" style={{ marginTop: '0.75rem' }}>
                <dt>Generated Games Dir</dt>
                <dd>
                  <code>{config.generatedGamesDir}</code>
                </dd>
                <dt>Repo Root</dt>
                <dd>
                  <code>{config.repoRoot}</code>
                </dd>
                <dt>Ollama URL</dt>
                <dd>{config.ollamaBaseUrl}</dd>
              </dl>
            </Panel>
          )}

          {category === 'Performance' && config && (
            <Panel level={1} title="Performance / concurrency">
              <div className="form-grid">
                <label>
                  Max concurrent LLM jobs
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={form.concurrencyLlm}
                    onChange={(e) => setForm((f) => ({ ...f, concurrencyLlm: e.target.value }))}
                  />
                </label>
                <label>
                  Max concurrent image jobs
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={form.concurrencyImage}
                    onChange={(e) => setForm((f) => ({ ...f, concurrencyImage: e.target.value }))}
                  />
                </label>
                <label>
                  Max concurrent audio jobs
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={form.concurrencyAudio}
                    onChange={(e) => setForm((f) => ({ ...f, concurrencyAudio: e.target.value }))}
                  />
                </label>
                <label>
                  Max concurrent CPU jobs
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={form.concurrencyCpu}
                    onChange={(e) => setForm((f) => ({ ...f, concurrencyCpu: e.target.value }))}
                  />
                </label>
              </div>
              <h4 className="mf-panel-title" style={{ marginTop: '0.75rem' }}>
                Live worker pool
              </h4>
              <ConcurrencyMeters />
            </Panel>
          )}

          {category === 'Export' && (
            <Panel level={1} title="Export defaults">
              <p className="hint">
                Export screen defaults: force off, ZIP on, commercial-safe filter optional. Platform executables are not
                offered.
              </p>
              <Button onClick={() => navigate('Export')}>Open Export</Button>
            </Panel>
          )}

          {category === 'Diagnostics' && config && (
            <Panel level={1} title="Diagnostics">
              <p className="hint">Copy-safe summary — key presence only, never secret values.</p>
              <pre className="settings-diagnostics mono">{diagnosticsLines.join('\n')}</pre>
              <Button
                onClick={() => {
                  void navigator.clipboard?.writeText(diagnosticsLines.join('\n'));
                }}
              >
                Copy diagnostics
              </Button>
              <h4 className="mf-panel-title" style={{ marginTop: '0.75rem' }}>
                Credential presence
              </h4>
              <ul className="check-list">
                <li className={config.envKeys.nvidiaApiKey ? 'check-pass' : 'check-warn'}>
                  NVIDIA_API_KEY — {config.envKeys.nvidiaApiKey ? 'configured' : 'not set'}
                </li>
                <li className={config.envKeys.geminiApiKey ? 'check-pass' : 'check-warn'}>
                  GEMINI_API_KEY — {config.envKeys.geminiApiKey ? 'configured' : 'not set'}
                </li>
                <li className={config.envKeys.groqApiKey ? 'check-pass' : 'check-warn'}>
                  GROQ_API_KEY — {config.envKeys.groqApiKey ? 'configured' : 'not set'}
                </li>
                <li className={config.envKeys.openrouterApiKey ? 'check-pass' : 'check-warn'}>
                  OPENROUTER_API_KEY — {config.envKeys.openrouterApiKey ? 'configured' : 'not set'}
                </li>
                <li className={config.envKeys.huggingfaceApiKey ? 'check-pass' : 'check-warn'}>
                  HUGGINGFACE_API_KEY — {config.envKeys.huggingfaceApiKey ? 'configured' : 'not set'}
                </li>
                <li className={config.envKeys.comfyuiUrl ? 'check-pass' : 'check-warn'}>
                  COMFYUI_BASE_URL — {config.envKeys.comfyuiUrl ? 'configured' : 'not set'}
                </li>
                <li className={config.envKeys.diffusersPython ? 'check-pass' : 'check-warn'}>
                  DIFFUSERS_PYTHON / DIFFUSERS_MODEL_ID —{' '}
                  {config.envKeys.diffusersPython ? 'configured' : 'not set'}
                </li>
                <li className={config.envKeys.automatic1111Url ? 'check-pass' : 'check-warn'}>
                  AUTOMATIC1111_BASE_URL — {config.envKeys.automatic1111Url ? 'configured' : 'not set'}
                </li>
                <li className={config.envKeys.stabilityApiKey ? 'check-pass' : 'check-warn'}>
                  STABILITY_API_KEY — {config.envKeys.stabilityApiKey ? 'configured' : 'not set'}
                </li>
                <li className={config.envKeys.deepaiApiKey ? 'check-pass' : 'check-warn'}>
                  DEEPAI_API_KEY — {config.envKeys.deepaiApiKey ? 'configured' : 'not set'}
                </li>
                <li className={config.envKeys.replicateApiToken ? 'check-pass' : 'check-warn'}>
                  REPLICATE_API_TOKEN — {config.envKeys.replicateApiToken ? 'configured' : 'not set'}
                </li>
              </ul>
              <p className="hint">
                Edit <code>.env</code> in the repo root, then restart the desktop app.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </section>
  );
}
