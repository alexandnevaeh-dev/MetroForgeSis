import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AssetPipeline, derivedSourceRelPath, type GeneratedAsset } from '@metroforge/assets';
import { licenseFieldsForProvider } from '@metroforge/ai';
import { GameDNASchema, type DesignBible, type StyleBible } from '@metroforge/schemas';
import { loadConfig, genreSupports } from '@metroforge/shared';
import { listAssetHistory, type AssetVersionRecord } from './asset-history.js';
import { randomUUID } from 'node:crypto';
import { assertAssetId, assetFile, fileBytes, sameBytes, commitAssetFiles, invalidateAssetValidation, lockAssetMutation } from './asset-files.js';
import { markDescendantsDirty, defaultCharacterLineageEdges } from './artifact-lineage.js';

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
  operation?: 'create' | 'replace';
  providerEnabled?: Record<string, boolean>;
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

/**
 * Regenerating the canonical character still ('player') invalidates every pose/sheet compiled
 * from it. Regenerating one specific derived pose/sheet (any other assetId) is not a character
 * identity change and must never cascade — critically, descendantRelPaths(characterId) includes
 * the asset just written whenever assetId names one of the tracked lineage poses, so cascading
 * unconditionally would delete the very file this call just wrote.
 */
export function characterLineageRootFor(assetType: ManualAssetType, assetId: string): string {
  return assetType === 'player_sprite' && assetId === 'player' ? 'player' : '';
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
  const warnings: string[] = [];
  let release: (() => void) | undefined;
  try {
    if (!request.description?.trim() || request.description.length > 8000) throw new Error('Enter a prompt of 1–8000 characters');
    const types = ['character_concept', 'player_sprite', 'enemy', 'boss', 'npc', 'portrait', 'weapon', 'item', 'prop', 'tileset', 'tile', 'background', 'ui_icon', 'ui_panel', 'vfx_texture'];
    if (!types.includes(request.assetType)) throw new Error('Unknown asset type');
    if (request.seed !== undefined && (!Number.isSafeInteger(request.seed) || request.seed < 0 || request.seed > 2147483647)) throw new Error('Seed must be a whole number from 0 to 2147483647');
    if (request.operation && !['create', 'replace'].includes(request.operation)) throw new Error('Unknown artwork operation');
    if (request.generationMode && !['FREE_ONLY', 'LOCAL_ONLY', 'HYBRID_FREE', 'CUSTOM', 'NVIDIA_ONLY', 'OFFLINE', 'FASTEST', 'HIGHEST_QUALITY', 'LOW_VRAM', 'LOWEST_COST', 'BALANCED', 'COMMERCIAL_SAFE'].includes(request.generationMode)) throw new Error('Unknown generation mode');
    release = lockAssetMutation(request.projectPath);
    const watched = new Map<string, Buffer | null>();
    const watch = (path: string) => { const full = assetFile(request.projectPath, path); watched.set(full, fileBytes(full)); return full; };
    const dnaPath = watch('game_dna.json');
    if (!existsSync(dnaPath)) throw new Error('game_dna.json not found — select a generated project');
    const gameDna = GameDNASchema.parse(JSON.parse(readFileSync(dnaPath, 'utf8')));
    let artBible: DesignBible['art'] | undefined;
    const biblePath = watch('design_bible.json');
    if (existsSync(biblePath)) {
      try { artBible = (JSON.parse(readFileSync(biblePath, 'utf8')) as DesignBible).art; }
      catch { warnings.push('Design bible unreadable — using Game DNA style only'); }
    }
    let styleBible: StyleBible | undefined;
    const stylePath = watch('style_bible.json');
    if (existsSync(stylePath)) {
      try { styleBible = JSON.parse(readFileSync(stylePath, 'utf8')) as StyleBible; }
      catch { warnings.push('Style bible unreadable — using Game DNA style only'); }
    }
    const manifestPath = watch('generation_manifest.json');
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as ManualManifest : { artifacts: [] };
    if (!Array.isArray(manifest.artifacts)) throw new Error('Asset registry is invalid; repair it before generating artwork');
    const assetId = request.assetId ?? `${slugifyAssetId(request.description)}_${randomUUID()}`;
    assertAssetId(assetId);
    const versions = listAssetHistory(request.projectPath, assetId);
    const matches = manifest.artifacts.filter(a => a.id === assetId);
    if (matches.length > 1) throw new Error('Asset ID is ambiguous in this project');
    // Existing callers with an explicit ID retain replacement semantics; new UI states intent explicitly.
    const replacing = request.operation === 'replace' || (!request.operation && matches.length === 1);
    const registered = matches[0];
    if (replacing && !registered) throw new Error('Select a registered asset to replace');
    if (!replacing && registered) throw new Error('Asset ID already exists; create an alternative with a new ID');
    if (replacing && (Number(registered!.frameCount ?? 1) > 1 || /animation|sheet/i.test(String(registered!.type ?? '')))) {
      throw new Error('Animation sheets must be rebuilt with the animation workflow; a single image cannot replace them');
    }
    const relPath = replacing ? String(registered!.path ?? '') : inferAssetPath(request.assetType, assetId);
    if (!relPath.startsWith('assets/') || !relPath.endsWith('.png')) throw new Error('Only registered PNG artwork within assets/ can be replaced');
    if (manifest.artifacts.some(a => a.id !== assetId && a.path === relPath)) throw new Error('Artwork path is shared by multiple asset IDs');
    const target = watch(relPath);
    if (replacing && !existsSync(target)) throw new Error('Registered artwork is missing; repair it before replacement');
    if (!replacing && existsSync(target)) throw new Error('Artwork path already exists; existing files were preserved');
    const sourceRel = derivedSourceRelPath(relPath);
    const source = watch(sourceRel);
    if (!replacing && existsSync(source)) throw new Error('Source artwork already exists; existing files were preserved');
    const runtimeRel = `Assets/StreamingAssets/${relPath}`;
    const runtime = watch(runtimeRel);
    if (existsSync(runtime) && !sameBytes(fileBytes(target), fileBytes(runtime))) throw new Error('Asset runtime copies differ; reconcile them before replacing');
    const runtimeSource = watch(`Assets/StreamingAssets/${sourceRel}`);
    if (existsSync(runtimeSource) && !sameBytes(fileBytes(source), fileBytes(runtimeSource))) throw new Error('Source runtime copies differ; reconcile them before replacing');
    watch('validation_report.json');
    const stageRel = `.metroforge/manual-art/${randomUUID()}`;
    const stage = assetFile(request.projectPath, stageRel);
    mkdirSync(stage, { recursive: true });
    for (const [path, bytes] of [[relPath, fileBytes(target)], [sourceRel, fileBytes(source)]] as const) {
      if (bytes) { const staged = assetFile(stage, path); mkdirSync(dirname(staged), { recursive: true }); writeFileSync(staged, bytes); }
    }
    const config = loadConfig();
    const seed = request.seed ?? Math.floor(Math.random() * 1_000_000);
    const asset = await new AssetPipeline().generateManual({
      gameDna, artBible, styleBible, description: request.description, assetType: request.assetType,
      assetId, relPath, outputDir: stage, seed, mode: request.generationMode ?? 'HYBRID_FREE',
      comfyuiUrl: process.env.COMFYUI_BASE_URL, diffusersPython: process.env.DIFFUSERS_PYTHON,
      diffusersModelId: process.env.DIFFUSERS_MODEL_ID, nvidiaApiKey: process.env.NVIDIA_API_KEY,
      nvidiaApiBaseUrl: process.env.NVIDIA_API_BASE_URL,
      nvidiaImageModel: request.nvidiaImageModel ?? process.env.NVIDIA_IMAGE_MODEL,
      huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN,
      huggingfaceImageModel: process.env.HF_IMAGE_MODEL, automatic1111Url: process.env.AUTOMATIC1111_BASE_URL,
      stabilityApiKey: process.env.STABILITY_API_KEY, deepaiApiKey: process.env.DEEPAI_API_KEY,
      replicateApiToken: process.env.REPLICATE_API_TOKEN, pollinationsBaseUrl: process.env.POLLINATIONS_BASE_URL,
      pollinationsModel: process.env.POLLINATIONS_IMAGE_MODEL, pollinationsApiKey: process.env.POLLINATIONS_API_KEY,
      enablePollinations: process.env.POLLINATIONS_ENABLED === 'true', ollamaBaseUrl: config.ollamaBaseUrl,
      hardwareProfile: request.hardwareProfile, providerEnabled: request.providerEnabled,
    });
    if (asset.fallbackGenerated) throw new Error(asset.fallbackReason ?? 'Image provider failed; existing artwork was preserved');
    if (asset.id !== assetId || asset.path !== relPath || !asset.buffer?.length) throw new Error('Image provider returned an unexpected asset');
    if (asset.sourcePath && asset.sourcePath !== sourceRel) throw new Error('Image provider returned an unexpected source path');
    for (const [path, before] of watched) {
      assetFile(request.projectPath, path.slice(resolve(request.projectPath).length + 1).replace(/\\/g, '/'));
      if (!sameBytes(before, fileBytes(path))) throw new Error('Project changed while artwork was generating; existing files were preserved. Retry with the current project.');
    }
    const writes = new Map<string, Buffer>();
    if (replacing) {
      const version = Math.max(0, ...versions.map(v => v.version)) + 1;
      if (!Number.isSafeInteger(version)) throw new Error('Asset history is invalid');
      const backupRel = `.metroforge/asset_history/${assetId}_v${version}.png`;
      const backup = assetFile(request.projectPath, backupRel);
      if (existsSync(backup)) throw new Error('History backup already exists; existing versions were preserved');
      writes.set(backup, fileBytes(target)!);
      const sourceBackupRel = `.metroforge/asset_history/${assetId}_v${version}_source.png`;
      const sourceBackup = assetFile(request.projectPath, sourceBackupRel);
      if (existsSync(sourceBackup)) throw new Error('Source history backup already exists');
      if (existsSync(source)) writes.set(sourceBackup, fileBytes(source)!);
      manifest.assetHistory = { ...manifest.assetHistory, [assetId]: [...versions, {
        version, path: relPath, backupPath: backupRel, timestamp: new Date().toISOString(),
        artifact: { ...registered },
        sourcePath: existsSync(source) ? sourceRel : undefined,
        sourceBackupPath: existsSync(source) ? sourceBackupRel : undefined,
        prompt: typeof registered!.prompt === 'string' ? registered!.prompt : undefined,
        seed: typeof registered!.seed === 'number' ? registered!.seed : undefined,
        provider: typeof registered!.provider === 'string' ? registered!.provider : undefined, manual: true,
      }] };
    }
    writes.set(target, asset.buffer);
    if (existsSync(runtime)) writes.set(runtime, asset.buffer);
    if (asset.sourcePath) {
      const sourceBytes = fileBytes(assetFile(stage, asset.sourcePath));
      if (!sourceBytes) throw new Error('Generated source artwork is missing');
      writes.set(source, sourceBytes);
      if (existsSync(runtimeSource)) writes.set(runtimeSource, sourceBytes);
    }
    const { buffer: _buffer, ...metadata } = asset;
    const entry = { ...registered, ...metadata, type: registered?.type ?? 'texture', ...licenseFieldsForProvider(asset.provider),
      manual: true, prompt: request.description, seed, dirty: false, dirtyReason: undefined };
    if (replacing) manifest.artifacts[manifest.artifacts.indexOf(registered!)] = entry;
    else manifest.artifacts.push(entry);
    if (replacing) {
      const explicitEdges = manifest.artifacts.flatMap(row => Array.isArray(row.parentArtifactIds)
        ? row.parentArtifactIds.filter((id): id is string => typeof id === 'string').map(parentId => ({ parentId, childId: String(row.id), reason: 'derived_artwork' })) : []);
      const legacyEdges = characterLineageRootFor(request.assetType, assetId) && !genreSupports(gameDna.archetype, 'supportsFreePlanarMovement')
        ? defaultCharacterLineageEdges(assetId) : [];
      const invalidation = markDescendantsDirty([...explicitEdges, ...legacyEdges], assetId);
      const ids = new Set(invalidation.dirtyIds);
      for (const row of manifest.artifacts) {
        if (!ids.has(String(row.id)) && !ids.has(`${String(row.id)}_sheet`)) continue;
        row.dirty = true; row.productionReady = false; row.dirtyReason = invalidation.reason;
      }
      if (ids.size) warnings.push('Derived animations need rebuilding. Existing sheets and poses have been preserved.');
    }
    writes.set(manifestPath, Buffer.from(JSON.stringify(manifest, null, 2)));
    invalidateAssetValidation(request.projectPath, writes);
    commitAssetFiles(writes);
    warnings.push('Restart the game preview and validate the updated artwork.');
    return { success: true, asset, errors: [], warnings };
  } catch (error) {
    return { success: false, errors: [error instanceof Error ? error.message : String(error)], warnings };
  } finally { release?.(); }
}

interface ManualManifest {
  artifacts: Array<Record<string, unknown>>;
  assetHistory?: Record<string, AssetVersionRecord[]>;
  [key: string]: unknown;
}
