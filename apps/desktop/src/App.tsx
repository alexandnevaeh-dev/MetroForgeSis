import { useState, useEffect, useCallback } from 'react';
import type { ModelEntry } from '@metroforge/schemas';
import { GenerationStudio } from './studio/GenerationStudio';
import { AssetsGallery } from './studio/AssetsGallery';
import { WorldEditor } from './studio/WorldEditor';
import { RoomEditor } from './studio/RoomEditor';
import { ProjectDashboard } from './studio/ProjectDashboard';
import { GenerateAssetScreen } from './studio/GenerateAsset';
import { WorldMapPreview } from './studio/WorldMapPreview';

declare global {
  interface Window {
    metroforge?: {
      getVersion: () => Promise<string>;
      getConfig: () => Promise<DesktopConfig>;
      getAppSettings: () => Promise<Record<string, string>>;
      setAppSettings: (settings: Record<string, string>) => Promise<{ success: boolean; saved: Record<string, string> }>;
      getAppSettings: () => Promise<Record<string, string>>;
      setAppSettings: (settings: Record<string, string>) => Promise<{ success: boolean; saved: Record<string, string> }>;
      runDoctor: () => Promise<{ name: string; status: string; message: string }[]>;
      listProviders: () => Promise<
        {
          id: string;
          name: string;
          local: boolean;
          enabled: boolean;
          health: string;
          priority: number;
        }[]
      >;
      listModels: (filter?: {
        capability?: string;
        installed?: boolean;
      }) => Promise<
        (ModelEntry & {
          routable?: boolean;
          providerEnabled?: boolean;
          liveListed?: boolean | null;
          downloadable?: boolean;
        })[]
      >;
      downloadModel: (modelId: string) => Promise<{
        success: boolean;
        targetPath?: string;
        adapter?: string;
        message?: string;
        error?: string;
      }>;
      getHardwareProfile: () => Promise<{
        profile: string;
        totalRamMb: number;
        vramMb?: number;
        starterPack: string[];
      }>;
      scoutModels: (opts?: { benchmark?: boolean }) => Promise<unknown>;
      rankModels: (capability: string) => Promise<unknown>;
      listProjects: () => Promise<
        { slug: string; path: string; title?: string; profile?: string }[]
      >;
      getProjectPreview: (projectPath: string) => Promise<ProjectPreview>;
      openInGodot: (projectPath: string) => Promise<{ success: boolean; message: string }>;
      playInGodot: (projectPath: string) => Promise<{ success: boolean; message: string }>;
      refreshProjectTemplate: (projectPath: string) => Promise<{
        success: boolean;
        copied: string[];
        removed: string[];
        errors: string[];
      }>;
      generateGame: (opts: {
        prompt: string;
        profile: string;
        mode: string;
        seed: number;
        generationControl?: string;
      }) => Promise<{
        success: boolean;
        projectSlug: string;
        outputPath: string;
        errors: string[];
        warnings: string[];
        phases: { phase: string; status: string; message?: string }[];
      }>;
      getGenerationState: (projectPath: string) => Promise<{
        projectPath: string;
        phases: { phase: string; status: string; message?: string }[];
        events: Array<Record<string, unknown>>;
        overallProgress: number;
        validationReport?: Record<string, unknown>;
        worldGraph?: unknown;
      }>;
      getGenerationEvents: (projectPath: string, category?: string) => Promise<Array<Record<string, unknown>>>;
      listAssets: (projectPath: string) => Promise<
        Array<{
          id: string;
          path: string;
          category: string;
          provider?: string;
          fallbackGenerated?: boolean;
          critiquePassed?: boolean;
          critiqueScore?: number;
          dataUrl?: string;
          isAnimation?: boolean;
          frameCount?: number;
          prompt?: string;
        }>
      >;
      getAssetPreview: (projectPath: string, relPath: string) => Promise<{ dataUrl?: string }>;
      generateAsset: (request: {
        projectPath: string;
        description: string;
        assetType: string;
        generationMode?: string;
      }) => Promise<{
        success: boolean;
        asset?: { path: string };
        errors?: string[];
      }>;
      getWorldGraph: (projectPath: string) => Promise<unknown>;
      updateWorldGraph: (
        projectPath: string,
        command: unknown,
      ) => Promise<{ success?: boolean; error?: string; message?: string; worldGraph?: unknown }>;
      onGenerationEvent: (callback: (event: Record<string, unknown>) => void) => () => void;
      onGenerationProgress: (
        callback: (data: { phase: string; status: string; message?: string }) => void,
      ) => () => void;
    };
  }
}

const NAV_ITEMS = [
  'Dashboard',
  'Studio',
  'Create',
  'Projects',
  'Assets',
  'Generate Asset',
  'World',
  'Rooms',
  'Preview',
  'Models',
  'Providers',
  'QA',
  'Settings',
] as const;

type DesktopConfig = {
  appName: string;
  generatedGamesDir: string;
  defaultMode: string;
  defaultProfile: string;
  godotExecutable: string | null;
  ollamaBaseUrl: string;
  repoRoot: string;
  nvidiaImageModel: string;
  concurrency?: { llm: number; image: number; audio: number; cpu: number };
  appPreferences?: Record<string, string>;
  envKeys: {
    nvidiaApiKey: boolean;
    geminiApiKey: boolean;
    groqApiKey: boolean;
    openrouterApiKey: boolean;
    huggingfaceApiKey: boolean;
    comfyuiUrl: boolean;
    diffusersPython: boolean;
  };
  imageProviders: { id: string; local: boolean; priority: number; healthy: boolean }[];
};

type ProjectPreview = {
  title?: string;
  profile?: string;
  error?: string;
  assetPreviews?: Array<{
    id: string;
    path: string;
    provider?: string;
    fallbackGenerated?: boolean;
    critiqueScore?: number;
    dataUrl: string;
  }>;
  worldGraph?: {
    nodes?: Array<{ id: string; label?: string; metadata?: Record<string, unknown> }>;
    edges?: Array<{ from: string; to: string; requirements?: string[] }>;
  };
};

async function openProjectInGodot(projectPath: string): Promise<string | null> {
  if (!window.metroforge?.openInGodot) return 'Desktop bridge unavailable';
  const result = await window.metroforge.openInGodot(projectPath);
  return result.success ? null : result.message;
}

async function playProjectInGodot(projectPath: string): Promise<string | null> {
  if (!window.metroforge?.playInGodot) return 'Desktop bridge unavailable';
  const result = await window.metroforge.playInGodot(projectPath);
  return result.success ? null : result.message;
}

export function App() {
  const [activeNav, setActiveNav] = useState<string>('Dashboard');
  const [version, setVersion] = useState('MetroForge AI');
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null);

  useEffect(() => {
    const bridge = window.metroforge;
    if (!bridge) {
      setBridgeReady(false);
      return;
    }
    setBridgeReady(true);
    bridge.getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>MetroForge AI</h1>
          <span className="version">{version}</span>
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              className={activeNav === item ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveNav(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        {bridgeReady === false && (
          <div className="result error" style={{ marginBottom: '1rem' }}>
            Desktop bridge unavailable — restart with <code>pnpm dev:desktop</code> from the repo
            root. If this persists, rebuild the Electron preload bundle.
          </div>
        )}
        {activeNav === 'Dashboard' && <ProjectDashboard />}
        {activeNav === 'Studio' && <GenerationStudio />}
        {activeNav === 'Create' && <CreateScreen bridgeReady={bridgeReady} />}
        {activeNav === 'Projects' && <ProjectsScreen />}
        {activeNav === 'Assets' && <AssetsGallery />}
        {activeNav === 'Generate Asset' && <GenerateAssetScreen />}
        {activeNav === 'World' && <WorldEditor />}
        {activeNav === 'Rooms' && <RoomEditor />}
        {activeNav === 'Preview' && <PreviewScreen />}
        {activeNav === 'Models' && <ModelsScreen />}
        {activeNav === 'Providers' && <ProvidersScreen />}
        {activeNav === 'QA' && <QAScreen />}
        {activeNav === 'Settings' && <SettingsScreen />}
      </main>
    </div>
  );
}

function CreateScreen({ bridgeReady }: { bridgeReady: boolean | null }) {
  const [prompt, setPrompt] = useState('');
  const [profile, setProfile] = useState('TINY_TEST');
  const [mode, setMode] = useState('LOCAL_ONLY');
  const [seed, setSeed] = useState('42');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    outputPath?: string;
    errors?: string[];
    warnings?: string[];
  } | null>(null);
  const [livePhases, setLivePhases] = useState<
    { phase: string; status: string; message?: string }[]
  >([]);
  const [godotActionError, setGodotActionError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!window.metroforge?.generateGame || !prompt.trim()) return;
    setGenerating(true);
    setResult(null);
    setLivePhases([]);

    const unsub = window.metroforge.onGenerationProgress?.((data) => {
      setLivePhases((prev) => {
        const idx = prev.findIndex((p) => p.phase === data.phase);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data;
          return next;
        }
        return [...prev, data];
      });
    });

    try {
      const res = await window.metroforge.generateGame({
        prompt,
        profile,
        mode,
        seed: parseInt(seed, 10) || 42,
      });
      setResult(res);
      setLivePhases(res.phases);
    } catch (err) {
      setResult({ success: false, errors: [String(err)] });
    } finally {
      unsub?.();
      setGenerating(false);
    }
  }, [prompt, profile, mode, seed]);

  return (
    <section className="create-screen">
      <h2>Create New Game</h2>
      <label>
        Game Description
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your Metroidvania..."
          rows={5}
          disabled={generating}
        />
      </label>
      <div className="row">
        <label>
          Profile
          <select value={profile} onChange={(e) => setProfile(e.target.value)} disabled={generating}>
            <option value="TINY_TEST">Tiny Test</option>
            <option value="SMALL">Small</option>
            <option value="MEDIUM">Medium</option>
            <option value="LARGE">Large</option>
          </select>
        </label>
        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={generating}>
            <option value="FREE_ONLY">Free Only</option>
            <option value="LOCAL_ONLY">Local Only</option>
            <option value="HYBRID_FREE">Hybrid Free</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </label>
        <label>
          Seed
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            disabled={generating}
          />
        </label>
      </div>
      <button
        className="primary"
        disabled={!prompt.trim() || generating || bridgeReady !== true}
        onClick={handleGenerate}
      >
        {generating ? 'Generating...' : 'Generate Game'}
      </button>

      {livePhases.length > 0 && (
        <div className="phase-list">
          <h3>Progress</h3>
          {livePhases.map((p) => (
            <div key={p.phase} className={`phase-item status-${p.status.toLowerCase()}`}>
              <span className="phase-name">{p.phase}</span>
              <span className="phase-status">{p.status}</span>
              {p.message && <span className="phase-msg">{p.message}</span>}
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className={result.success ? 'result success' : 'result error'}>
          {result.success ? (
            <>
              <p>Game generated at: {result.outputPath}</p>
              <div className="row" style={{ marginTop: '0.75rem' }}>
                <button
                  className="primary"
                  type="button"
                  onClick={async () => {
                    setGodotActionError(null);
                    if (result.outputPath) {
                      setGodotActionError(await openProjectInGodot(result.outputPath));
                    }
                  }}
                >
                  Open in Godot
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setGodotActionError(null);
                    if (result.outputPath) {
                      setGodotActionError(await playProjectInGodot(result.outputPath));
                    }
                  }}
                >
                  Play (F5)
                </button>
              </div>
            </>
          ) : (
            <p>Generation failed: {result.errors?.join(', ')}</p>
          )}
          {godotActionError && <p className="result error">{godotActionError}</p>}
          {result.warnings && result.warnings.length > 0 && (
            <ul className="warnings">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ProjectsScreen() {
  const [projects, setProjects] = useState<
    { slug: string; path: string; title?: string; profile?: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [godotActionError, setGodotActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.metroforge?.listProjects) {
      setError('Desktop bridge unavailable');
      return;
    }
    window.metroforge
      .listProjects()
      .then(setProjects)
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <section>
      <h2>Projects</h2>
      {error && <p className="result error">{error}</p>}
      {godotActionError && <p className="result error">{godotActionError}</p>}
      {projects.length === 0 ? (
        <p className="hint">No generated projects yet.</p>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.slug} className="project-card">
              <strong>{p.title ?? p.slug}</strong>
              <span>{p.profile ?? 'unknown profile'}</span>
              <code>{p.path}</code>
              <div className="row" style={{ marginTop: '0.5rem' }}>
                <button
                  className="primary"
                  type="button"
                  onClick={async () => {
                    setGodotActionError(null);
                    setGodotActionError(await openProjectInGodot(p.path));
                  }}
                >
                  Open in Godot
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setGodotActionError(null);
                    setGodotActionError(await playProjectInGodot(p.path));
                  }}
                >
                  Play (F5)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setGodotActionError(null);
                    const result = await window.metroforge?.refreshProjectTemplate?.(p.path);
                    if (!result?.success) {
                      setGodotActionError(result?.errors?.join('; ') ?? 'Template refresh failed');
                    } else {
                      window.alert(
                        `Refreshed ${result.copied.length} runtime files` +
                          (result.removed.length > 0
                            ? `, removed ${result.removed.length} orphans`
                            : ''),
                      );
                    }
                  }}
                >
                  Refresh Template
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setGodotActionError(null);
                    const result = await window.metroforge?.exportProject?.(p.path, { force: true });
                    if (!result?.success) {
                      setGodotActionError(result?.errors?.join('; ') ?? 'Export failed');
                    } else if (result.archivePath) {
                      window.alert(`Exported to ${result.archivePath}`);
                    }
                  }}
                >
                  Export Package
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PreviewScreen() {
  const [projects, setProjects] = useState<
    { slug: string; path: string; title?: string; profile?: string }[]
  >([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.metroforge?.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) {
        setSelectedPath((prev) => prev || list[0]!.path);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedPath || !window.metroforge?.getProjectPreview) return;
    setLoading(true);
    setError(null);
    window.metroforge
      .getProjectPreview(selectedPath)
      .then((data) => {
        if (data.error) setError(data.error);
        setPreview(data);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [selectedPath]);

  return (
    <section>
      <h2>Project Preview</h2>
      <p className="hint">Inspect generated assets and world topology for a project.</p>
      {projects.length === 0 ? (
        <p className="hint">Generate a game first, then return here.</p>
      ) : (
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
      )}
      {loading && <p className="hint">Loading preview…</p>}
      {error && <p className="result error">{error}</p>}
      {preview && !preview.error && (
        <>
          <h3>{preview.title}</h3>
          {preview.profile && <p className="hint">Profile: {preview.profile}</p>}
          <WorldMapPreview worldGraph={preview.worldGraph} />
          <h3 style={{ marginTop: '1.5rem' }}>Generated Assets</h3>
          {preview.assetPreviews && preview.assetPreviews.length > 0 ? (
            <div className="asset-grid">
              {preview.assetPreviews.map((asset) => (
                <figure key={asset.id} className="asset-card">
                  <img src={asset.dataUrl} alt={asset.id} />
                  <figcaption>
                    <strong>{asset.id}</strong>
                    <span>{asset.provider ?? 'unknown'}</span>
                    {asset.fallbackGenerated && <span className="tag">procedural</span>}
                    {typeof asset.critiqueScore === 'number' && (
                      <span>critique: {asset.critiqueScore}</span>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="hint">No texture assets found in generation_manifest.json.</p>
          )}
        </>
      )}
    </section>
  );
}

function ModelsScreen() {
  const [models, setModels] = useState<
    (ModelEntry & {
      routable?: boolean;
      providerEnabled?: boolean;
      liveListed?: boolean | null;
      downloadable?: boolean;
    })[]
  >([]);
  const [hardware, setHardware] = useState<{
    profile: string;
    totalRamMb: number;
    vramMb?: number;
    starterPack: string[];
  } | null>(null);
  const [filter, setFilter] = useState<'all' | 'installed' | 'text' | 'vision' | 'image' | 'audio'>('all');
  const [scouting, setScouting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!window.metroforge) return;
    try {
      const [m, hw] = await Promise.all([
        window.metroforge.listModels(),
        window.metroforge.getHardwareProfile(),
      ]);
      if (m) setModels(m);
      if (hw) setHardware(hw);
    } catch {
      /* shown via empty table */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = models.filter((m) => {
    if (filter === 'installed') return m.installed;
    if (filter === 'text') return m.modality === 'text';
    if (filter === 'vision') return m.modality === 'vision';
    if (filter === 'image') return m.modality === 'image';
    if (filter === 'audio') return m.modality === 'audio' || m.modality === 'speech';
    return true;
  });

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
      <h2>Models</h2>
      {hardware && (
        <p className="hint">
          Hardware: {hardware.profile} — {hardware.totalRamMb} MB RAM
          {hardware.vramMb ? `, ${hardware.vramMb} MB VRAM` : ''}
        </p>
      )}
      <div className="row" style={{ marginBottom: '1rem' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All</option>
          <option value="installed">Installed</option>
          <option value="text">Text</option>
          <option value="vision">Vision</option>
          <option value="image">Image</option>
          <option value="audio">Audio</option>
        </select>
        <button className="primary" onClick={handleScout} disabled={scouting}>
          {scouting ? 'Scouting...' : 'Refresh Catalog'}
        </button>
      </div>
      {hardware?.starterPack && (
        <div className="phase-list" style={{ marginBottom: '1rem' }}>
          <h3>Starter Pack ({hardware.profile})</h3>
          {hardware.starterPack.map((id) => (
            <div key={id} className="phase-item">
              <span className="phase-name">{id}</span>
            </div>
          ))}
        </div>
      )}
      <table className="provider-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Modality</th>
            <th>Provider</th>
            <th>Routable</th>
            <th>Live API</th>
            <th>Installed</th>
            <th>Download</th>
            <th>License</th>
            <th>RAM</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 50).map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{m.modality}</td>
              <td>{m.provider}</td>
              <td>{m.routable ? '✓' : '—'}</td>
              <td>{m.liveListed === null ? 'n/a' : m.liveListed ? '✓' : '—'}</td>
              <td>{m.installed ? '✓' : '—'}</td>
              <td>
                {m.downloadable && !m.installed ? (
                  <button
                    type="button"
                    onClick={() => handleDownload(m.id)}
                    disabled={downloadingId !== null}
                  >
                    {downloadingId === m.id ? 'Downloading…' : 'Download'}
                  </button>
                ) : (
                  '—'
                )}
              </td>
              <td title={m.commercialUse}>{m.license.slice(0, 20)}</td>
              <td>{m.recommendedRamMb ? `${m.recommendedRamMb}M` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {downloadMessage && <p className="hint">{downloadMessage}</p>}
      {downloadError && <p className="result error">{downloadError}</p>}
      <p className="hint">
        {filtered.length} models — reconciled with live provider keys and router (Routable = selectable now)
      </p>
    </section>
  );
}

function ProvidersScreen() {
  const [providers, setProviders] = useState<
    { id: string; name: string; local: boolean; enabled: boolean; health: string; priority: number }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.metroforge?.listProviders) {
      setError('Desktop bridge unavailable');
      return;
    }
    window.metroforge
      .listProviders()
      .then(setProviders)
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <section>
      <h2>AI Providers</h2>
      {error && <p className="result error">{error}</p>}
      <table className="provider-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Local</th>
            <th>Enabled</th>
            <th>Health</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.local ? 'yes' : 'no'}</td>
              <td>{p.enabled ? 'yes' : 'no'}</td>
              <td className={`health-${p.health}`}>{p.health}</td>
              <td>{p.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Configure API keys in .env to enable hosted providers.</p>
    </section>
  );
}

function QAScreen() {
  const [checks, setChecks] = useState<{ name: string; status: string; message: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.metroforge?.runDoctor) {
      setError('Desktop bridge unavailable');
      return;
    }
    window.metroforge
      .runDoctor()
      .then(setChecks)
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <section>
      <h2>Environment Check</h2>
      {error && <p className="result error">{error}</p>}
      <ul className="check-list">
        {checks.map((c) => (
          <li key={c.name} className={`check-${c.status.toLowerCase()}`}>
            [{c.status}] {c.name}: {c.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SettingsScreen() {
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    defaultMode: 'LOCAL_ONLY',
    defaultProfile: 'TINY_TEST',
    godotExecutable: '',
    concurrencyImage: '1',
    concurrencyLlm: '2',
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
        });
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const savePreferences = async () => {
    if (!window.metroforge?.setAppSettings) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await window.metroforge.setAppSettings({
        'app.defaultMode': form.defaultMode,
        'app.defaultProfile': form.defaultProfile,
        'app.godotExecutable': form.godotExecutable.trim(),
        'app.concurrency.image': form.concurrencyImage,
        'app.concurrency.llm': form.concurrencyLlm,
      });
      const refreshed = await window.metroforge.getConfig();
      setConfig(refreshed);
      setSaveMessage('Preferences saved.');
    } catch (err) {
      setSaveMessage(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2>Settings</h2>
      {loading && <p className="hint">Loading settings…</p>}
      {error && <p className="result error">{error}</p>}
      {config && (
        <>
          <h3>App Preferences</h3>
          <p className="hint">Stored in the MetroForge database and applied on next launch (concurrency applies immediately).</p>
          <div className="form-grid">
            <label>
              Default Mode
              <select
                value={form.defaultMode}
                onChange={(e) => setForm((f) => ({ ...f, defaultMode: e.target.value }))}
              >
                <option value="LOCAL_ONLY">LOCAL_ONLY</option>
                <option value="HYBRID_FREE">HYBRID_FREE</option>
                <option value="FREE_ONLY">FREE_ONLY</option>
              </select>
            </label>
            <label>
              Default Profile
              <select
                value={form.defaultProfile}
                onChange={(e) => setForm((f) => ({ ...f, defaultProfile: e.target.value }))}
              >
                <option value="TINY_TEST">TINY_TEST</option>
                <option value="STANDARD">STANDARD</option>
                <option value="FULL">FULL</option>
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
              Max concurrent LLM jobs
              <input
                type="number"
                min={1}
                max={8}
                value={form.concurrencyLlm}
                onChange={(e) => setForm((f) => ({ ...f, concurrencyLlm: e.target.value }))}
              />
            </label>
          </div>
          <button type="button" onClick={savePreferences} disabled={saving}>
            {saving ? 'Saving…' : 'Save Preferences'}
          </button>
          {saveMessage && <p className="hint">{saveMessage}</p>}

          <h3>Environment</h3>
          <dl className="settings-dl">
            <dt>App Name</dt>
            <dd>{config.appName}</dd>
            <dt>Repo Root</dt>
            <dd><code>{config.repoRoot}</code></dd>
            <dt>Generated Games Dir</dt>
            <dd><code>{config.generatedGamesDir}</code></dd>
            <dt>Ollama URL</dt>
            <dd>{config.ollamaBaseUrl}</dd>
            <dt>NVIDIA Image Model</dt>
            <dd><code>{config.nvidiaImageModel}</code></dd>
          </dl>

          <h3>API Keys (.env)</h3>
          <ul className="check-list">
            <li className={config.envKeys.nvidiaApiKey ? 'check-pass' : 'check-warn'}>
              NVIDIA_API_KEY — {config.envKeys.nvidiaApiKey ? 'configured' : 'not set'}
            </li>
            <li className={config.envKeys.comfyuiUrl ? 'check-pass' : 'check-warn'}>
              COMFYUI_BASE_URL — {config.envKeys.comfyuiUrl ? 'configured' : 'not set'}
            </li>
            <li className={config.envKeys.diffusersPython ? 'check-pass' : 'check-warn'}>
              DIFFUSERS_PYTHON / DIFFUSERS_MODEL_ID —{' '}
              {config.envKeys.diffusersPython ? 'configured' : 'not set'}
            </li>
            <li className={config.envKeys.geminiApiKey ? 'check-pass' : 'check-warn'}>
              GEMINI_API_KEY — {config.envKeys.geminiApiKey ? 'configured' : 'not set'}
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
                    {p.healthy ? 'healthy' : 'unavailable'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="hint">Edit <code>.env</code> in the repo root, then restart the desktop app.</p>
    </section>
  );
}
