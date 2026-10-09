import { registeredAssetId } from './asset-identity.js';
import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import { GENERATION_MODES } from './generation-options.js';
import { Button, Input, Select, TextArea } from './ui/index.js';
import type { GenerateAssetResponse, GenerateAssetVariantResult } from './metroforge-api.js';
import {LocalImageModelPreparation} from './LocalImageModelPreparation.js';

const ASSET_TYPES = [
  ['character_concept', 'Character concept'],
  ['player_sprite', 'Player'],
  ['enemy', 'Enemy'],
  ['boss', 'Boss'],
  ['npc', 'NPC'],
  ['portrait', 'Portrait'],
  ['weapon', 'Weapon'],
  ['item', 'Item'],
  ['prop', 'Prop'],
  ['tileset', 'Tileset source'],
  ['tile', 'Tile'],
  ['background', 'Background'],
  ['ui_icon', 'UI icon'],
  ['ui_panel', 'UI panel'],
  ['vfx_texture', 'Effect texture'],
] as const;

function variantsFrom(response: GenerateAssetResponse): GenerateAssetVariantResult[] {
  return response.variants?.length ? response.variants : [response];
}

export function GenerateAssetScreen() {
  const { selectedPath, hasActiveProject } = useStudio();
  return (
    <section className="workspace-screen generate-asset-screen">
      <ScreenHeader
        eyebrow="Library"
        title="Asset workshop"
        description="Create artwork in your game's style. Compare alternatives, inspect usage, and restore previous versions."
      />
      <NoProjectHint />
      {hasActiveProject && <GenerateAssetWorkspace key={selectedPath} projectPath={selectedPath} />}
    </section>
  );
}

function GenerateAssetWorkspace({ projectPath }: { projectPath: string }) {
  const { generatorPrefill, selectedProject, openRoom } = useStudio();
  const [description, setDescription] = useState(
    "An ancient obsidian sword with glowing violet runes, matching this project's art style.",
  );
  const [assetType, setAssetType] = useState('weapon');
  const [styleDirection, setStyleDirection] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [styleLoading, setStyleLoading] = useState(true);
  const [styleError, setStyleError] = useState('');
  const styleRead = useRef(0);
  const artDirectionPrefill = useRef<{styleDirection: string; negativePrompt: string} | undefined>(undefined);
  const [mode, setMode] = useState('HYBRID_FREE');
  const [seed, setSeed] = useState('42');
  const [variants, setVariants] = useState(1);
  const [backgroundDetail, setBackgroundDetail] = useState<'standard' | 'detailed'>('standard');
  const [busy, setBusy] = useState(false);
  const [modelPreparing, setModelPreparing] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [results, setResults] = useState<GenerateAssetVariantResult[]>([]);
  const [selected, setSelected] = useState<{ id: string; path: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<
    Array<{ version: number; timestamp: string; provider?: string }>
  >([]);
  const [usages, setUsages] = useState<Array<{ type: string; id: string; detail?: string }>>([]);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [usageUnavailable, setUsageUnavailable] = useState(false);
  const mounted = useRef(true);
  const action = useRef(false);
  const inspection = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inspection.current++;
    };
  }, []);

  const loadStyleDirection = async () => {
    const token = ++styleRead.current;
    setStyleLoading(true);
    setStyleError('');
    try {
      if (!window.metroforge?.getManualArtDirection) throw new Error('Desktop connection unavailable. Reopen the app and retry.');
      const brief = await window.metroforge.getManualArtDirection(projectPath);
      if (!mounted.current || styleRead.current !== token) return;
      if (typeof brief?.styleDirection !== 'string' || !brief.styleDirection.trim() || typeof brief.negativePrompt !== 'string') throw new Error('Project art direction is invalid. Check its style bible and retry.');
      const direction = artDirectionPrefill.current ?? brief;
      setStyleDirection(direction.styleDirection);
      setNegativePrompt(direction.negativePrompt);
    } catch (err) {
      if (mounted.current && styleRead.current === token) setStyleError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current && styleRead.current === token) setStyleLoading(false);
    }
  };
  useEffect(() => {void loadStyleDirection(); return () => {styleRead.current++;};}, [projectPath]);

  const inspectAsset = async (assetPath: string, assetId?: string) => {
    const token = ++inspection.current;
    const current = () => mounted.current && inspection.current === token;
    setInspecting(true);
    try {
      if (!window.metroforge?.listAssets)
        throw new Error('Desktop connection unavailable. Reopen the app and retry.');
      const assets = await window.metroforge.listAssets(projectPath);
      const id = registeredAssetId(assetPath, assets);
      if (!id || (assetId && id !== assetId))
        throw new Error(
          'Artwork is not registered in this project. Refresh the library before replacing it.',
        );
      const [preview, versions, used] = await Promise.all([
        window.metroforge.getAssetPreview(projectPath, assetPath),
        window.metroforge
          .getAssetHistory(projectPath, id)
          .then((records) => ({ records, unavailable: false }))
          .catch(() => ({ records: [], unavailable: true })),
        window.metroforge
          .getAssetUsages(projectPath, id)
          .then((result) => ({ usedIn: result?.usedIn ?? [], unavailable: false }))
          .catch(() => ({ usedIn: [], unavailable: true })),
      ]);
      if (!current()) return;
      setSelected({ id, path: assetPath });
      setPreviewUrl(preview?.dataUrl ?? null);
      setHistory(versions.records ?? []);
      setUsages(used.usedIn);
      setHistoryUnavailable(versions.unavailable);
      setUsageUnavailable(used.unavailable);
    } catch (err) {
      if (current()) {
        setSelected(null);
        setPreviewUrl(null);
        setHistory([]);
        setUsages([]);
        setHistoryUnavailable(false);
        setUsageUnavailable(false);
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (current()) setInspecting(false);
    }
  };

  useEffect(() => {
    if (!generatorPrefill) return;
    if (typeof generatorPrefill.styleDirection === 'string' && generatorPrefill.styleDirection.trim()) {
      const direction = {styleDirection: generatorPrefill.styleDirection, negativePrompt: generatorPrefill.negativePrompt ?? ''};
      artDirectionPrefill.current = direction;
      setStyleDirection(direction.styleDirection);
      setNegativePrompt(direction.negativePrompt);
    } else if (generatorPrefill.assetId) {
      artDirectionPrefill.current = undefined;
      void loadStyleDirection();
    }
    if (generatorPrefill.description) setDescription(generatorPrefill.description);
    if (generatorPrefill.assetType && ASSET_TYPES.some(([id]) => id === generatorPrefill.assetType))
      setAssetType(generatorPrefill.assetType);
    if (generatorPrefill.assetId) {
      const token = ++inspection.current;
      setInspecting(true);
      void (async () => {
        try {
          const assets = await window.metroforge?.listAssets(projectPath);
          if (!mounted.current || inspection.current !== token) return;
          const found = assets?.find((a) => a.id === generatorPrefill.assetId);
          if (!found?.path) throw new Error('Selected artwork is not registered in this project.');
          await inspectAsset(found.path, found.id);
        } catch (err) {
          if (mounted.current && inspection.current === token)
            setError(err instanceof Error ? err.message : String(err));
        } finally {
          if (mounted.current && inspection.current === token) setInspecting(false);
        }
      })();
    }
  }, [generatorPrefill, projectPath]);

  const handleGenerate = async (replace = false) => {
    if (action.current || inspecting || styleLoading || styleError || !styleDirection.trim()) return;
    setError('');
    const parsedSeed = seed.trim() === '' ? undefined : Number(seed);
    if (
      parsedSeed !== undefined &&
      (!Number.isSafeInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 2147483647)
    ) {
      setError(
        'Seed must be a whole number from 0 to 2147483647, or leave it blank for a random seed.',
      );
      return;
    }
    if (!description.trim()) {
      setError('Describe the artwork you want to create.');
      return;
    }
    if (!window.metroforge?.generateAsset) {
      setError('Desktop connection unavailable. Reopen the app and retry.');
      return;
    }
    if (
      replace &&
      (!selected ||
        !window.confirm(
          `Replace ${selected.id}? Your current artwork is saved in version history.`,
        ))
    )
      return;
    action.current = true;
    setBusy(true);
    setStatus(replace ? 'Replacing artwork…' : 'Generating alternatives…');
    try {
      const response = await window.metroforge.generateAsset({
        projectPath,
        description,
        styleDirection,
        negativePrompt,
        assetType,
        generationMode: mode,
        variants: replace ? 1 : variants,
        assetId: replace ? selected!.id : undefined,
        operation: replace ? 'replace' : 'create',
        seed: parsedSeed,
        backgroundDetail: !replace && assetType === 'background' ? backgroundDetail : undefined,
      });
      if (!mounted.current) return;
      const list = variantsFrom(response);
      setResults(list);
      const successful = list.filter((v) => v.success && v.asset);
      setStatus(
        `${successful.length} of ${list.length} ${replace ? 'replacement' : 'alternatives'} saved to this project.`,
      );
      const failed = list
        .filter((v) => !v.success)
        .flatMap((v) => v.errors ?? ['Artwork generation failed.']);
      if (failed.length) setError(failed.join(' '));
      if (successful[0]?.asset)
        await inspectAsset(successful[0].asset.path, successful[0].asset.id);
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('Request failed. Your prompt is ready to retry.');
      }
    } finally {
      action.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const restoreVersion = async (version: number) => {
    if (action.current || inspecting || !selected) return;
    action.current = true;
    setBusy(true);
    setError('');
    setStatus('Restoring artwork…');
    try {
      if (!window.metroforge?.restoreAssetVersion)
        throw new Error('Desktop connection unavailable');
      const result = await window.metroforge.restoreAssetVersion(projectPath, selected.id, version);
      if (!mounted.current) return;
      if (!result.success) throw new Error(result.error ?? 'Artwork could not be restored');
      await inspectAsset(selected.path, selected.id);
      if (mounted.current)
        setStatus('Artwork restored. Restart and validate any open game preview.');
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('Restore failed. You can retry.');
      }
    } finally {
      action.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div className="generate-asset-layout">
      <div className="panel form-stack">
        <h3>Art direction</h3>
        <ProjectSelect />
        <p className="hint">
          {selectedProject?.title ?? selectedProject?.slug} ·{' '}
          {selectedProject?.archetype?.replace(/_/g, ' ').toLowerCase() ?? 'project style'}. Artwork
          stays in this project's asset set. Switching projects clears this selection.
        </p>
        {mode === 'LOCAL_ONLY' && <LocalImageModelPreparation disabled={busy || inspecting} onBusyChange={setModelPreparing} />}
        <label><span id="asset-style-direction-label">Style direction</span>
          <TextArea aria-labelledby="asset-style-direction-label" rows={2} maxLength={2000}
            disabled={busy || styleLoading} value={styleDirection} onChange={e=>setStyleDirection(e.target.value)} /></label>
        <p className="hint">A concise project style for this artwork. Review or edit it before generating; the camera follows your game's genre.</p>
        <label><span id="asset-negative-prompt-label">Exclude</span>
          <TextArea aria-labelledby="asset-negative-prompt-label" rows={2} maxLength={4000}
            disabled={busy || styleLoading} value={negativePrompt} onChange={e=>setNegativePrompt(e.target.value)} /></label>
        {styleLoading && <p className="hint" role="status">Loading project art direction…</p>}
        {styleError && <div><p className="hint" role="alert">{styleError}</p><Button onClick={()=>void loadStyleDirection()}>Retry art direction</Button></div>}
        <label>
          <span id="asset-prompt-label">Prompt</span>
          <TextArea
            className="resize-none"
            aria-labelledby="asset-prompt-label"
            rows={5}
            maxLength={8000}
            disabled={busy}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="row">
          <label>
            <span id="asset-type-label">Asset type</span>
            <Select
              aria-labelledby="asset-type-label"
              value={assetType}
              disabled={busy}
              onChange={(e) => setAssetType(e.target.value)}
            >
              {ASSET_TYPES.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span id="asset-mode-label">Provider mode</span>
            <Select
              aria-labelledby="asset-mode-label"
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value)}
            >
              {GENERATION_MODES.map((id) => (
                <option key={id} value={id}>
                  {id.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="row">
          <label>
            <span id="asset-alternatives-label">Alternatives</span>
            <Select
              aria-labelledby="asset-alternatives-label"
              value={variants}
              disabled={busy}
              onChange={(e) => setVariants(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span id="asset-seed-label">Seed</span>
            <Input
              aria-labelledby="asset-seed-label"
              type="number"
              min={0}
              max={2147483647}
              step={1}
              disabled={busy}
              value={seed}
              placeholder="Random"
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>
        </div>
        {assetType === 'background' && (
          <label>
            <span id="asset-background-detail-label">Background detail</span>
            <Select
              aria-labelledby="asset-background-detail-label"
              value={backgroundDetail}
              disabled={busy}
              onChange={(e) => setBackgroundDetail(e.target.value as 'standard' | 'detailed')}
            >
              <option value="standard">Standard - 640 × 360</option>
              <option value="detailed">Detailed - 1024 × 576</option>
            </Select>
            <span className="hint">
              New alternatives use this size. Replacements keep the selected image's dimensions.
            </span>
          </label>
        )}
        <div className="row">
          <Button
            variant="primary"
            aria-busy={busy}
            disabled={busy || modelPreparing || inspecting || styleLoading || !!styleError || !styleDirection.trim() || !description.trim()}
            onClick={() => void handleGenerate()}
          >
            {variants > 1 ? `Generate ${variants} alternatives` : 'Generate alternative'}
          </Button>
          <Button
            disabled={busy || modelPreparing || inspecting || styleLoading || !!styleError || !styleDirection.trim() || !selected || !description.trim()}
            onClick={() => void handleGenerate(true)}
          >
            Replace selected
          </Button>
        </div>
        <p className="hint">
          Alternatives create new assets. Replace updates one registered image and saves its
          previous version. Animation sheets need the animation workflow.
        </p>
        {status && <p role="status">{status}</p>}
        {error && (
          <p className="result error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="panel form-stack">
        <h3>Alternatives</h3>
        {results.length === 0 && (
          <p className="hint">
            Describe your next asset, then generate an alternative to preview it here.
          </p>
        )}
        {results.map((result, index) => (
          <div
            key={`${result.asset?.id ?? 'failed'}-${index}`}
            className={!result.success ? 'result error' : result.asset?.productionReady === true ? 'result success' : 'result'}
          >
            <p>
              Alternative {index + 1} ·{' '}
              {result.success ? (result.asset?.provider ?? 'Saved') : 'Failed'}
            </p>
            {result.success && result.asset?.imagePlan && (
              <p className="hint">
                Game image {result.asset.imagePlan.width} × {result.asset.imagePlan.height} · Source
                request {result.asset.imagePlan.sourceWidth} × {result.asset.imagePlan.sourceHeight}{' '}
                · {result.asset.imagePlan.transparent ? 'Transparent' : 'Opaque'} canvas
              </p>
            )}
            {result.success && result.asset?.executionMetadata?.actualDevice && (
              <p className="hint">Generated on {result.asset.executionMetadata.actualDevice}</p>
            )}
            {result.success && (result.asset?.critiquePassed === false || result.asset?.maturity === 'REJECTED') && (
              <p role="status">Automated check rejected this image{result.asset?.critiqueScore !== undefined ? ` (score ${result.asset.critiqueScore})` : ''}. Saved for inspection; review before use.</p>
            )}
            {result.success && result.asset?.critiquePassed !== false && result.asset?.maturity !== 'REJECTED' && result.asset?.productionReady !== true && (
              <p role="status">Draft image saved for review{result.asset?.critiqueScore !== undefined ? ` (automated score ${result.asset.critiqueScore})` : ''}. Verify appearance and animation before game use.</p>
            )}
            {result.success && result.asset && (
              <Button
                aria-pressed={selected?.id === result.asset.id}
                disabled={busy || inspecting}
                onClick={() => void inspectAsset(result.asset!.path, result.asset!.id)}
              >
                Inspect alternative {index + 1}
              </Button>
            )}
            {!result.success && <p>{result.errors?.join(' ') ?? 'No image was saved.'}</p>}
            {result.warnings?.map((warning, n) => (
              <p key={n} className="hint">
                {warning}
              </p>
            ))}
          </div>
        ))}
        {inspecting && <p role="status">Loading artwork…</p>}
        {previewUrl && (
          <img
            className="detail-preview"
            src={previewUrl}
            alt={`Selected artwork: ${selected?.id ?? 'asset'}`}
          />
        )}
      </div>
      <aside className="panel form-stack">
        <h3>Selected artwork</h3>
        <dl className="settings-dl">
          <dt>Asset</dt>
          <dd>{selected?.id ?? 'Select an alternative'}</dd>
          <dt>Where used</dt>
          <dd>
            {usageUnavailable ? (
              <span role="status">
                Usage information unavailable. Artwork can still be inspected.
              </span>
            ) : usages.length ? (
              usages.map((u) =>
                u.type.toLowerCase().includes('room') ? (
                  <Button key={`${u.type}-${u.id}`} variant="ghost" onClick={() => openRoom(u.id)}>
                    {u.detail ?? u.id}
                  </Button>
                ) : (
                  <span key={`${u.type}-${u.id}`}>{u.detail ?? u.id} </span>
                ),
              )
            ) : selected ? (
              'No references reported'
            ) : (
              '—'
            )}
          </dd>
          <dt>Version history</dt>
          <dd>
            {historyUnavailable ? (
              <span role="status">Version history unavailable. Refresh the project and retry.</span>
            ) : (
              history.length === 0 &&
              (selected ? 'No earlier versions yet' : 'Select artwork to view its history')
            )}
            {history.map((h) => (
              <div key={h.version} className="row">
                <span>
                  Version {h.version} · {new Date(h.timestamp).toLocaleString()}
                </span>
                <Button
                  size="sm"
                  disabled={busy || inspecting}
                  onClick={() => void restoreVersion(h.version)}
                >
                  Restore version {h.version}
                </Button>
              </div>
            ))}
          </dd>
        </dl>
      </aside>
    </div>
  );
}
