import { useEffect, useState } from 'react';
import { ScreenHeader } from './ScreenHeader.js';
import { ProjectSelect } from './ProjectSelect.js';
import { NoProjectHint } from './NoProjectHint.js';
import { useStudio } from './StudioContext.js';
import { GENERATION_MODES } from './generation-options.js';

const ASSET_TYPES = [
  'character_concept',
  'player_sprite',
  'enemy',
  'boss',
  'npc',
  'portrait',
  'weapon',
  'item',
  'prop',
  'tileset',
  'tile',
  'background',
  'ui_icon',
  'ui_panel',
  'vfx_texture',
] as const;

type VariantResult = {
  success: boolean;
  assetPath?: string;
  provider?: string;
  fallbackGenerated?: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
  errors?: string[];
};

export function GenerateAssetScreen() {
  const { selectedPath, hasActiveProject, generatorPrefill, openRoom } = useStudio();
  const [description, setDescription] = useState(
    "Create an ancient obsidian sword with glowing violet runes matching this project's art style.",
  );
  const [assetType, setAssetType] = useState('weapon');
  const [mode, setMode] = useState('HYBRID_FREE');
  const [seed, setSeed] = useState('42');
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState(1);
  const [variantResults, setVariantResults] = useState<VariantResult[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{ version: number; timestamp: string; prompt?: string; provider?: string; backupPath?: string }>
  >([]);
  const [usages, setUsages] = useState<Array<{ type: string; id: string; detail?: string }>>([]);

  useEffect(() => {
    if (!generatorPrefill) return;
    if (generatorPrefill.description) setDescription(generatorPrefill.description);
    if (generatorPrefill.assetType) setAssetType(generatorPrefill.assetType);
    if (generatorPrefill.assetId) setSelectedAssetId(generatorPrefill.assetId);
  }, [generatorPrefill]);

  const inspectAsset = async (assetPath: string) => {
    if (!selectedPath) return;
    const id = assetPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? assetPath;
    setSelectedAssetId(id);
    const preview = await window.metroforge?.getAssetPreview?.(selectedPath, assetPath);
    setPreviewUrl(preview?.dataUrl ?? null);
    const hist = await window.metroforge?.getAssetHistory?.(selectedPath, id);
    setHistory(hist ?? []);
    const used = await window.metroforge?.getAssetUsages?.(selectedPath, id);
    setUsages(used?.usedIn ?? []);
  };

  const handleGenerate = async (replaceId?: string) => {
    if (!selectedPath || !description.trim() || !window.metroforge?.generateAsset) return;
    setGenerating(true);
    setVariantResults([]);
    const response = await window.metroforge.generateAsset({
      projectPath: selectedPath,
      description,
      assetType,
      generationMode: mode,
      variants,
      assetId: replaceId ?? undefined,
      seed: Number.isFinite(parseInt(seed, 10)) ? parseInt(seed, 10) : undefined,
    });
    setGenerating(false);
    if ('variants' in response && Array.isArray(response.variants)) {
      const list = response.variants.map((v) => ({
        success: v.success,
        assetPath: v.asset?.path,
        provider: v.asset?.provider,
      }));
      setVariantResults(list);
      const first = list.find((v) => v.assetPath);
      if (first?.assetPath) await inspectAsset(first.assetPath);
    } else {
      const single: VariantResult = {
        success: response.success,
        assetPath: response.asset?.path,
        provider: response.asset?.provider,
        fallbackGenerated: response.asset?.fallbackGenerated,
        critiquePassed: response.asset?.critiquePassed,
        critiqueScore: response.asset?.critiqueScore,
        errors: response.errors,
      };
      setVariantResults([single]);
      if (single.assetPath) await inspectAsset(single.assetPath);
    }
  };

  const restoreVersion = async (version: number) => {
    if (!selectedPath || !selectedAssetId) return;
    const result = await window.metroforge?.restoreAssetVersion?.(selectedPath, selectedAssetId, version);
    if (!result?.success) return;
    const list = await window.metroforge?.listAssets?.(selectedPath);
    const found = list?.find((asset) => asset.id === selectedAssetId);
    if (found?.path) await inspectAsset(found.path);
  };

  return (
    <section>
      <ScreenHeader
        eyebrow="Library"
        title="Manual Asset Generator"
        description="Calls the same Asset Foundry pipeline as full generation. Variants, regenerate, and replace use generateAsset — not a separate frontend image model."
      />
      <NoProjectHint />
      {hasActiveProject && (
      <div className="generate-asset-layout">
        <div className="panel form-stack">
          <h3>Request</h3>
          <ProjectSelect />
          <label>
            Prompt
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Create an ancient obsidian sword with glowing violet runes matching this project's art style."
            />
          </label>
          <div className="row">
            <label>
              Asset type
              <select value={assetType} onChange={(e) => setAssetType(e.target.value)}>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Provider mode
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {GENERATION_MODES.map((id) => (
                  <option key={id} value={id}>
                    {id.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label>
              Variants
              <select value={variants} onChange={(e) => setVariants(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>
            <label>
              Seed
              <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <button
              className="primary"
              type="button"
              disabled={generating || !description.trim() || !selectedPath}
              onClick={() => handleGenerate()}
            >
              {generating ? 'Generating…' : variants > 1 ? `Generate ${variants} variants` : 'Generate'}
            </button>
            <button
              type="button"
              disabled={generating || !description.trim() || !selectedPath}
              onClick={() => handleGenerate()}
            >
              Regenerate
            </button>
            <button
              type="button"
              disabled={generating || !selectedAssetId || !selectedPath}
              onClick={() => handleGenerate(selectedAssetId ?? undefined)}
            >
              Replace
            </button>
          </div>
        </div>

        <div className="panel">
          <h3>Pipeline results</h3>
          {variantResults.length === 0 && !generating && (
            <p className="hint">Run generate to see real Asset Foundry variants here.</p>
          )}
          {generating && <p className="hint">Running generateAsset…</p>}
          {variantResults.map((v, i) => (
            <p key={i} className={v.success ? 'result success' : 'result error'}>
              Variant {i + 1}: {v.success ? v.assetPath : v.errors?.join('; ') ?? 'failed'}
              {v.provider ? ` · ${v.provider}` : ''}
              {v.fallbackGenerated ? ' · fallback' : ''}
              {typeof v.critiqueScore === 'number' ? ` · QA ${v.critiqueScore}` : ''}
            </p>
          ))}
          {previewUrl && (
            <img className="detail-preview" src={previewUrl} alt={selectedAssetId ?? 'asset'} />
          )}
        </div>

        <aside className="panel">
          <h3>Inspector</h3>
          <dl className="settings-dl">
            <dt>Asset id</dt>
            <dd>{selectedAssetId ?? '—'}</dd>
            <dt>Where used</dt>
            <dd>
              {usages.length
                ? usages.map((u) => (
                    <button
                      key={`${u.type}-${u.id}`}
                      type="button"
                      className="tab"
                      onClick={() => {
                        if (u.type.toLowerCase().includes('room')) openRoom(u.id);
                      }}
                    >
                      {u.type}:{u.id}
                    </button>
                  ))
                : 'not referenced yet'}
            </dd>
            <dt>History</dt>
            <dd>
              {history.length === 0 && 'No versions yet'}
              {history.map((h) => (
                <div key={h.version} className="row">
                  <span>
                    v{h.version} · {new Date(h.timestamp).toLocaleString()} · {h.provider ?? 'unknown'}
                  </span>
                  <button type="button" className="tab" onClick={() => restoreVersion(h.version)}>
                    Restore
                  </button>
                </div>
              ))}
            </dd>
          </dl>
        </aside>
      </div>
      )}
    </section>
  );
}
