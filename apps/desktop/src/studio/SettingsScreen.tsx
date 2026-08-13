import { useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ConcurrencyMeters } from './ConcurrencyMeters.js';
import { useStudio } from './StudioContext.js';
import { ProjectSelect } from './ProjectSelect.js';
import { AllowPlaceholdersControl } from './AllowPlaceholdersControl.js';
import type { DesktopConfig } from './metroforge-api.js';
import { GENERATION_MODES, GENERATION_PROFILES } from './generation-options.js';
import {
  IMAGE_PROVIDER_TOGGLE_IDS,
  TEXT_PROVIDER_TOGGLE_IDS,
  isProviderUserEnabled,
  parseProviderEnabledMap,
  providerEnabledSettingKey,
} from '@metroforge/shared';

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
};

export function SettingsScreen() {
  const { navigate, hasActiveProject } = useStudio();
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [providerToggles, setProviderToggles] = useState<Record<string, boolean>>({});
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

  useEffect(() => {
    if (!window.metroforge?.getConfig) {
      setError('Desktop bridge unavailable');
      setLoading(false);
      return;
    }
    window.metroforge
      .getConfig()
      .then((cfg) => {
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
            cfg.appPreferences?.['app.nvidia.imageModel']?.trim() ||
            cfg.nvidiaImageModel ||
            '',
        });
        const map = parseProviderEnabledMap(cfg.appPreferences);
        const next: Record<string, boolean> = {};
        for (const id of [...TEXT_PROVIDER_TOGGLE_IDS, ...IMAGE_PROVIDER_TOGGLE_IDS]) {
          next[id] = isProviderUserEnabled(map, id);
        }
        setProviderToggles(next);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

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
      setSaveMessage(
        'Preferences saved. Provider toggles apply to bootstrap, list-providers, and image probes.',
      );
    } catch (err) {
      setSaveMessage(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <ScreenHeader
        eyebrow="Ship"
        title="Settings"
        description="App preferences persist in the MetroForge database. API keys remain in .env. Project gates live on project.json."
        actions={
          <>
            <ProjectSelect />
            <button type="button" onClick={() => navigate('Providers')}>
              Providers
            </button>
          </>
        }
      />
      {loading && <p className="hint">Loading settings…</p>}
      {error && <p className="result error">{error}</p>}

      <h3>Active project</h3>
      <p className="hint">
        Per-project production gate opt-out. Dashboard / Export re-read this when you open those screens.
      </p>
      {hasActiveProject ? (
        <AllowPlaceholdersControl />
      ) : (
        <p className="hint">Select a project above to set allowPlaceholders.</p>
      )}
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <button type="button" onClick={() => navigate('Export')}>
          Open Export
        </button>
        <button type="button" onClick={() => navigate('Dashboard')}>
          Open Dashboard
        </button>
      </div>

      {config && (
        <>
          <h3>App Preferences</h3>
          <p className="hint">
            Stored in the MetroForge database and applied on next launch (concurrency applies immediately).
          </p>
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
              Godot Executable (optional)
              <input
                type="text"
                value={form.godotExecutable}
                onChange={(e) => setForm((f) => ({ ...f, godotExecutable: e.target.value }))}
                placeholder="Auto-detect from PATH"
              />
            </label>
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
          {(() => {
            const nvidia = config.imageProviders.find((p) => p.id === 'nvidia-image');
            const status = (nvidia?.status ?? '').toUpperCase();
            const suggestions =
              nvidia?.suggestedModelIds?.length
                ? nvidia.suggestedModelIds
                : nvidia?.nearbyModels ?? [];
            if (status !== 'DEGRADED' || suggestions.length === 0) return null;
            return (
              <div className="panel" style={{ marginTop: '0.75rem' }}>
                <p className="hint">
                  NVIDIA image is DEGRADED — click a nearby model to fill{' '}
                  <code>app.nvidia.imageModel</code>, then Save Preferences.
                </p>
                <ul className="check-list">
                  {suggestions.slice(0, 5).map((id) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, nvidiaImageModel: id }))}
                      >
                        Use {id}
                      </button>{' '}
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(id);
                        }}
                      >
                        Copy
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          <h3>Provider enable / disable</h3>
          <p className="hint">
            Opt-out toggles persisted in the app settings DB. Disabled providers stay out of bootstrap,
            list-providers routing, and image probes. API keys still live in <code>.env</code>.
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

          <button type="button" onClick={savePreferences} disabled={saving}>
            {saving ? 'Saving…' : 'Save Preferences'}
          </button>
          {saveMessage && <p className="hint">{saveMessage}</p>}

          <h3>Live worker pool</h3>
          <p className="hint">Active vs max from getConcurrencyStatus. Limits update after save.</p>
          <ConcurrencyMeters />

          <h3>Environment</h3>
          <dl className="settings-dl">
            <dt>App Name</dt>
            <dd>{config.appName}</dd>
            <dt>Repo Root</dt>
            <dd>
              <code>{config.repoRoot}</code>
            </dd>
            <dt>Generated Games Dir</dt>
            <dd>
              <code>{config.generatedGamesDir}</code>
            </dd>
            <dt>Ollama URL</dt>
            <dd>{config.ollamaBaseUrl}</dd>
            <dt>NVIDIA Image Model (active)</dt>
            <dd>
              <code>{form.nvidiaImageModel.trim() || config.nvidiaImageModel}</code>
            </dd>
          </dl>

          <h3>API Keys (.env)</h3>
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
          </ul>

          <h3>Image Generation Providers</h3>
          <p className="hint">
            Use <strong>HYBRID_FREE</strong> or <strong>FREE_ONLY</strong> mode to enable hosted NVIDIA
            FLUX/SD image generation. LOCAL_ONLY uses ComfyUI/Diffusers only.
          </p>
          <table className="provider-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Local</th>
                <th>Priority</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {config.imageProviders.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.local ? 'yes' : 'no'}</td>
                  <td>{p.priority}</td>
                  <td className={p.healthy ? 'health-healthy' : 'health-unavailable'}>
                    {p.status ?? (p.healthy ? 'healthy' : 'unavailable')}
                    {p.reason ? ` — ${p.reason}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="hint">
        Edit <code>.env</code> in the repo root, then restart the desktop app.
      </p>
    </section>
  );
}
