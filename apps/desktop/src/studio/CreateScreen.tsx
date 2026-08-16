import { useCallback, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import { GENERATION_MODES, GENERATION_PROFILES } from './generation-options.js';
import { openProjectInGodot, playProjectInGodot } from './godot-actions.js';
import { Badge, Button, EmptyState, Input, Panel, Select } from './ui/index.js';

function phaseTone(status: string): 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted' {
  const s = status.toUpperCase();
  if (s === 'PASSED' || s === 'SUCCESS' || s === 'COMPLETED') return 'success';
  if (s === 'FAILED' || s === 'ERROR') return 'danger';
  if (s === 'RUNNING' || s === 'ACTIVE') return 'accent';
  if (s === 'WARNING' || s === 'DEGRADED' || s === 'WARN') return 'warning';
  if (s === 'SKIPPED' || s === 'PENDING') return 'muted';
  return 'default';
}

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
    <section className="workspace-screen create-screen">
      <ScreenHeader
        eyebrow="Create"
        title="New Game"
        description="Write the world. MetroForge runs the real generation pipeline — progress below is live phase events, not a spinner."
      />

      <div className="create-layout">
        <Panel level={1} className="create-commission" title="Commission">
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
              <span>Ability-gated rooms, vertical exploration, progression graph.</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={archetype === 'TOP_DOWN_ACTION_ADVENTURE'}
              className={
                archetype === 'TOP_DOWN_ACTION_ADVENTURE'
                  ? 'archetype-card panel-l1 active'
                  : 'archetype-card panel-l1'
              }
              disabled={generating}
              onClick={() => setArchetype('TOP_DOWN_ACTION_ADVENTURE')}
            >
              <strong>Top-down action adventure</strong>
              <span>Overworld, regions, dungeons, lock-and-key routing.</span>
            </button>
          </div>

          <label className="create-field">
            Game description
            <textarea
              className="mf-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A rain-soaked fortress of hanging gardens, where a lost smith hunts an echo stolen by the deep…"
              rows={4}
              disabled={generating}
            />
          </label>

          <div className="row create-options">
            <label className="create-field">
              Profile
              <Select value={profile} onChange={(e) => setProfile(e.target.value)} disabled={generating}>
                {GENERATION_PROFILES.map((id) => (
                  <option key={id} value={id}>
                    {id.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </label>
            <label className="create-field">
              Mode
              <Select value={mode} onChange={(e) => setMode(e.target.value)} disabled={generating}>
                {GENERATION_MODES.map((id) => (
                  <option key={id} value={id}>
                    {id.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </label>
            <label className="create-field create-seed">
              Seed
              <Input
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                disabled={generating}
                aria-label="Seed"
              />
            </label>
          </div>

          <p className="hint">
            Archetype is sent on generateGame. The pipeline reads <code>options.archetype</code>.
          </p>

          <div className="row create-actions">
            <Button
              variant="primary"
              disabled={!prompt.trim() || generating || bridgeReady !== true}
              onClick={handleGenerate}
            >
              {generating ? 'Generating…' : 'Generate Game'}
            </Button>
            {bridgeReady !== true && (
              <Badge tone="warning">Bridge unavailable</Badge>
            )}
          </div>
        </Panel>

        <Panel
          level={1}
          className="create-progress"
          title="Progress"
          actions={
            livePhases.length > 0 ? (
              <Badge tone={generating ? 'accent' : result?.success ? 'success' : result ? 'danger' : 'muted'}>
                {generating ? 'RUNNING' : result?.success ? 'PASSED' : result ? 'FAILED' : 'IDLE'}
              </Badge>
            ) : null
          }
        >
          {livePhases.length === 0 ? (
            <EmptyState
              title="No pipeline activity"
              description="Start a commission to stream live phase status here."
            />
          ) : (
            <div className="phase-list compact">
              {livePhases.map((p) => (
                <div key={p.phase} className={`phase-item status-${p.status.toLowerCase()}`}>
                  <span className="phase-name">{p.phase}</span>
                  <Badge tone={phaseTone(p.status)}>{p.status}</Badge>
                  {p.message && <span className="phase-msg">{p.message}</span>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {result && (
        <Panel
          level={1}
          className="create-result"
          title="Result"
          actions={<Badge tone={result.success ? 'success' : 'danger'}>{result.success ? 'SUCCESS' : 'FAILED'}</Badge>}
        >
          {result.success ? (
            <>
              <p>
                Game generated at: <code className="mono">{result.outputPath}</code>
              </p>
              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                <Button variant="primary" onClick={() => navigate('Studio')}>
                  Open Generation Studio
                </Button>
                <Button onClick={() => navigate('Dashboard')}>Project Dashboard</Button>
                <Button
                  variant="primary"
                  onClick={async () => {
                    setGodotActionError(null);
                    if (result.outputPath) {
                      setGodotActionError(await openProjectInGodot(result.outputPath));
                    }
                  }}
                >
                  Open in Godot
                </Button>
                <Button
                  onClick={async () => {
                    setGodotActionError(null);
                    if (result.outputPath) {
                      setGodotActionError(await playProjectInGodot(result.outputPath));
                    }
                  }}
                >
                  Play (F5)
                </Button>
              </div>
            </>
          ) : (
            <p className="result error" style={{ marginTop: 0 }}>
              Generation failed: {result.errors?.join(', ')}
            </p>
          )}
          {godotActionError && <p className="result error">{godotActionError}</p>}
          {result.warnings && result.warnings.length > 0 && (
            <ul className="warnings">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </section>
  );
}
