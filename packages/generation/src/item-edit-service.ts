import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ItemSchema } from '@metroforge/schemas';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const itemPath = (project: string) => join(project, 'data', 'items', 'items.json');
export function readEditableItems(project: string) {
  const text = readFileSync(itemPath(project), 'utf8');
  const data = JSON.parse(text);
  if (!Array.isArray(data.items)) throw new Error('Project item catalog is invalid');
  return { items: data.items as Record<string, unknown>[], revision: digest(text) };
}
/** Replace an existing definition without changing its identity or unrelated catalog data. */
export function saveEditableItem(project: string, item: unknown, revision: string) {
  const validated = ItemSchema.parse(item);
  const file = itemPath(project);
  const original = readFileSync(file, 'utf8');
  if (digest(original) !== revision) throw new Error('Item catalog changed; reload before saving');
  const data = JSON.parse(original);
  if (!Array.isArray(data.items)) throw new Error('Project item catalog is invalid');
  const matches = data.items.filter((entry: {id?: string}) => entry.id === validated.id);
  if (matches.length !== 1) throw new Error('Item must identify exactly one existing definition');
  data.items = data.items.map((entry: {id?: string}) => entry.id === validated.id ? {...entry, ...validated} : entry);
  const output = JSON.stringify(data, null, 2);
  const id = randomUUID();
  const backup = join(project, '.metroforge', 'item-edit-backups', `${id}.json`);
  mkdirSync(join(project, '.metroforge', 'item-edit-backups'), { recursive: true });
  writeFileSync(backup, original, { flag: 'wx' });
  const staged = `${file}.${id}.tmp`;
  try {
    writeFileSync(staged, output, { flag: 'wx' });
    if (digest(readFileSync(file, 'utf8')) !== revision) throw new Error('Item catalog changed while saving');
    renameSync(staged, file);
  } finally { if (existsSync(staged)) unlinkSync(staged); }
  return { revision: digest(output), backup, restartRequired: true as const };
}
