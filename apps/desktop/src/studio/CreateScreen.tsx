import { useCallback, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import { GENERATION_MODES, GENERATION_PROFILES } from './generation-options.js';
import { openProjectInGodot, playProjectInGodot } from './godot-actions.js';

export function CreateScreen({ bridgeReady }: { bridgeReady: boolean | null }) {
  const { setSelectedPath, refreshProjects, navigate } = useStudio();
  const [prompt, setPrompt] = useState('');
  const [profile, setProfile] = useState('TINY_TEST');
  const [mode, setMode] = useState('HYBRID_FREE');
  const [seed, setSeed] = useState('42');
  const [archetype, setArchetype] = useState('SIDE_VIEW_METROIDVANIA');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    outputPath?: string;
    errors?: string[];
    warnings?: string[];
  } | null>(null);
  const [livePhases, setLivePhases] = useState<{ phase: string; status: string; message?: string }[]>([]);
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
        archetype,
      });
      setResult(res);
      setLivePhases(res.phases);
      if (res.outputPath) {
        await refreshProjects();
        setSelectedPath(res.outputPath);
      }
    } catch (err) {
      setResult({ success: false, errors: [String(err)] });
    } finally {
      unsub?.();
      setGenerating(false);
    }
  }, [prompt, profile, mode, seed, archetype, refreshProjects, setSelectedPath]);

  return (
    <section className="create-screen">
      <div className="create-hero panel-l2">
        <ScreenHeader
          eyebrow="Create"
          title="Commission a game"
          description="Write the world. MetroForge runs the real generation pipeline — the log below is live phase events, not a fake spinner."
        />
      </div>
      <div className="create-form">
        <div className="archetype-grid" role="radiogroup" aria-label="Game archetype">
          <button
            type="button"
            role="radio"
            aria-checked={archetype === 'SIDE_VIEW_METROIDVANIA'}
            className={
              archetype === 'SIDE_VIEW_METROIDVANIA' ? 'archetype-card panel-l1 active' : 'archetype-card panel-l1'
            }
            disabled={generating}
            onClick={() => setArchetype('SIDE_VIEW_METROIDVANIA')}
          >
            <strong>Side-view Metroidvania</strong>
            <span>Ability-gated rooms, vertical exploration, and a progression graph.</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={archetype === 'TOP_DOWN_ACTION_ADVENTURE'}
            className={
              archetype === 'TOP_DOWN_ACTION_ADVENTURE' ? 'archetype-card panel-l1 active' : 'archetype-card panel-l1'
            }
            disabled={generating}
            onClick={() => setArchetype('TOP_DOWN_ACTION_ADVENTURE')}
          >
            <strong>Top-down action adventure</strong>
            <span>Overworld, regions, dungeons, and lock-and-key routing.</span>
          </button>
        </div>
        <label>
          Game Description
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A rain-soaked fortress of hanging gardens, where a lost smith hunts an echo stolen by the deep…"
            rows={5}
            disabled={generating}
          />
        </label>
        <div className="row">
          <label>
            Profile
            <select value={profile} onChange={(e) => setProfile(e.target.value)} disabled={generating}>
              {GENERATION_PROFILES.map((id) => (
                <option key={id} value={id}>
                  {id.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value)} disabled={generating}>
              {GENERATION_MODES.map((id) => (
                <option key={id} value={id}>
                  {id.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Seed
            <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} disabled={generating} />
          </label>
        </div>
        <p className="hint">
          Archetype is sent on generateGame. The current IPC handler accepts it and GenerationPipeline.run reads{' '}
          <code>options.archetype</code>.
        </p>
        <button
          className="primary"
          disabled={!prompt.trim() || generating || bridgeReady !== true}
          onClick={handleGenerate}
        >
          {generating ? 'Generating…' : 'Generate Game'}
        </button>
      </div>

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
                <button type="button" className="primary" onClick={() => navigate('Studio')}>
                  Open Generation Studio
                </button>
                <button type="button" onClick={() => navigate('Dashboard')}>
                  Project Dashboard
                </button>
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
