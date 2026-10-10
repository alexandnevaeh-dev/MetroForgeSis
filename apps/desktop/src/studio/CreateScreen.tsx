import { useCallback, useRef, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { useStudio } from './StudioContext.js';
import { GENERATION_MODES, GENERATION_PROFILES } from './generation-options.js';
import { openProjectInGodot, playGeneratedProject } from './godot-actions.js';
import { Badge, Button, EmptyState, Input, Panel, Select, TextArea } from './ui/index.js';
import {
  QUANTUM_ARCHETYPE,
  creationResultStatus,
  latestCreationPhases,
  parseCreationSeed,
  type CreationResult,
} from './creation-contract.js';

function phaseTone(
  status: string,
): 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted' {
  const s = status.toUpperCase();
  if (s === 'PASSED' || s === 'SUCCESS' || s === 'COMPLETED') return 'success';
  if (s === 'FAILED' || s === 'ERROR') return 'danger';
  if (s === 'RUNNING' || s === 'ACTIVE') return 'accent';
  if (s === 'WARNING' || s === 'DEGRADED' || s === 'WARN') return 'warning';
  if (s === 'SKIPPED' || s === 'PENDING') return 'muted';
  return 'default';
}

export function CreateScreen({
  bridgeReady,
  active = true,
}: {
  bridgeReady: boolean | null;
  active?: boolean;
}) {
  const { setSelectedPath, refreshProjects, navigate, creationMode, setCreationMode } = useStudio();
  const [title, setTitle] = useState('Untitled Forge');
  const [prompt, setPrompt] = useState('');
  const [profile, setProfile] = useState('TINY_TEST');
  const [mode, setMode] = useState('HYBRID_FREE');
  const [seed, setSeed] = useState('42');
  const [archetype, setArchetype] = useState('SIDE_VIEW_METROIDVANIA');
  const [targetEngine, setTargetEngine] = useState<'godot'|'unity'|'unreal'>('godot');
  const [resultEngine, setResultEngine] = useState<'godot'|'unity'|'unreal'>('godot');
  const [worldLayout, setWorldLayout] = useState<
    'procedural' | 'stormglass-gallery' | 'stormglass-expanded-region' | 'stormglass-archive-wing'
  >('procedural');
  const [generating, setGenerating] = useState(false);
  const [scaffolding, setScaffolding] = useState(false);
  const submissionLock = useRef(false);
  const [result, setResult] = useState<CreationResult | null>(null);
  const quantum = archetype === QUANTUM_ARCHETYPE;
  const stormglassGallery =
    archetype === 'SIDE_VIEW_METROIDVANIA' &&
    creationMode !== 'manual' &&
    worldLayout !== 'procedural';
  const busy = generating || scaffolding;
  const parsedSeed = parseCreationSeed(seed, quantum);
  const seedError =
    parsedSeed === null
      ? `Enter a whole-number seed from ${quantum ? '0' : '-2147483648'} to 2147483647.`
      : null;
  const titleError = !title.trim()
    ? 'Enter a project title.'
    : stormglassGallery && !title.trim().startsWith('Stormglass Reliquary')
      ? 'Use Stormglass Reliquary as this campaign’s title, or choose a procedural world.'
      : quantum && (title.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(title))
        ? 'Use a title of up to 80 characters without line breaks.'
        : null;
  const resultStatus = creationResultStatus(result);
  const [livePhases, setLivePhases] = useState<
    { phase: string; status: string; message?: string }[]
  >([]);
  const [godotActionError, setGodotActionError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (
      submissionLock.current ||
      !window.metroforge?.generateGame ||
      !prompt.trim() ||
      parsedSeed === null ||
      titleError
    )
      return;
    submissionLock.current = true;
    setGenerating(true);
    const engine = creationMode === 'manual' || archetype !== 'SIDE_VIEW_METROIDVANIA' ? 'godot' : targetEngine;
    setResultEngine(engine);
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
        title,
        prompt,
        targetEngine: engine,
        profile: quantum ? 'TINY_TEST' : profile,
        mode: quantum ? 'LOCAL_ONLY' : mode,
        seed: parsedSeed,
        archetype,
        worldLayout: stormglassGallery ? worldLayout : 'procedural',
      });
      setResult(res);
      setLivePhases(latestCreationPhases(res.phases));
      if (res.success && res.outputPath) {
        await refreshProjects();
        setSelectedPath(res.outputPath);
      }
    } catch (err) {
      setResult({ success: false, errors: [String(err)] });
    } finally {
      unsub?.();
      submissionLock.current = false;
      setGenerating(false);
    }
  }, [
    title,
    prompt,
    profile,
    mode,
    parsedSeed,
    titleError,
    quantum,
    archetype,
    stormglassGallery,
    worldLayout,
    targetEngine,
    creationMode,
    refreshProjects,
    setSelectedPath,
  ]);

  const handleScaffold = useCallback(async () => {
    if (
      submissionLock.current ||
      quantum ||
      !window.metroforge?.scaffoldManualProject ||
      parsedSeed === null ||
      titleError
    )
      return;
    submissionLock.current = true;
    setScaffolding(true);
    setResultEngine('godot');
    setResult(null);
    try {
      const res = await window.metroforge.scaffoldManualProject({
        title,
        prompt: prompt.trim() || undefined,
        profile,
        mode,
        seed: parsedSeed,
        archetype,
      });
      setResult({
        success: res.success,
        outputPath: res.projectPath,
        errors: res.errors,
        warnings: res.warnings,
      });
      if (res.success && res.projectPath) {
        await refreshProjects();
        setSelectedPath(res.projectPath);
        setCreationMode('manual');
      }
    } catch (err) {
      setResult({ success: false, errors: [String(err)] });
    } finally {
      submissionLock.current = false;
      setScaffolding(false);
    }
  }, [
    title,
    prompt,
    profile,
    mode,
    parsedSeed,
    titleError,
    quantum,
    archetype,
    refreshProjects,
    setSelectedPath,
    setCreationMode,
  ]);

  return (
    <section className="workspace-screen create-screen" hidden={!active}>
      <ScreenHeader
        eyebrow="Commission"
        title="New Game"
        description="Choose your game, describe its world, and create a playable project."
      />

      <div className="create-layout">
        <Panel level={1} className="create-commission" title="Commission">
          <div
            className="archetype-grid"
            role="radiogroup"
            aria-label="Game archetype"
            onKeyDown={(event) => {
              if (
                !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(
                  event.key,
                )
              )
                return;
              const radios = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  'button[role="radio"]:not(:disabled)',
                ),
              );
              const index = radios.indexOf(event.target as HTMLButtonElement);
              if (index < 0) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? radios.length - 1
                    : (index +
                        (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) +
                        radios.length) %
                      radios.length;
              radios[next]?.focus();
              radios[next]?.click();
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={archetype === 'SIDE_VIEW_METROIDVANIA'}
              tabIndex={archetype === 'SIDE_VIEW_METROIDVANIA' ? 0 : -1}
              className={
                archetype === 'SIDE_VIEW_METROIDVANIA'
                  ? 'archetype-card panel-l1 active'
                  : 'archetype-card panel-l1'
              }
              disabled={busy}
              onClick={() => setArchetype('SIDE_VIEW_METROIDVANIA')}
            >
              <strong>Side-view Metroidvania</strong>
              <span>Ability-gated rooms, vertical exploration, progression graph.</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={archetype === 'SIDE_VIEW_PLATFORMER'}
              tabIndex={archetype === 'SIDE_VIEW_PLATFORMER' ? 0 : -1}
              className={
                archetype === 'SIDE_VIEW_PLATFORMER'
                  ? 'archetype-card panel-l1 active'
                  : 'archetype-card panel-l1'
              }
              disabled={busy}
              onClick={() => {
                setArchetype('SIDE_VIEW_PLATFORMER');
                  setTargetEngine('godot');
                setWorldLayout('procedural');
              }}
            >
              <strong>Platformer</strong>
              <span>Jump challenges, checkpoints, and stages played in order.</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={archetype === 'TOP_DOWN_ACTION_ADVENTURE'}
              tabIndex={archetype === 'TOP_DOWN_ACTION_ADVENTURE' ? 0 : -1}
              className={
                archetype === 'TOP_DOWN_ACTION_ADVENTURE'
                  ? 'archetype-card panel-l1 active'
                  : 'archetype-card panel-l1'
              }
              disabled={busy}
              onClick={() => { setArchetype('TOP_DOWN_ACTION_ADVENTURE'); setTargetEngine('godot'); }}
            >
              <strong>Top-down action adventure</strong>
              <span>Overworld, regions, dungeons, lock-and-key routing.</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={quantum}
              tabIndex={quantum ? 0 : -1}
              className={`archetype-card panel-l1 quantum-archetype${quantum ? ' active' : ''}`}
              disabled={busy}
              onClick={() => {
                setArchetype(QUANTUM_ARCHETYPE);
                  setTargetEngine('godot');
                setCreationMode('assisted');
              }}
            >
              <strong>Quantum simulation roguelite</strong>
              <span>
                Explore a connected sci-fi mine, reshape simulated terrain and stabilize the
                cascade.
              </span>
              <span>Local playable preview • Godot</span>
            </button>
          </div>

          {creationMode !== 'manual' && <label className="create-field">Game engine
            <Select aria-label="Game engine" value={targetEngine} disabled={busy} onChange={event=>setTargetEngine(event.target.value as 'godot'|'unity'|'unreal')}>
              <option value="godot">Godot</option>
              <option value="unity" disabled={archetype!=='SIDE_VIEW_METROIDVANIA'}>Unity — source project</option>
              <option value="unreal" disabled={archetype!=='SIDE_VIEW_METROIDVANIA'}>Unreal — source project</option>
            </Select>
            <span className="hint">{archetype!=='SIDE_VIEW_METROIDVANIA'?'This game type currently uses Godot.':targetEngine==='godot'?'Create a Godot game for local preview.':'Creates a native engine source project. Compilation, gameplay tests and packaging still need engine-specific validation.'}</span>
          </label>}
          {archetype === 'SIDE_VIEW_METROIDVANIA' && creationMode !== 'manual' && (
            <label className="create-field">
              World layout
              <Select
                aria-label="World layout"
                value={worldLayout}
                disabled={busy}
                onChange={(event) => {
                  const choice = event.target.value as
                    'procedural' | 'stormglass-gallery' | 'stormglass-expanded-region' | 'stormglass-archive-wing';
                  setWorldLayout(choice);
                  if (choice !== 'procedural') {
                    setProfile('MEDIUM');
                    if (title === 'Untitled Forge') setTitle('Stormglass Reliquary');
                    if (!prompt.trim())
                      setPrompt(
                        'Explore the Stormglass Reliquary, a drowned cliff monastery with connected galleries, archive backrooms and service stairs. Recover Dash, Double Jump, Wall Slide, Wall Jump, Ground Slam and Air Dash to restore its weather seals.',
                      );
                  }
                }}
              >
                <option value="procedural">Procedural world</option>
                <option value="stormglass-gallery">Stormglass Gallery — 43 rooms</option>
                <option value="stormglass-archive-wing">Stormglass Archive Wing — 48 rooms (candidate)</option>
                <option value="stormglass-expanded-region">
                  Stormglass Castle — 46 rooms (preview)
                </option>
              </Select>
              {stormglassGallery && (
                <span className="hint">
                  {worldLayout === 'stormglass-expanded-region' || worldLayout === 'stormglass-archive-wing'
                    ? 'Long galleries, deep stairs and an upstairs return route. Layout preview; full traversal and artwork review are still in progress.'
                    : 'Connected galleries, service stairs and archive backrooms.'}{' '}
                  Six movement abilities and four bosses. {targetEngine === 'godot' ? 'Godot campaign.' : 'Native source campaign; engine traversal remains unverified.'}
                </span>
              )}
            </label>
          )}

          <label className="create-field">
            Project title
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              aria-invalid={!!titleError}
              aria-describedby={titleError ? 'create-title-error' : undefined}
            />
          </label>
          {titleError && (
            <p className="result error" id="create-title-error">
              {titleError}
            </p>
          )}

          <label className="create-field">
            Game description
            <TextArea
              className="resize-none"
              aria-label="Game description"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                quantum
                  ? 'A Quantum Diver enters the Probability Mines to stabilize its anchors and escape the cascade…'
                  : 'A rain-soaked fortress of hanging gardens, where a lost smith hunts an echo stolen by the deep…'
              }
              rows={4}
              maxLength={quantum ? 4000 : undefined}
              style={{ resize: 'none' }}
              disabled={busy}
            />
          </label>

          <div className="row create-options">
            <label className="create-field">
              Profile
              <Select
                aria-label="Profile"
                value={quantum ? 'TINY_TEST' : profile}
                onChange={(e) => setProfile(e.target.value)}
                disabled={busy || quantum || stormglassGallery}
              >
                {(quantum ? ['TINY_TEST'] : GENERATION_PROFILES).map((id) => (
                  <option key={id} value={id}>
                    {quantum
                      ? 'Probability Mines preview'
                      : stormglassGallery && id === 'MEDIUM'
                        ? 'Stormglass campaign'
                        : id.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </label>
            <label className="create-field">
              Mode
              <Select
                aria-label="Mode"
                value={quantum ? 'LOCAL_ONLY' : mode}
                onChange={(e) => setMode(e.target.value)}
                disabled={busy || quantum}
              >
                {(quantum ? ['LOCAL_ONLY'] : GENERATION_MODES).map((id) => (
                  <option key={id} value={id}>
                    {quantum ? 'Local generation' : id.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </label>
            <label className="create-field create-seed">
              Seed
              <Input
                type="number"
                value={seed}
                min={quantum ? 0 : -2147483648}
                max={2147483647}
                step={1}
                onChange={(e) => setSeed(e.target.value)}
                disabled={busy}
                aria-label="Seed"
                aria-invalid={!!seedError}
                aria-describedby={seedError ? 'create-seed-error' : undefined}
              />
            </label>
          </div>
          {seedError && (
            <p className="result error" id="create-seed-error">
              {seedError}
            </p>
          )}

          <p className="hint">
            {quantum
              ? 'Creates a playable Probability Mines preview with matching artwork and seeded terrain. Local generation only; run progress resets when closed.'
              : creationMode === 'manual'
                ? 'Manual builds a playable TINY_TEST Godot project from the template — no LLM. You can still run Full AI later on this project.'
                : 'Your description guides generation. Progress appears as each stage runs; created projects stay available for review.'}
          </p>

          <div className="row create-actions">
            <Button
              variant="primary"
              className="create-primary"
              disabled={
                busy ||
                bridgeReady !== true ||
                parsedSeed === null ||
                !!titleError ||
                ((quantum || creationMode !== 'manual') && !prompt.trim())
              }
              aria-busy={busy}
              onClick={!quantum && creationMode === 'manual' ? handleScaffold : handleGenerate}
            >
              {scaffolding
                ? 'Forging template…'
                : generating
                  ? 'Generating…'
                  : quantum
                    ? 'Create Quantum preview'
                    : creationMode === 'manual'
                      ? 'Create from template'
                      : 'Generate Game'}
            </Button>
            {!quantum && creationMode === 'manual' && (
              <Button
                disabled={
                  !prompt.trim() ||
                  busy ||
                  bridgeReady !== true ||
                  parsedSeed === null ||
                  !!titleError
                }
                onClick={handleGenerate}
              >
                Generate with AI instead
              </Button>
            )}
            {bridgeReady !== true && <Badge tone="warning">Bridge unavailable</Badge>}
          </div>
        </Panel>

        <Panel
          level={1}
          className="create-progress"
          title="Progress"
          actions={
            livePhases.length > 0 ? (
              <Badge tone={generating ? 'accent' : resultStatus.tone}>
                {generating ? 'Running' : resultStatus.label}
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
          actions={<Badge tone={resultStatus.tone}>{resultStatus.label}</Badge>}
        >
          {result.success ? (
            <>
              <p>
                Game created at: <code className="mono">{result.outputPath}</code>
              </p>
              {result.exportPath && (
                <p>
                  Windows game: <code className="mono">{result.exportPath}/game.exe</code>
                </p>
              )}
              {result.validationPassed === false && (
                <p className="result error" role="status">
                  {result.errors?.length
                    ? 'Game files were created, but tests failed. Review the errors before treating this game as ready.'
                    : 'Game files were created. Gameplay tests still need to run before this game is verified.'}
                </p>
              )}
              {!!result.errors?.length && (
                <p className="result error" role="alert">
                  {result.errors.join('; ')}
                </p>
              )}
              {resultEngine !== 'godot' && <p className="hint">Native source created. Gameplay and packaged-player validation remain pending.</p>}
              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                <Button variant="primary" onClick={() => navigate('Studio')}>
                  Open Generation Studio
                </Button>
                <Button onClick={() => navigate('Dashboard')}>Project Dashboard</Button>
                {resultEngine === 'godot' && <Button
                  variant="primary"
                  onClick={async () => {
                    setGodotActionError(null);
                    if (result.outputPath) {
                      setGodotActionError(await openProjectInGodot(result.outputPath));
                    }
                  }}
                >
                  Open in Godot
                </Button>}
                {resultEngine !== 'unreal' && <Button
                  onClick={async () => {
                    setGodotActionError(null);
                    if (result.outputPath) {
                      setGodotActionError(await playGeneratedProject(result.outputPath));
                    }
                  }}
                >
                  {resultEngine === 'unity' ? 'Preview in Unity' : 'Play'}
                </Button>}
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
