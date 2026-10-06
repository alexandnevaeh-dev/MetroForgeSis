import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ItemSchema } from '@metroforge/schemas';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const itemPath = (project: string) => join(project, 'data', 'items', 'items.json');
function snapshot(project: string) {
  const file = itemPath(project);
  const original = readFileSync(file, 'utf8');
  const mirror = join(project, 'Assets', 'StreamingAssets', 'data', 'items', 'items.json');
  const mirrorText = existsSync(mirror) ? readFileSync(mirror, 'utf8') : null;
  const data = JSON.parse(original);
  if (!Array.isArray(data.items)) throw new Error('Project item catalog is invalid');
  if (mirrorText !== null && JSON.stringify(JSON.parse(mirrorText)) !== JSON.stringify(data))
    throw new Error('Item runtime copies differ; reconcile them before editing');
  return { file, original, mirror, mirrorText, data, revision: digest(JSON.stringify([original, mirrorText])) };
}
export function readEditableItems(project: string) {
  const state = snapshot(project);
  return { items: state.data.items as Record<string, unknown>[], revision: state.revision };
}
/** Replace an existing definition without changing its identity or unrelated catalog data. */
export function saveEditableItem(project: string, item: unknown, revision: string) {
  const validated = ItemSchema.parse(item);
  const state = snapshot(project);
  const { file, original, data } = state;
  if (state.revision !== revision) throw new Error('Item catalog changed; reload before saving');
  const matches = data.items.filter((entry: {id?: string}) => entry.id === validated.id);
  if (matches.length !== 1) throw new Error('Item must identify exactly one existing definition');
  data.items = data.items.map((entry: {id?: string}) => entry.id === validated.id ? {...entry, ...validated} : entry);
  const output = JSON.stringify(data, null, 2);
  const id = randomUUID();
  const backup = join(project, '.metroforge', 'item-edit-backups', `${id}.json`);
  mkdirSync(join(project, '.metroforge', 'item-edit-backups'), { recursive: true });
  writeFileSync(backup, original, { flag: 'wx' });
  const files = state.mirrorText === null ? [file] : [file, state.mirror];
  const originals = state.mirrorText === null ? [original] : [original, state.mirrorText];
  if (state.mirrorText !== null) writeFileSync(`${backup}.runtime.json`, state.mirrorText, { flag: 'wx' });
  const staged = files.map(path => `${path}.${id}.tmp`);
  const replaced: number[] = [];
  try {
    staged.forEach(path => writeFileSync(path, output, { flag: 'wx' }));
    if (snapshot(project).revision !== revision) throw new Error('Item catalog changed while saving');
    files.forEach((path, index) => { renameSync(staged[index]!, path); replaced.push(index); });
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const index of replaced) {
      try { writeFileSync(files[index]!, originals[index]!); }
      catch (rollback) { rollbackErrors.push(String(rollback)); }
    }
    if (rollbackErrors.length) throw new Error(`Save failed: ${String(error)}; restore backups at ${backup}: ${rollbackErrors.join('; ')}`);
    throw error;
  } finally { staged.forEach(path => { if (existsSync(path)) unlinkSync(path); }); }
  return { revision: snapshot(project).revision, backup, runtimeSynchronized: state.mirrorText !== null, restartRequired: true as const };
}
