import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { encodePng, decodePngRgba, applyMaterialColors, validateMaterialColorRules, compileManualImage, isolateManualForeground, DiffusersProvider, type ManualImagePlan, type MaterialColorRule } from '@metroforge/assets';
import { assertAssetId, assetFile, lockAssetMutation, sameBytes, fileBytes, commitAssetFiles, invalidateAssetValidation } from './asset-files.js';
import { listAssetHistory, type AssetVersionRecord } from './asset-history.js';
import { markDescendantsDirty, defaultCharacterLineageEdges } from './artifact-lineage.js';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const dataUrl = (bytes: Buffer) => 'data:image/png;base64,' + bytes.toString('base64');
const inspectionHash = (s: Snapshot) => sha(Buffer.from(sha(s.source) + sha(s.image) + sha(s.manifestBytes) + sha(s.dnaBytes)));
const drafts = new Map<string, Draft>();
const lifetime = 10 * 60_000;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => { let n = value; for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0); return n >>> 0; });
function pngCrc(bytes: Buffer) { let value = 0xffffffff; for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255]!; return (value ^ 0xffffffff) >>> 0; }
interface Snapshot {
  project: string; id: string; manifestBytes: Buffer; dnaBytes: Buffer; manifest: Record<string, any>;
  artifact: Record<string, any>; image: Buffer; source: Buffer; plan: ManualImagePlan;
}
interface SourceRegion { x: number; y: number; width: number; height: number }
interface Draft extends Snapshot { created: number; editedSource: Buffer; editedImage: Buffer; rules: MaterialColorRule[]; changedPixels: number; isolation: Record<string, unknown>; sourceImport?: { name: string; sha256: string; width: number; height: number; region?: SourceRegion; resultSourceHash?: string } }

function dimensions(bytes: Buffer) {
  if (bytes.length < 24 || bytes.length > 16_777_216 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Artwork must be a bounded PNG image');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 4_194_304) throw new Error('Source artwork is too large for material editing');
  return { width, height };
}

function snapshot(projectPath: string, id: string): Snapshot {
  assertAssetId(id);
  const project = resolve(projectPath), manifestBytes = readFileSync(assetFile(project, 'generation_manifest.json'));
  const dnaBytes = readFileSync(assetFile(project, 'game_dna.json'));
  JSON.parse(dnaBytes.toString());
  const manifest = JSON.parse(manifestBytes.toString());
  const rows = Array.isArray(manifest.artifacts) ? manifest.artifacts.filter((a: Record<string, unknown>) => a.id === id) : [];
  if (rows.length !== 1) throw new Error('Select one registered image in this project');
  const artifact = rows[0];
  if (artifact.manual !== true || artifact.type !== 'texture' || !artifact.imagePlan || !artifact.sourcePath || artifact.frameCount > 1 || artifact.animationMetadata || artifact.sourceAnimation)
    throw new Error('Material correction requires a static Workshop image with its saved source');
  for (const path of [artifact.path, artifact.sourcePath]) if (typeof path !== 'string' || !path.startsWith('assets/') || !path.endsWith('.png')) throw new Error('Artwork source registration is invalid');
  if (artifact.path === artifact.sourcePath) throw new Error('Source artwork and game image must have separate registered paths');
  const image = readFileSync(assetFile(project, artifact.path)), source = readFileSync(assetFile(project, artifact.sourcePath));
  const imageSize = dimensions(image), sourceSize = dimensions(source), plan = artifact.imagePlan as ManualImagePlan;
  if (!['CHARACTER','ENEMY','NPC','BOSS'].includes(plan.profile) || plan.transparent !== true || plan.grounded !== true || plan.width !== imageSize.width || plan.height !== imageSize.height || plan.sourceWidth !== sourceSize.width || plan.sourceHeight !== sourceSize.height)
    throw new Error('Saved source and game image dimensions differ from their compilation plan');
  listAssetHistory(project, id);
  return { project, id, manifestBytes, dnaBytes, manifest, artifact, image, source, plan: { ...plan } };
}

function assertCurrent(before: Snapshot): void {
  const current = snapshot(before.project, before.id);
  if (!sameBytes(before.manifestBytes, current.manifestBytes) || !sameBytes(before.dnaBytes, current.dnaBytes) || !sameBytes(before.source, current.source) || !sameBytes(before.image, current.image))
    throw new Error('Artwork changed after inspection. Reload the source and preview your changes again.');
}

export function readMaterialArtwork(projectPath: string, assetId: string) {
  const s = snapshot(projectPath, assetId);
  return { inspectionHash: inspectionHash(s), sourceHash: sha(s.source), imageHash: sha(s.image), width: s.plan.sourceWidth, height: s.plan.sourceHeight, sourceDataUrl: dataUrl(s.source), imageDataUrl: dataUrl(s.image) };
}

/** Import source bytes without file-path access or saving before review. */
export function previewImportedActorSource(projectPath: string, assetId: string, expectedInspectionHash: string, pngDataUrl: unknown, name: unknown, requestedRegion?: unknown) {
  const release = lockAssetMutation(projectPath);
  try {
    const s = snapshot(projectPath, assetId);
    if (inspectionHash(s) !== expectedInspectionHash) throw new Error('Artwork changed after inspection. Reload the source and preview your changes again.');
    if (typeof name !== 'string' || !name.length || name.length > 160 || /[\x00-\x1f/\\]/.test(name)) throw new Error('Choose a PNG file with a plain filename');
    if (typeof pngDataUrl !== 'string' || pngDataUrl.length > 22_369_648 || !pngDataUrl.startsWith('data:image/png;base64,')) throw new Error('Import a PNG source no larger than 16 MiB');
    const encoded = pngDataUrl.slice(22), imported = Buffer.from(encoded, 'base64');
    if (imported.toString('base64') !== encoded) throw new Error('Imported PNG encoding is invalid');
    const size = dimensions(imported), chunks: Buffer[] = [];
    let offset = 8, count = 0, ended = false, header = false;
    while (offset + 12 <= imported.length && ++count <= 1024) {
      const length = imported.readUInt32BE(offset), type = imported.toString('ascii', offset + 4, offset + 8);
      if (offset + 12 + length > imported.length) throw new Error('Imported PNG is truncated');
      if (pngCrc(imported.subarray(offset + 4, offset + 8 + length)) !== imported.readUInt32BE(offset + 8 + length)) throw new Error('Imported PNG checksum is invalid');
      if (!header && (type !== 'IHDR' || length !== 13)) throw new Error('Imported PNG header is invalid');
      if (type === 'IHDR') {
        if (header || imported[offset + 16] !== 8 || imported[offset + 17] !== 6 || imported[offset + 18] !== 0 || imported[offset + 19] !== 0 || imported[offset + 20] !== 0) throw new Error('Use a non-interlaced 8-bit RGBA PNG source');
        header = true;
      }
      if (type === 'acTL' || type === 'fcTL') throw new Error('Import a single static actor source, not an animation');
      if (type === 'IDAT') chunks.push(imported.subarray(offset + 8, offset + 8 + length));
      offset += 12 + length;
      if (type === 'IEND') { ended = length === 0; break; }
    }
    if (!ended || offset !== imported.length || !chunks.length) throw new Error('Imported PNG structure is invalid');
    const expected = (size.width * 4 + 1) * size.height;
    const scanlines = inflateSync(Buffer.concat(chunks), { maxOutputLength: expected });
    if (scanlines.length !== expected) throw new Error('Imported PNG scanlines are invalid');
    for (let row = 0; row < size.height; row++) if (scanlines[row * (size.width * 4 + 1)]! > 4) throw new Error('Imported PNG filter is invalid');
    const decoded = decodePngRgba(imported);
    let visible = 0, transparent = 0;
    for (let i = 3; i < decoded.rgba.length; i += 4) { if (decoded.rgba[i]! >= 128) visible++; if (decoded.rgba[i] === 0) transparent++; }
    if ((!visible && requestedRegion === undefined) || transparent < size.width * size.height * 0.05) throw new Error('Actor source needs a visible figure on a transparent canvas');
    let editedSource: Buffer = imported, region: SourceRegion | undefined;
    if (requestedRegion !== undefined) {
      if (!requestedRegion || typeof requestedRegion !== 'object' || Array.isArray(requestedRegion)) throw new Error('Choose a valid source rectangle');
      const r = requestedRegion as SourceRegion;
      if (![r.x,r.y,r.width,r.height].every(Number.isSafeInteger) || r.x<0 || r.y<0 || r.width<1 || r.height<1 || r.x+r.width>s.plan.sourceWidth || r.y+r.height>s.plan.sourceHeight) throw new Error('Source rectangle must stay inside the original canvas');
      if (size.width!==s.plan.sourceWidth || size.height!==s.plan.sourceHeight) throw new Error('Region import needs an image with the same source canvas dimensions');
      region = { x:r.x,y:r.y,width:r.width,height:r.height };
      const original = decodePngRgba(s.source), combined = new Uint8Array(original.rgba);
      for (let row=r.y;row<r.y+r.height;row++) {
        const start=(row*size.width+r.x)*4,end=start+r.width*4;
        combined.set(decoded.rgba.subarray(start,end),start);
      }
      if (!combined.some((value,index)=>value!==original.rgba[index])) throw new Error('No source pixels changed inside this rectangle');
      if (!combined.some((value,index)=>index%4===3&&value>=128)) throw new Error('Region import would remove the entire actor');
      editedSource = encodePng(size.width,size.height,combined);
    }
    const plan = { ...s.plan, sourceWidth: size.width, sourceHeight: size.height }, editedImage = compileManualImage(editedSource, plan);
    assertCurrent(s);
    for (const [id, draft] of drafts) if (Date.now() - draft.created > lifetime) drafts.delete(id);
    while (drafts.size >= 4) drafts.delete(drafts.keys().next().value!);
    const draftId = randomUUID(), sourceImport = { name, sha256: sha(imported), ...size, ...(region ? { region, resultSourceHash: sha(editedSource) } : {}) };
    drafts.set(draftId, { ...s, plan, created: Date.now(), editedSource, editedImage, rules: [], changedPixels: visible, isolation: { matteSource: 'imported_alpha' }, sourceImport });
    return { draftId, sourceDataUrl: dataUrl(editedSource), imageDataUrl: dataUrl(editedImage), sourceHash: sha(editedSource), imageHash: sha(editedImage), width: size.width, height: size.height, region };
  } finally { release(); }
}

/** A preview does not mutate project files. The immutable draft contains exactly the reviewed PNGs. */
export async function previewMaterialArtwork(projectPath: string, assetId: string, expectedInspectionHash: string, requested: unknown,
  isolationProvider: { segmentForeground(png: Buffer): Promise<{ok: boolean; buffer?: Buffer; model?: string; modelVersion?: string}> } = new DiffusersProvider()) {
  const release = lockAssetMutation(projectPath);
  try {
    const s = snapshot(projectPath, assetId);
    if (!/^[0-9a-f]{64}$/.test(expectedInspectionHash) || inspectionHash(s) !== expectedInspectionHash) throw new Error('Artwork changed after inspection. Reload the source and preview your changes again.');
    const rules = validateMaterialColorRules(requested, s.plan.sourceWidth, s.plan.sourceHeight);
    const isolated = await isolateManualForeground(s.source, s.plan, isolationProvider);
    const corrected = applyMaterialColors(isolated.buffer, rules);
    if (!corrected.changedPixels) throw new Error('No source colors matched. Pick an artwork color or adjust the rectangle and tolerance.');
    const editedImage = compileManualImage(corrected.buffer, s.plan);
    assertCurrent(s);
    for (const [id, draft] of drafts) if (Date.now() - draft.created > lifetime) drafts.delete(id);
    while (drafts.size >= 4) drafts.delete(drafts.keys().next().value!);
    const draftId = randomUUID();
    drafts.set(draftId, { ...s, created: Date.now(), editedSource: corrected.buffer, editedImage, rules, changedPixels: corrected.changedPixels, isolation: isolated.metadata });
    return { draftId, changedPixels: corrected.changedPixels, sourceDataUrl: dataUrl(corrected.buffer), imageDataUrl: dataUrl(editedImage), sourceHash: sha(corrected.buffer), imageHash: sha(editedImage) };
  } finally { release(); }
}

export function applyMaterialArtwork(projectPath: string, assetId: string, draftId: string) {
  const release = lockAssetMutation(projectPath);
  try {
    const draft = drafts.get(draftId);
    if (!draft || draft.project.toLowerCase() !== resolve(projectPath).toLowerCase() || draft.id !== assetId || Date.now() - draft.created > lifetime)
      throw new Error('This artwork preview expired or belongs to another image. Preview it again.');
    assertCurrent(draft);
    const versions = listAssetHistory(draft.project, assetId), version = Math.max(0, ...versions.map(v => v.version)) + 1;
    if (!Number.isSafeInteger(version)) throw new Error('Asset history is invalid');
    const backupPath = `.metroforge/asset_history/${assetId}_v${version}.png`, sourceBackupPath = `.metroforge/asset_history/${assetId}_v${version}_source.png`;
    if (existsSync(assetFile(draft.project, backupPath)) || existsSync(assetFile(draft.project, sourceBackupPath))) throw new Error('History backup already exists; existing artwork was preserved');
    const writes = new Map<string, Buffer>([[assetFile(draft.project, backupPath), draft.image], [assetFile(draft.project, sourceBackupPath), draft.source]]);
    for (const [path, before, after] of [[draft.artifact.path, draft.image, draft.editedImage], [draft.artifact.sourcePath, draft.source, draft.editedSource]] as Array<[string, Buffer, Buffer]>) {
      const mirror = assetFile(draft.project, `Assets/StreamingAssets/${path}`);
      if (existsSync(mirror) && !sameBytes(fileBytes(mirror), before)) throw new Error('Asset runtime copies differ; reconcile them before editing');
      writes.set(assetFile(draft.project, path), after);
      if (existsSync(mirror)) writes.set(mirror, after);
    }
    const record: AssetVersionRecord = { version, path: draft.artifact.path, sourcePath: draft.artifact.sourcePath, backupPath, sourceBackupPath, timestamp: new Date().toISOString(), artifact: { ...draft.artifact }, provider: draft.artifact.provider, prompt: draft.artifact.prompt, seed: draft.artifact.seed, manual: true };
    const provider = draft.sourceImport ? 'manual-source-import' : 'manual-source-edit';
    const edited: Record<string, any> = { ...draft.artifact, imagePlan: { ...draft.plan }, provider, selectedProvider: provider, requestedProvider: provider, modelId: undefined, selectedModel: undefined, requestedCapability: draft.sourceImport ? 'manual_source_import' : 'manual_color_correction', sourceType: 'manual', generationBackend: draft.sourceImport ? 'manual_source_import' : 'manual_source_edit', critiquePassed: false, critiqueScore: 0, productionAllowed: false, productionReady: false, maturity: 'COMPILED', manual: true,
      executionMetadata: { originalExecutionMetadata: draft.artifact.executionMetadata, materialColorEdit: { editedAt: new Date().toISOString(), rules: draft.rules, originalSourceHash: sha(draft.source), originalImageHash: sha(draft.image), sourceHash: sha(draft.editedSource), imageHash: sha(draft.editedImage), foregroundIsolation: draft.isolation }, manualActorReview: { state: 'pending', scope: 'source-image', humanReviewRequired: true } } };
    if (draft.sourceImport) {
      delete edited.requestedModel;
      delete edited.seed;
      delete edited.promptHash;
      delete edited.generationTimestamp;
      delete edited.restoredFromVersion;
      edited.fallbackGenerated = false;
      edited.fallbackDepth = 0;
      edited.license = 'Imported artwork — license unverified';
      edited.commercialUse = 'unknown';
      delete edited.executionMetadata.materialColorEdit;
      edited.executionMetadata.sourceImport = { ...draft.sourceImport, importedAt: new Date().toISOString(), originalSourceHash: sha(draft.source), originalImageHash: sha(draft.image), imageHash: sha(draft.editedImage) };
    }
    draft.manifest.artifacts = draft.manifest.artifacts.map((a: Record<string, unknown>) => a.id === assetId ? edited : a);
    draft.manifest.assetHistory = { ...draft.manifest.assetHistory, [assetId]: [...versions, record] };
    const edges = draft.manifest.artifacts.flatMap((row: Record<string, unknown>) => Array.isArray(row.parentArtifactIds) ? row.parentArtifactIds.filter((id): id is string => typeof id === 'string').map(parentId => ({ parentId, childId: String(row.id), reason: 'derived_artwork' })) : []);
    const dna = JSON.parse(readFileSync(assetFile(draft.project, 'game_dna.json'), 'utf8'));
    const invalidation = markDescendantsDirty([...edges, ...(assetId === 'player' && dna.archetype === 'SIDE_VIEW_METROIDVANIA' ? defaultCharacterLineageEdges(assetId) : [])], assetId);
    const ids = new Set(invalidation.dirtyIds);
    for (const row of draft.manifest.artifacts) if (ids.has(String(row.id)) || ids.has(`${String(row.id)}_sheet`)) {
      row.dirty = true; row.productionReady = false; row.dirtyReason = invalidation.reason;
    }
    writes.set(assetFile(draft.project, 'generation_manifest.json'), Buffer.from(JSON.stringify(draft.manifest, null, 2)));
    invalidateAssetValidation(draft.project, writes);
    commitAssetFiles(writes);
    drafts.delete(draftId);
    return { success: true, path: edited.path, version, sourceHash: sha(draft.editedSource), imageHash: sha(draft.editedImage) };
  } finally { release(); }
}
