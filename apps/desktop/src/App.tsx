import { useState, useEffect, useCallback } from 'react';
import type { ModelEntry } from '@metroforge/schemas';

declare global {
  interface Window {
    metroforge?: {
      getVersion: () => Promise<string>;
      getConfig: () => Promise<{
        appName: string;
        generatedGamesDir: string;
        defaultMode: string;
        defaultProfile: string;
      }>;
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
      }) => Promise<ModelEntry[]>;
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
      generateGame: (opts: {
        prompt: string;
        profile: string;
        mode: string;
        seed: number;
      }) => Promise<{
        success: boolean;
        projectSlug: string;
        outputPath: string;
        errors: string[];
        warnings: string[];
        phases: { phase: string; status: string; message?: string }[];
      }>;
      onGenerationProgress: (
        callback: (data: { phase: string; status: string; message?: string }) => void,
      ) => () => void;
    };
  }
}

const NAV_ITEMS = [
  'Create',
  'Projects',
  'Generation',
  'Models',
  'Providers',
  'QA',
  'Settings',
] as const;

export function App() {
  const [activeNav, setActiveNav] = useState<string>('Create');
  const [version, setVersion] = useState('MetroForge AI');

  useEffect(() => {
    window.metroforge?.getVersion().then(setVersion).catch(() => {});
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
        {activeNav === 'Create' && <CreateScreen />}
        {activeNav === 'Projects' && <ProjectsScreen />}
        {activeNav === 'Generation' && <GenerationScreen />}
        {activeNav === 'Models' && <ModelsScreen />}
        {activeNav === 'Providers' && <ProvidersScreen />}
        {activeNav === 'QA' && <QAScreen />}
        {activeNav === 'Settings' && <SettingsScreen />}
      </main>
    </div>
  );
}

function CreateScreen() {
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
      <button className="primary" disabled={!prompt.trim() || generating} onClick={handleGenerate}>
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
              <p>Open in Godot 4.x and press F5 to play.</p>
            </>
          ) : (
            <p>Generation failed: {result.errors?.join(', ')}</p>
          )}
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

  useEffect(() => {
    window.metroforge?.listProjects().then(setProjects).catch(() => {});
  }, []);

  return (
    <section>
      <h2>Projects</h2>
      {projects.length === 0 ? (
        <p className="hint">No generated projects yet.</p>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.slug} className="project-card">
              <strong>{p.title ?? p.slug}</strong>
              <span>{p.profile ?? 'unknown profile'}</span>
              <code>{p.path}</code>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GenerationScreen() {
  return (
    <section>
      <h2>Generation</h2>
      <p>Use the Create screen to start a new generation job. Progress appears live during generation.</p>
    </section>
  );
}

function ModelsScreen() {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [hardware, setHardware] = useState<{
    profile: string;
    totalRamMb: number;
    vramMb?: number;
    starterPack: string[];
  } | null>(null);
  const [filter, setFilter] = useState<'all' | 'installed' | 'text' | 'vision' | 'image' | 'audio'>('all');
  const [scouting, setScouting] = useState(false);

  const load = useCallback(async () => {
    const [m, hw] = await Promise.all([
      window.metroforge?.listModels(),
      window.metroforge?.getHardwareProfile(),
    ]);
    if (m) setModels(m);
    if (hw) setHardware(hw);
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
            <th>Installed</th>
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
              <td>{m.installed ? '✓' : '—'}</td>
              <td title={m.commercialUse}>{m.license.slice(0, 20)}</td>
              <td>{m.recommendedRamMb ? `${m.recommendedRamMb}M` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">{filtered.length} models — configure via config/models.catalog.json</p>
    </section>
  );
}

function ProvidersScreen() {
  const [providers, setProviders] = useState<
    { id: string; name: string; local: boolean; enabled: boolean; health: string; priority: number }[]
  >([]);

  useEffect(() => {
    window.metroforge?.listProviders().then(setProviders).catch(() => {});
  }, []);

  return (
    <section>
      <h2>AI Providers</h2>
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

  useEffect(() => {
    window.metroforge?.runDoctor().then(setChecks).catch(() => {});
  }, []);

  return (
    <section>
      <h2>Environment Check</h2>
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
  const [config, setConfig] = useState<{ appName: string; generatedGamesDir: string } | null>(null);

  useEffect(() => {
    window.metroforge?.getConfig().then(setConfig).catch(() => {});
  }, []);

  return (
    <section>
      <h2>Settings</h2>
      {config && (
        <dl className="settings-dl">
          <dt>App Name</dt>
          <dd>{config.appName}</dd>
          <dt>Generated Games Dir</dt>
          <dd>{config.generatedGamesDir}</dd>
        </dl>
      )}
      <p className="hint">Edit .env in the project root to change configuration.</p>
    </section>
  );
}
