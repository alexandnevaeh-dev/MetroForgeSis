import { useEffect, useState } from 'react';
import type { StudioProject } from './types';

const ASSET_TYPES = [
  'weapon',
  'enemy',
  'boss',
  'item',
  'prop',
  'player_sprite',
  'tileset',
  'ui_icon',
];

export function GenerateAssetScreen() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [description, setDescription] = useState('');
  const [assetType, setAssetType] = useState('weapon');
  const [mode, setMode] = useState('HYBRID_FREE');
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState(1);
  const [variantResults, setVariantResults] = useState<Array<{ success: boolean; assetPath?: string }>>(
    [],
  );

  useEffect(() => {
    window.metroforge?.listProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) setSelectedPath((p) => p || list[0]!.path);
    });
  }, []);

  const handleGenerate = async () => {
    if (!selectedPath || !description.trim() || !window.metroforge?.generateAsset) return;
    setGenerating(true);
    setVariantResults([]);
    const response = await window.metroforge.generateAsset({
      projectPath: selectedPath,
      description,
      assetType,
      generationMode: mode,
      variants,
    });
    setGenerating(false);
    if ('variants' in response && Array.isArray((response as { variants: unknown[] }).variants)) {
      const list = (response as { variants: Array<{ success: boolean; asset?: { path: string } }> }).variants;
      setVariantResults(
        list.map((v) => ({ success: v.success, assetPath: v.asset?.path })),
      );
    } else {
      const single = response as { success: boolean; asset?: { path: string }; errors?: string[] };
      setVariantResults([
        {
          success: single.success,
          assetPath: single.asset?.path,
        },
      ]);
    }
  };

  return (
    <section>
      <h2>Generate Asset</h2>
      <p className="hint">
        Manual generation uses the same Asset Foundry pipeline as full game generation, with project art context.
      </p>
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
      <label>
        Asset Description
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Create a cracked obsidian sword with glowing violet runes for the player"
        />
      </label>
      <div className="row">
        <label>
          Asset Type
          <select value={assetType} onChange={(e) => setAssetType(e.target.value)}>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Provider Mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="LOCAL_ONLY">Local Only</option>
            <option value="HYBRID_FREE">Hybrid Free</option>
            <option value="FREE_ONLY">Free Only</option>
          </select>
        </label>
        <label>
          Variants
          <select value={variants} onChange={(e) => setVariants(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
      </div>
      <button
        className="primary"
        type="button"
        disabled={generating || !description.trim() || !selectedPath}
        onClick={handleGenerate}
      >
        {generating ? 'Generating…' : variants > 1 ? `Generate ${variants} Variants` : 'Generate Game Asset'}
      </button>
      {variantResults.length > 0 && (
        <div className="variant-grid">
          {variantResults.map((v, i) => (
            <p key={i} className={v.success ? 'result success' : 'result error'}>
              Variant {i + 1}: {v.success ? v.assetPath : 'failed'}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
