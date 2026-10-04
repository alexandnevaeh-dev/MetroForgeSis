import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getResourceRoot } from '@metroforge/shared';
import { createHash, randomUUID } from 'node:crypto';
import { decodePngRgba } from '@metroforge/assets';
import { assetFile, commitAssetFiles, fileBytes, invalidateAssetValidation, lockAssetMutation } from './asset-files.js';

const CONFIG = 'data/visual/biome-backgrounds.json';
const RUNTIME = 'scripts/world/StormglassDecor.gd';
const SPATIAL = 'data/visual/castle-spatial-profile.json';
const HISTORY = '.metroforge/biome-background-history.json';
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export interface BiomeBackground { assetId: string; path: string; opacity: number; anchorY: number }
interface Configuration { version: 1; biomes: Record<string, BiomeBackground> }
interface Command { id: string; biomeId: string; before: string | null; afterHash: string; runtimeBefore?: string; runtimeAfterHash?: string }
interface History { version: 1; undo: Command[]; events: Array<{ id: string; action: string; timestamp: string }> }
export interface CastleSpatialProfile { rooms: string[]; panoramaHeight: number }
export interface BiomeBackgroundSnapshot {
  supported: boolean; biomeId: string; roomCount: number; revision: string;
  settings: BiomeBackground | null; canUndo: boolean;
  spatialProfile: CastleSpatialProfile | null;
  options: Array<{ id: string; path: string; width: number; height: number }>;
}
const emptyConfig = (): Configuration => ({ version: 1, biomes: {} });
function parseConfig(bytes: Buffer | null): Configuration {
  if (!bytes) return emptyConfig();
  const value = JSON.parse(bytes.toString('utf8')) as Configuration;
  if (value?.version !== 1 || !value.biomes || typeof value.biomes !== 'object' || Array.isArray(value.biomes)) throw new Error('Background settings are invalid; existing data was preserved');
  for (const [biome, row] of Object.entries(value.biomes)) {
    if (!/^biome_\d+$/.test(biome) || !row || typeof row.assetId !== 'string' || typeof row.path !== 'string' || !Number.isFinite(row.opacity) || row.opacity < 0.1 || row.opacity > 1 || !Number.isFinite(row.anchorY) || row.anchorY < 0 || row.anchorY > 1) throw new Error('Background settings are invalid; existing data was preserved');
  }
  return value;
}
function snapshot(project: string, biomeId: string) {
  if (!/^biome_\d+$/.test(biomeId)) throw new Error('Invalid biome');
  const watched = new Map<string, Buffer | null>();
  const watch = (path: string) => { const file = assetFile(project, path); const bytes = fileBytes(file); watched.set(file, bytes); return bytes; };
  const dna = JSON.parse(watch('game_dna.json')?.toString('utf8') ?? '{}');
  const projectText = watch('project.godot')?.toString('utf8') ?? '';
  const runtimeRaw = watch(RUNTIME);
  const supported = !!runtimeRaw && dna.archetype === 'SIDE_VIEW_METROIDVANIA' && /config\/name\s*=\s*"Stormglass Reliquary/.test(projectText);
  const rawRooms = JSON.parse(watch('data/rooms/rooms.json')?.toString('utf8') ?? '{"rooms":{}}');
  const rooms = Object.values(rawRooms.rooms ?? {}) as Array<{ biomeId?: string }>;
  const roomCount = rooms.filter(room => room?.biomeId === biomeId).length;
  const manifest = JSON.parse(watch('generation_manifest.json')?.toString('utf8') ?? '{"artifacts":[]}');
  if (!Array.isArray(manifest.artifacts)) throw new Error('Asset registry is invalid');
  const options: BiomeBackgroundSnapshot['options'] = [];
  for (const row of manifest.artifacts as Array<Record<string, any>>) {
    if (row.imagePlan?.profile !== 'BACKGROUND' && row.type !== 'background' && !String(row.path).startsWith('assets/backgrounds/')) continue;
    if (typeof row.id !== 'string' || typeof row.path !== 'string' || !row.path.startsWith('assets/') || !row.path.endsWith('.png') || /_source\.png$/.test(row.path)) continue;
    if (options.some(option => option.id === row.id || option.path === row.path)) throw new Error('Background registry is ambiguous');
    const image = watch(row.path);
    if (!image) throw new Error('Registered background is missing');
    if (image.length < 24 || image.readUInt32BE(16) > 4096 || image.readUInt32BE(20) > 4096) throw new Error('Background image is invalid or too large');
    const { width, height } = decodePngRgba(image);
    options.push({ id: row.id, path: row.path, width, height });
  }
  const spatialRaw = supported ? watch(SPATIAL) : null;
  let spatialProfile: CastleSpatialProfile | null = null;
  if (spatialRaw) {
    const value = JSON.parse(spatialRaw.toString('utf8'));
    if (value?.version !== 1 || !Array.isArray(value.rooms) || value.rooms.some((id: unknown) => typeof id !== 'string' || !/^room_\d+$/.test(id)) || new Set(value.rooms).size !== value.rooms.length || typeof value.panoramaHeight !== 'number' || !Number.isFinite(value.panoramaHeight) || value.panoramaHeight < 512 || value.panoramaHeight > 1536) throw new Error('Castle room profile is invalid; existing settings were preserved');
    if (!runtimeRaw?.toString('utf8').includes('res://data/visual/castle-spatial-profile.json')) throw new Error('Refresh the castle runtime before previewing its modular room profile');
    spatialProfile = { rooms: [...value.rooms], panoramaHeight: value.panoramaHeight };
  }
  const configRaw = watch(CONFIG);
  const config = parseConfig(configRaw);
  const historyRaw = watch(HISTORY);
  const history: History = historyRaw ? JSON.parse(historyRaw.toString('utf8')) : { version: 1, undo: [], events: [] };
  if (history?.version !== 1 || !Array.isArray(history.undo) || !Array.isArray(history.events) || history.undo.some(row => !row || typeof row.id !== 'string' || typeof row.biomeId !== 'string' || (row.before !== null && typeof row.before !== 'string') || !/^[a-f0-9]{64}$/.test(row.afterHash) || (row.runtimeBefore !== undefined && (typeof row.runtimeBefore !== 'string' || !/^[a-f0-9]{64}$/.test(row.runtimeAfterHash ?? ''))) || (row.runtimeAfterHash !== undefined && row.runtimeBefore === undefined))) throw new Error('Background history is invalid; existing records were preserved');
  const settings = config.biomes[biomeId] ?? null;
  if (settings && !options.some(option => option.id === settings.assetId && option.path === settings.path)) throw new Error('Selected background is no longer registered');
  watch('validation_report.json');
  const revision = hash(JSON.stringify([...watched].map(([path, bytes]) => [path, bytes ? hash(bytes) : null])));
  const publicState: BiomeBackgroundSnapshot = { supported, biomeId, roomCount, revision, settings, options, spatialProfile, canUndo: history.undo.at(-1)?.biomeId === biomeId };
  return { config, configRaw, runtimeRaw, history, publicState };
}
/** Upgrade only the panorama functions and its continuity metadata, preserving other authored decoration. */
function upgradeRuntime(original: Buffer): Buffer {
  const current = original.toString('utf8');
  if (current.includes('"res://data/visual/biome-backgrounds.json"')) return original;
  const template = readFileSync(join(getResourceRoot(), 'templates/godot-metroidvania', RUNTIME), 'utf8');
  const section = (text: string, name: string) => {
    const start = text.indexOf(`func ${name}(`);
    if (start < 0) throw new Error('Castle renderer needs a template refresh before background editing');
    const from = text.lastIndexOf('\n', start) + 1;
    const next = /\n(?:static )?func /.exec(text.slice(start + 5));
    return { from, end: next ? start + 5 + next.index + 1 : text.length };
  };
  const existing = section(current, '_spawn_authored_panorama');
  const replacement = section(template, '_spawn_authored_panorama');
  const helpers = section(template, 'background_settings');
  const legacyMeta = 'holder.set_meta("castle_base", CASTLE_INTERIOR_PANORAMA)';
  if (!current.includes(legacyMeta)) throw new Error('Castle decoration changed; refresh the template before background editing');
  const updated = current.slice(0, existing.from) + template.slice(helpers.from, replacement.end) + current.slice(existing.end);
  return Buffer.from(updated.replace(legacyMeta, 'holder.set_meta("castle_base", castle_background_path(biome_id))'));
}
export function readBiomeBackground(project: string, biomeId: string): BiomeBackgroundSnapshot {
  return snapshot(project, biomeId).publicState;
}
export function saveBiomeBackground(project: string, biomeId: string, value: { assetId: string | null; opacity: number; anchorY: number }, revision: string): BiomeBackgroundSnapshot {
  const release = lockAssetMutation(project);
  try {
    const state = snapshot(project, biomeId);
    if (!state.publicState.supported || !state.publicState.roomCount) throw new Error('Select a Stormglass castle biome');
    if (state.publicState.revision !== revision) throw new Error('Project artwork changed; reload the background settings and retry');
    if (!value || !Number.isFinite(value.opacity) || value.opacity < 0.1 || value.opacity > 1 || !Number.isFinite(value.anchorY) || value.anchorY < 0 || value.anchorY > 1) throw new Error('Invalid background framing');
    if (value.assetId === null) delete state.config.biomes[biomeId];
    else {
      const option = state.publicState.options.find(option => option.id === value.assetId);
      if (!option) throw new Error('Select a registered background from this project');
      state.config.biomes[biomeId] = { assetId: option.id, path: option.path, opacity: value.opacity, anchorY: value.anchorY };
    }
    const runtime = upgradeRuntime(state.runtimeRaw!);
    const bytes = Buffer.from(JSON.stringify(state.config, null, 2));
    const id = randomUUID();
    state.history.undo.push({ id, biomeId, before: state.configRaw?.toString('utf8') ?? null, afterHash: hash(bytes), runtimeBefore: state.runtimeRaw!.toString('utf8'), runtimeAfterHash: hash(runtime) });
    state.history.events.push({ id, action: 'save', timestamp: new Date().toISOString() });
    const writes = new Map<string, Buffer>([[assetFile(project, CONFIG), bytes], [assetFile(project, HISTORY), Buffer.from(JSON.stringify(state.history, null, 2))], [assetFile(project, `.metroforge/biome-background-backups/${id}.json`), Buffer.from(JSON.stringify({ biomeId, before: state.configRaw?.toString('utf8') ?? null, runtimeBefore: state.runtimeRaw!.toString('utf8'), after: state.config.biomes[biomeId] ?? null }, null, 2))]]);
    writes.set(assetFile(project, RUNTIME), runtime);
    invalidateAssetValidation(project, writes); commitAssetFiles(writes);
    return readBiomeBackground(project, biomeId);
  } finally { release(); }
}
export function undoBiomeBackground(project: string, biomeId: string, revision: string): BiomeBackgroundSnapshot {
  const release = lockAssetMutation(project);
  try {
    const state = snapshot(project, biomeId);
    if (!state.publicState.supported || state.publicState.revision !== revision) throw new Error('Project artwork changed; reload before undoing');
    const command = state.history.undo.at(-1);
    if (!command || command.biomeId !== biomeId || !state.configRaw || hash(state.configRaw) !== command.afterHash) throw new Error('Background changed; the previous edit cannot be undone safely');
    if (command.runtimeAfterHash && (!state.runtimeRaw || hash(state.runtimeRaw) !== command.runtimeAfterHash || typeof command.runtimeBefore !== 'string')) throw new Error('Castle renderer changed; undo cannot safely restore it');
    const restored = command.before === null ? Buffer.from(JSON.stringify(emptyConfig(), null, 2)) : Buffer.from(command.before);
    parseConfig(restored); state.history.undo.pop();
    state.history.events.push({ id: command.id, action: 'undo', timestamp: new Date().toISOString() });
    const writes = new Map<string, Buffer>([[assetFile(project, CONFIG), restored], [assetFile(project, HISTORY), Buffer.from(JSON.stringify(state.history, null, 2))]]);
    if (command.runtimeBefore !== undefined) writes.set(assetFile(project, RUNTIME), Buffer.from(command.runtimeBefore));
    invalidateAssetValidation(project, writes); commitAssetFiles(writes);
    return readBiomeBackground(project, biomeId);
  } finally { release(); }
}
