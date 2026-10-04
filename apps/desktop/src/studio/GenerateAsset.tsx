import { registeredAssetId } from './asset-identity.js';
import { useEffect, useRef, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import { GENERATION_MODES } from './generation-options.js';
import { Button, Input, Select, TextArea } from './ui/index.js';
import type { GenerateAssetResponse, GenerateAssetVariantResult } from './metroforge-api.js';

const ASSET_TYPES = [
  ['character_concept', 'Character concept'], ['player_sprite', 'Player'], ['enemy', 'Enemy'],
  ['boss', 'Boss'], ['npc', 'NPC'], ['portrait', 'Portrait'], ['weapon', 'Weapon'], ['item', 'Item'],
  ['prop', 'Prop'], ['tileset', 'Tileset source'], ['tile', 'Tile'], ['background', 'Background'],
  ['ui_icon', 'UI icon'], ['ui_panel', 'UI panel'], ['vfx_texture', 'Effect texture'],
] as const;

function variantsFrom(response: GenerateAssetResponse): GenerateAssetVariantResult[] {
  return response.variants?.length ? response.variants : [response];
}

export function GenerateAssetScreen() {
  const { selectedPath, hasActiveProject } = useStudio();
  return <section className="workspace-screen generate-asset-screen">
    <ScreenHeader eyebrow="Library" title="Asset workshop"
      description="Create artwork in your game's style. Compare alternatives, inspect usage, and restore previous versions." />
    <NoProjectHint />
    {hasActiveProject && <GenerateAssetWorkspace key={selectedPath} projectPath={selectedPath} />}
  </section>;
}

function GenerateAssetWorkspace({ projectPath }: { projectPath: string }) {
  const { generatorPrefill, selectedProject, openRoom } = useStudio();
  const [description, setDescription] = useState("An ancient obsidian sword with glowing violet runes, matching this project's art style.");
  const [assetType, setAssetType] = useState('weapon');
  const [mode, setMode] = useState('HYBRID_FREE');
  const [seed, setSeed] = useState('42');
  const [variants, setVariants] = useState(1);
  const [busy, setBusy] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [results, setResults] = useState<GenerateAssetVariantResult[]>([]);
  const [selected, setSelected] = useState<{ id: string; path: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Array<{ version: number; timestamp: string; provider?: string }>>([]);
  const [usages, setUsages] = useState<Array<{ type: string; id: string; detail?: string }>>([]);
  const mounted = useRef(true);
  const action = useRef(false);
  const inspection = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; inspection.current++; }; }, []);

  const inspectAsset = async (assetPath: string, assetId?: string) => {
    const token = ++inspection.current;
    const current = () => mounted.current && inspection.current === token;
    setInspecting(true);
    try {
      if (!window.metroforge?.listAssets) throw new Error('Desktop connection unavailable. Reopen the app and retry.');
      const assets = await window.metroforge.listAssets(projectPath);
      const id = registeredAssetId(assetPath, assets);
      if (!id || (assetId && id !== assetId)) throw new Error('Artwork is not registered in this project. Refresh the library before replacing it.');
      const [preview, versions, used] = await Promise.all([
        window.metroforge.getAssetPreview(projectPath, assetPath),
        window.metroforge.getAssetHistory(projectPath, id), window.metroforge.getAssetUsages(projectPath, id),
      ]);
      if (!current()) return;
      setSelected({ id, path: assetPath }); setPreviewUrl(preview?.dataUrl ?? null);
      setHistory(versions ?? []); setUsages(used?.usedIn ?? []);
    } catch (err) {
      if (current()) { setSelected(null); setPreviewUrl(null); setHistory([]); setUsages([]); setError(err instanceof Error ? err.message : String(err)); }
    } finally { if (current()) setInspecting(false); }
  };

  useEffect(() => {
    if (!generatorPrefill) return;
    if (generatorPrefill.description) setDescription(generatorPrefill.description);
    if (generatorPrefill.assetType && ASSET_TYPES.some(([id]) => id === generatorPrefill.assetType)) setAssetType(generatorPrefill.assetType);
    if (generatorPrefill.assetId) {
      const token = ++inspection.current;
      setInspecting(true);
      void (async () => {
        try {
          const assets = await window.metroforge?.listAssets(projectPath);
          if (!mounted.current || inspection.current !== token) return;
          const found = assets?.find(a => a.id === generatorPrefill.assetId);
          if (!found?.path) throw new Error('Selected artwork is not registered in this project.');
          await inspectAsset(found.path, found.id);
        } catch (err) { if (mounted.current && inspection.current === token) setError(err instanceof Error ? err.message : String(err)); }
        finally { if (mounted.current && inspection.current === token) setInspecting(false); }
      })();
    }
  }, [generatorPrefill, projectPath]);

  const handleGenerate = async (replace = false) => {
    if (action.current || inspecting) return;
    setError('');
    const parsedSeed = seed.trim() === '' ? undefined : Number(seed);
    if (parsedSeed !== undefined && (!Number.isSafeInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 2147483647)) {
      setError('Seed must be a whole number from 0 to 2147483647, or leave it blank for a random seed.'); return;
    }
    if (!description.trim()) { setError('Describe the artwork you want to create.'); return; }
    if (!window.metroforge?.generateAsset) { setError('Desktop connection unavailable. Reopen the app and retry.'); return; }
    if (replace && (!selected || !window.confirm(`Replace ${selected.id}? Your current artwork is saved in version history.`))) return;
    action.current = true; setBusy(true); setStatus(replace ? 'Replacing artwork…' : 'Generating alternatives…');
    try {
      const response = await window.metroforge.generateAsset({ projectPath, description, assetType,
        generationMode: mode, variants: replace ? 1 : variants, assetId: replace ? selected!.id : undefined,
        operation: replace ? 'replace' : 'create', seed: parsedSeed });
      if (!mounted.current) return;
      const list = variantsFrom(response); setResults(list);
      const successful = list.filter(v => v.success && v.asset);
      setStatus(`${successful.length} of ${list.length} ${replace ? 'replacement' : 'alternatives'} saved to this project.`);
      const failed = list.filter(v => !v.success).flatMap(v => v.errors ?? ['Artwork generation failed.']);
      if (failed.length) setError(failed.join(' '));
      if (successful[0]?.asset) await inspectAsset(successful[0].asset.path, successful[0].asset.id);
    } catch (err) { if (mounted.current) { setError(err instanceof Error ? err.message : String(err)); setStatus('Request failed. Your prompt is ready to retry.'); } }
    finally { action.current = false; if (mounted.current) setBusy(false); }
  };

  const restoreVersion = async (version: number) => {
    if (action.current || inspecting || !selected) return;
    action.current = true; setBusy(true); setError(''); setStatus('Restoring artwork…');
    try {
      if (!window.metroforge?.restoreAssetVersion) throw new Error('Desktop connection unavailable');
      const result = await window.metroforge.restoreAssetVersion(projectPath, selected.id, version);
      if (!mounted.current) return;
      if (!result.success) throw new Error(result.error ?? 'Artwork could not be restored');
      await inspectAsset(selected.path, selected.id);
      if (mounted.current) setStatus('Artwork restored. Restart and validate any open game preview.');
    } catch (err) { if (mounted.current) { setError(err instanceof Error ? err.message : String(err)); setStatus('Restore failed. You can retry.'); } }
    finally { action.current = false; if (mounted.current) setBusy(false); }
  };

  return <div className="generate-asset-layout">
    <div className="panel form-stack">
      <h3>Art direction</h3><ProjectSelect />
      <p className="hint">{selectedProject?.title ?? selectedProject?.slug} · {selectedProject?.archetype?.replace(/_/g, ' ').toLowerCase() ?? 'project style'}.
        Artwork stays in this project's asset set. Switching projects clears this selection.</p>
      <label><span id="asset-prompt-label">Prompt</span><TextArea className="resize-none" aria-labelledby="asset-prompt-label" rows={5} maxLength={8000} disabled={busy} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <div className="row">
        <label><span id="asset-type-label">Asset type</span><Select aria-labelledby="asset-type-label" value={assetType} disabled={busy} onChange={e => setAssetType(e.target.value)}>{ASSET_TYPES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
        <label><span id="asset-mode-label">Provider mode</span><Select aria-labelledby="asset-mode-label" value={mode} disabled={busy} onChange={e => setMode(e.target.value)}>{GENERATION_MODES.map(id => <option key={id} value={id}>{id.replace(/_/g, ' ')}</option>)}</Select></label>
      </div>
      <div className="row">
        <label><span id="asset-alternatives-label">Alternatives</span><Select aria-labelledby="asset-alternatives-label" value={variants} disabled={busy} onChange={e => setVariants(Number(e.target.value))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</Select></label>
        <label><span id="asset-seed-label">Seed</span><Input aria-labelledby="asset-seed-label" type="number" min={0} max={2147483647} step={1} disabled={busy} value={seed} placeholder="Random" onChange={e => setSeed(e.target.value)} /></label>
      </div>
      <div className="row">
        <Button variant="primary" aria-busy={busy} disabled={busy || inspecting || !description.trim()} onClick={() => void handleGenerate()}>{variants > 1 ? `Generate ${variants} alternatives` : 'Generate alternative'}</Button>
        <Button disabled={busy || inspecting || !selected || !description.trim()} onClick={() => void handleGenerate(true)}>Replace selected</Button>
      </div>
      <p className="hint">Alternatives create new assets. Replace updates one registered image and saves its previous version. Animation sheets need the animation workflow.</p>
      {status && <p role="status">{status}</p>}{error && <p className="result error" role="alert">{error}</p>}
    </div>
    <div className="panel form-stack">
      <h3>Alternatives</h3>
      {results.length === 0 && <p className="hint">Describe your next asset, then generate an alternative to preview it here.</p>}
      {results.map((result, index) => <div key={`${result.asset?.id ?? 'failed'}-${index}`} className={result.success ? 'result success' : 'result error'}>
        <p>Alternative {index + 1} · {result.success ? result.asset?.provider ?? 'Saved' : 'Failed'}</p>
        {result.success && result.asset && <Button aria-pressed={selected?.id === result.asset.id} disabled={busy || inspecting} onClick={() => void inspectAsset(result.asset!.path, result.asset!.id)}>Inspect alternative {index + 1}</Button>}
        {!result.success && <p>{result.errors?.join(' ') ?? 'No image was saved.'}</p>}
        {result.warnings?.map((warning, n) => <p key={n} className="hint">{warning}</p>)}
      </div>)}
      {inspecting && <p role="status">Loading artwork…</p>}
      {previewUrl && <img className="detail-preview" src={previewUrl} alt={`Selected artwork: ${selected?.id ?? 'asset'}`} />}
    </div>
    <aside className="panel form-stack">
      <h3>Selected artwork</h3>
      <dl className="settings-dl"><dt>Asset</dt><dd>{selected?.id ?? 'Select an alternative'}</dd><dt>Where used</dt><dd>
        {usages.length ? usages.map(u => u.type.toLowerCase().includes('room') ? <Button key={`${u.type}-${u.id}`} variant="ghost" onClick={() => openRoom(u.id)}>{u.detail ?? u.id}</Button> : <span key={`${u.type}-${u.id}`}>{u.detail ?? u.id} </span>) : selected ? 'No references reported' : '—'}
      </dd><dt>Version history</dt><dd>{history.length === 0 && (selected ? 'No earlier versions yet' : 'Select artwork to view its history')}
        {history.map(h => <div key={h.version} className="row"><span>Version {h.version} · {new Date(h.timestamp).toLocaleString()}</span><Button size="sm" disabled={busy || inspecting} onClick={() => void restoreVersion(h.version)}>Restore version {h.version}</Button></div>)}
      </dd></dl>
    </aside>
  </div>;
}
