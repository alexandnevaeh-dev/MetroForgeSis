import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const mutations = new Set<string>();
export function lockAssetMutation(project: string): () => void {
  const key = resolve(project).toLowerCase();
  if (mutations.has(key)) throw new Error('An artwork update is already running for this project');
  mutations.add(key);
  return () => { mutations.delete(key); };
}

export function assertAssetId(id: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(id)) throw new Error('Invalid asset ID');
}

/** Reject both traversal and linked ancestors, including a linked project root. */
export function assetFile(project: string, path: string): string {
  if (!path || isAbsolute(path) || /[\\:<>"|?*\x00-\x1f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p))) {
    throw new Error('Invalid project asset path');
  }
  const root = resolve(project);
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Asset path escapes project');
  for (let cursor = target; ; cursor = dirname(cursor)) {
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new Error('Linked asset paths cannot be modified');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (dirname(cursor) === cursor) break;
  }
  return target;
}

export function fileBytes(path: string): Buffer | null {
  return existsSync(path) ? readFileSync(path) : null;
}

export function sameBytes(a: Buffer | null, b: Buffer | null): boolean {
  return a === null ? b === null : b !== null && a.equals(b);
}

/** Synchronous promotion: no async work can interleave; retain preimages and roll back failures. */
export function commitAssetFiles(writes: Map<string, Buffer>): void {
  const previous = new Map<string, Buffer | null>();
  const committed: string[] = [];
  let temporary: string | undefined;
  try {
    for (const [path, bytes] of writes) {
      previous.set(path, fileBytes(path));
      mkdirSync(dirname(path), { recursive: true });
      temporary = path + '.metroforge-' + randomUUID() + '.tmp';
      writeFileSync(temporary, bytes, { flag: 'wx' });
      renameSync(temporary, path);
      temporary = undefined;
      committed.push(path);
    }
  } catch (error) {
    if (temporary && existsSync(temporary)) unlinkSync(temporary);
    const failures: string[] = [];
    for (const path of committed.reverse()) {
      try {
        const bytes = previous.get(path)!;
        if (bytes === null) unlinkSync(path);
        else writeFileSync(path, bytes);
      } catch { failures.push(path); }
    }
    if (failures.length) throw new Error(`Asset update failed; rollback needs attention: ${failures.join(', ')}`);
    throw error;
  }
}

export function invalidateAssetValidation(project: string, writes: Map<string, Buffer>): void {
  const path = assetFile(project, 'validation_report.json');
  if (!existsSync(path)) return;
  const report = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  writes.set(path, Buffer.from(JSON.stringify({ ...report, passed: false, productionReady: false,
    validationLevel: 'NEEDS_RUNTIME_VALIDATION', invalidationReason: 'Artwork changed; restart and validate the game before accepting it.' }, null, 2)));
}
