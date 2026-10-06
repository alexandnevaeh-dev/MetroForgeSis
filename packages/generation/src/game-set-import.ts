import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { statSync } from 'node:fs';
import { assetFile, commitAssetFiles, fileBytes, lockAssetMutation, sameBytes } from './asset-files.js';

/** Register this project's existing, hash-inventoried PNGs without changing artwork. */
export function importGameSetAssets(project: string) {
  const unlock = lockAssetMutation(project);
  try {
    const setPath = assetFile(project, 'GAME_SET.json'), manifestPath = assetFile(project, 'generation_manifest.json');
    const setBytes = fileBytes(setPath), manifestBytes = fileBytes(manifestPath);
    if (!setBytes || !manifestBytes) throw new Error('This project needs a game-set inventory and generation registry before importing assets');
    const set = JSON.parse(setBytes.toString('utf8')) as Record<string, unknown>;
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>;
    const dnaBytes = fileBytes(assetFile(project, 'game_dna.json'));
    if (!dnaBytes) throw new Error('This project needs its game definition before importing assets');
    const dna = JSON.parse(dnaBytes.toString('utf8')) as Record<string, unknown>;
    if (set.archetype && set.archetype !== dna.archetype) throw new Error('Game-set genre does not match this project');
    if (!Array.isArray(set.assets) || !Array.isArray(manifest.artifacts) || set.assets.length > 10000) throw new Error('Game-set inventory or generation registry is malformed');
    const artifacts = manifest.artifacts as Array<Record<string, unknown>>;
    if (artifacts.some(row => !row || typeof row !== 'object' || typeof row.path !== 'string' || typeof row.id !== 'string')) throw new Error('Generation registry has malformed asset records');
    const ids = new Set(artifacts.map(row => String(row.id))), existing = new Set(artifacts.map(row => String(row.path).toLowerCase()));
    const seen = new Set<string>(), checked = new Map<string, string>(), added: Array<Record<string, unknown>> = [];
    let skipped = 0, excludedQa = 0;
    const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    for (const entry of set.assets) {
      if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string') throw new Error('Game-set asset record is malformed');
      if (!entry.path.toLowerCase().endsWith('.png')) continue;
      const path = entry.path as string;
      if (path.toLowerCase().startsWith('assets/qa/')) { excludedQa++; continue; }
      if (!path.startsWith('assets/') || !/^[a-f0-9]{64}$/i.test(String(entry.sha256))) throw new Error('Game-set image path or hash is invalid');
      const key = path.toLowerCase(); if (seen.has(key)) throw new Error('Game-set inventory has duplicate image paths'); seen.add(key);
      const file = assetFile(project, path);
      try { const info = statSync(file); if (info.size > 16 * 1024 * 1024 || !info.isFile()) throw new Error('Oversized or invalid file'); }
      catch { throw new Error(`Game-set image is missing, oversized or is not a file: ${path}`); }
      const bytes = fileBytes(file);
      if (!bytes || bytes.length > 16 * 1024 * 1024 || hash(bytes) !== String(entry.sha256).toLowerCase()) throw new Error(`Game-set image is missing, oversized or has changed: ${path}`);
      if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`Game-set image has no PNG header: ${path}`);
      checked.set(file, hash(bytes));
      if (existing.has(key)) { skipped++; continue; }
      let id = basename(path).replace(/\.png$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
      if (!/^[a-zA-Z0-9]/.test(id)) id = 'imported_' + id;
      if (ids.has(id)) id += '_' + hash(Buffer.from(path)).slice(0, 10);
      if (ids.has(id)) throw new Error('Imported asset identity conflicts with the registry'); ids.add(id);
      added.push({ id, path, type: 'texture', manual: true, sourceType: 'imported', maturity: 'QA_REVIEW', productionReady: false,
        license: 'Unknown; imported game-set artwork', commercialUse: 'unknown',
        metadata: { gameSetSha256: checked.get(file), provenance: 'Project GAME_SET.json inventory; image bytes verified. Provider, license and art approval are not inferred.' } });
    }
    if (!added.length) return { success: true as const, added: 0, skipped, excludedQa };
    if (!sameBytes(setBytes, fileBytes(setPath)) || !sameBytes(manifestBytes, fileBytes(manifestPath))) throw new Error('Game set or registry changed during import; retry');
    for (const [file, expected] of checked) { const bytes = fileBytes(file); if (!bytes || hash(bytes) !== expected) throw new Error('Artwork changed during import; retry'); }
    const commandId = randomUUID(), folder = `.metroforge/game-set-import/${commandId}`;
    const receipt = { version: 1, commandId, added: added.map(row => ({ id: row.id, path: row.path, sha256: (row.metadata as Record<string, unknown>).gameSetSha256 })), skipped, excludedQa,
      scope: 'Registry admission only. Artwork, runtime, genre and existing asset records are preserved; license and production status remain unverified.' };
    commitAssetFiles(new Map([
      [assetFile(project, `${folder}/manifest.before.json`), manifestBytes],
      [assetFile(project, `${folder}/receipt.json`), Buffer.from(JSON.stringify(receipt, null, 2))],
      [manifestPath, Buffer.from(JSON.stringify({ ...manifest, artifacts: [...artifacts, ...added] }, null, 2))],
    ]));
    return { success: true as const, added: added.length, skipped, excludedQa, commandId };
  } finally { unlock(); }
}
