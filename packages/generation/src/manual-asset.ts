import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AssetPipeline, type GeneratedAsset } from '@metroforge/assets';
import { licenseFieldsForProvider } from '@metroforge/ai';
import { GameDNASchema, type DesignBible, type StyleBible } from '@metroforge/schemas';
import { loadConfig } from '@metroforge/shared';
import { recordAssetVersion } from './asset-history.js';

export type ManualAssetType =
  | 'character_concept'
  | 'player_sprite'
  | 'enemy'
  | 'boss'
  | 'npc'
  | 'portrait'
  | 'weapon'
  | 'item'
  | 'prop'
  | 'tileset'
  | 'tile'
  | 'background'
  | 'ui_icon'
  | 'ui_panel'
  | 'vfx_texture';

export type ManualGenerationMode = 'image_only' | 'game_asset' | 'complete_entity';

export interface ManualAssetRequest {
  projectPath: string;
  description: string;
  assetType: ManualAssetType;
  assetId?: string;
  seed?: number;
  mode?: ManualGenerationMode;
  generationMode?: import('@metroforge/shared').GenerationMode;
  transparentBackground?: boolean;
  commercialSafe?: boolean;
  nvidiaImageModel?: string;
  hardwareProfile?: string;
}

export interface ManualAssetResult {
  success: boolean;
  asset?: GeneratedAsset;
  errors: string[];
  warnings: string[];
}

function inferAssetPath(assetType: ManualAssetType, assetId: string): string {
  switch (assetType) {
    case 'player_sprite':
      return `assets/characters/${assetId}.png`;
    case 'enemy':
      return `assets/enemies/${assetId}.png`;
    case 'boss':
      return `assets/bosses/${assetId}.png`;
    case 'npc':
      return `assets/npcs/${assetId}.png`;
    case 'weapon':
    case 'item':
      return `assets/items/${assetId}.png`;
    case 'tileset':
    case 'tile':
      return `assets/tilesets/${assetId}/source.png`;
    case 'ui_icon':
    case 'ui_panel':
      return `assets/ui/${assetId}.png`;
    case 'vfx_texture':
      return `assets/vfx/${assetId}.png`;
    default:
      return `assets/generated/${assetId}.png`;
  }
}

function slugifyAssetId(description: string): string {
  const base = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return base || 'manual_asset';
}

export async function generateManualAsset(request: ManualAssetRequest): Promise<ManualAssetResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dnaPath = join(request.projectPath, 'game_dna.json');
  if (!existsSync(dnaPath)) {
    return { success: false, errors: ['game_dna.json not found — select a generated project'], warnings };
  }

  const gameDna = GameDNASchema.parse(JSON.parse(readFileSync(dnaPath, 'utf-8')));
  let artBible: DesignBible['art'] | undefined;
  const biblePath = join(request.projectPath, 'design_bible.json');
  if (existsSync(biblePath)) {
    try {
      const bible = JSON.parse(readFileSync(biblePath, 'utf-8')) as DesignBible;
      artBible = bible.art;
    } catch {
      warnings.push('design_bible.json unreadable — using Game DNA style only');
    }
  }
  let styleBible: StyleBible | undefined;
  const stylePath = join(request.projectPath, 'style_bible.json');
  if (existsSync(stylePath)) {
    try {
      styleBible = JSON.parse(readFileSync(stylePath, 'utf-8')) as StyleBible;
    } catch {
      warnings.push('style_bible.json unreadable — using Game DNA style only');
    }
  }

  const config = loadConfig();
  const assetId = request.assetId ?? slugifyAssetId(request.description);
  const relPath = inferAssetPath(request.assetType, assetId);
  const seed = request.seed ?? Math.floor(Math.random() * 1_000_000);

  let asset: GeneratedAsset;
  try {
    const pipeline = new AssetPipeline();
    asset = await pipeline.generateManual({
      gameDna,
      artBible,
      styleBible,
      description: request.description,
      assetType: request.assetType,
      assetId,
      relPath,
      outputDir: request.projectPath,
      seed,
      mode: request.generationMode ?? 'HYBRID_FREE',
      comfyuiUrl: process.env.COMFYUI_BASE_URL,
      diffusersPython: process.env.DIFFUSERS_PYTHON,
      diffusersModelId: process.env.DIFFUSERS_MODEL_ID,
      nvidiaApiKey: process.env.NVIDIA_API_KEY,
      nvidiaApiBaseUrl: process.env.NVIDIA_API_BASE_URL,
      nvidiaImageModel: request.nvidiaImageModel ?? process.env.NVIDIA_IMAGE_MODEL,
      huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN,
      huggingfaceImageModel: process.env.HF_IMAGE_MODEL,
      automatic1111Url: process.env.AUTOMATIC1111_BASE_URL,
      stabilityApiKey: process.env.STABILITY_API_KEY,
      deepaiApiKey: process.env.DEEPAI_API_KEY,
      replicateApiToken: process.env.REPLICATE_API_TOKEN,
      ollamaBaseUrl: config.ollamaBaseUrl,
      hardwareProfile: request.hardwareProfile,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errors: [message],
      warnings,
    };
  }

  if (asset.fallbackGenerated) {
    return {
      success: false,
      asset,
      errors: [
        asset.fallbackReason ??
          'Manual Generator refused procedural placeholder — image provider failed or unavailable',
      ],
      warnings,
    };
  }

  mkdirSync(dirname(join(request.projectPath, relPath)), { recursive: true });
  const targetFull = join(request.projectPath, relPath);
  if (existsSync(targetFull)) {
    recordAssetVersion(request.projectPath, assetId, {
      path: relPath,
      prompt: request.description,
      seed,
      manual: true,
    });
  }
  writeFileSync(targetFull, asset.buffer);

  const manifestPath = join(request.projectPath, 'generation_manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
        artifacts?: Array<Record<string, unknown>>;
      };
      const artifacts = manifest.artifacts ?? [];
      const idx = artifacts.findIndex((a) => a.id === assetId);
      const license = licenseFieldsForProvider(asset.provider);
      const entry = {
        id: assetId,
        path: relPath,
        type: 'texture',
        provider: asset.provider,
        modelId: asset.modelId,
        fallbackGenerated: asset.fallbackGenerated,
        critiquePassed: asset.critiquePassed,
        critiqueScore: asset.critiqueScore,
        maturity: asset.maturity,
        productionReady: asset.productionReady,
        sourceType: asset.sourceType,
        sourcePath: asset.sourcePath,
        selectedProvider: asset.selectedProvider ?? asset.provider,
        selectedModel: asset.selectedModel ?? asset.modelId,
        requestedCapability: asset.requestedCapability ?? 'IMAGE_GENERATION',
        productionAllowed: asset.productionAllowed,
        ...license,
        manual: true,
        prompt: request.description,
        seed,
      };
      if (idx >= 0) artifacts[idx] = { ...artifacts[idx], ...entry };
      else artifacts.push(entry);
      writeFileSync(manifestPath, JSON.stringify({ ...manifest, artifacts }, null, 2));
    } catch {
      warnings.push('Could not update generation_manifest.json');
    }
  }

  return { success: true, asset, errors, warnings };
}
