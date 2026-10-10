import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { applyMaterialColors, validateMaterialColorRules, compileManualImage, isolateManualForeground, DiffusersProvider, type ManualImagePlan, type MaterialColorRule } from '@metroforge/assets';
import { assertAssetId, assetFile, lockAssetMutation, sameBytes, fileBytes, commitAssetFiles, invalidateAssetValidation } from './asset-files.js';
import { listAssetHistory, type AssetVersionRecord } from './asset-history.js';
import { markDescendantsDirty, defaultCharacterLineageEdges } from './artifact-lineage.js';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const dataUrl = (bytes: Buffer) => 'data:image/png;base64,' + bytes.toString('base64');
const inspectionHash = (s: Snapshot) => sha(Buffer.from(sha(s.source) + sha(s.image) + sha(s.manifestBytes) + sha(s.dnaBytes)));
const drafts = new Map<string, Draft>();
const lifetime = 10 * 60_000;
interface Snapshot {
  project: string; id: string; manifestBytes: Buffer; dnaBytes: Buffer; manifest: Record<string, any>;
  artifact: Record<string, any>; image: Buffer; source: Buffer; plan: ManualImagePlan;
}
interface Draft extends Snapshot { created: number; editedSource: Buffer; editedImage: Buffer; rules: MaterialColorRule[]; changedPixels: number; isolation: Record<string, unknown> }

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
      throw new Error('This color preview expired or belongs to another image. Preview the colors again.');
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
    const edited: Record<string, any> = { ...draft.artifact, provider: 'manual-source-edit', selectedProvider: 'manual-source-edit', requestedProvider: 'manual-source-edit', modelId: undefined, selectedModel: undefined, requestedCapability: 'manual_color_correction', sourceType: 'manual', generationBackend: 'manual_source_edit', critiquePassed: false, critiqueScore: 0, productionAllowed: false, productionReady: false, maturity: 'COMPILED', manual: true,
      executionMetadata: { originalExecutionMetadata: draft.artifact.executionMetadata, materialColorEdit: { editedAt: new Date().toISOString(), rules: draft.rules, originalSourceHash: sha(draft.source), originalImageHash: sha(draft.image), sourceHash: sha(draft.editedSource), imageHash: sha(draft.editedImage), foregroundIsolation: draft.isolation }, manualActorReview: { state: 'pending', scope: 'source-image', humanReviewRequired: true } } };
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
