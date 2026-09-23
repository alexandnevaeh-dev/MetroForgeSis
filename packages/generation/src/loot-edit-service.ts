import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { LootTableSchema, validateLootCatalog } from '@metroforge/schemas';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
function snapshot(project: string) {
  const file = join(project, 'data', 'loot', 'loot_tables.json');
  const original = readFileSync(file, 'utf8');
  const itemText = readFileSync(join(project, 'data', 'items', 'items.json'), 'utf8');
  const enemyFile = join(project, 'data', 'enemies', 'enemies.json');
  const enemyText = existsSync(enemyFile) ? readFileSync(enemyFile, 'utf8') : '{"enemies":[]}';
  const data = JSON.parse(original);
  const items = JSON.parse(itemText).items;
  const enemies = JSON.parse(enemyText).enemies;
  if (!Array.isArray(data.tables) || !Array.isArray(items) || !Array.isArray(enemies))
    throw new Error('Project loot, item or enemy catalog is invalid');
  return { file, original, data, items, enemies, revision: digest(JSON.stringify([original, itemText, enemyText])) };
}
export function readEditableLoot(project: string) {
  const state = snapshot(project);
  return { tables: state.data.tables as Record<string, unknown>[], items: state.items as Record<string, unknown>[], revision: state.revision };
}
/** Edit one existing table, preserving identity, metadata and other authored tables. */
export function saveEditableLoot(project: string, table: unknown, revision: string) {
  const validated = LootTableSchema.parse(table);
  const state = snapshot(project);
  if (state.revision !== revision) throw new Error('Loot or referenced catalog changed; reload before saving');
  const matches = state.data.tables.filter((entry: { id?: string }) => entry.id === validated.id);
  if (matches.length !== 1) throw new Error('Loot table must identify exactly one existing definition');
  const existing = matches[0];
  const entries = validated.entries.map(entry => ({
    ...(Array.isArray(existing.entries) ? existing.entries.find((old: { itemId?: string }) => old.itemId === entry.itemId) : {}),
    ...entry,
  }));
  state.data.tables = state.data.tables.map((entry: { id?: string }) => entry.id === validated.id ? { ...entry, ...validated, entries } : entry);
  validateLootCatalog(state.data.tables, state.items, state.enemies);
  const output = JSON.stringify(state.data, null, 2);
  const id = randomUUID();
  const backupDir = join(project, '.metroforge', 'loot-edit-backups');
  mkdirSync(backupDir, { recursive: true });
  const backup = join(backupDir, `${id}.json`);
  writeFileSync(backup, state.original, { flag: 'wx' });
  const staged = `${state.file}.${id}.tmp`;
  try {
    writeFileSync(staged, output, { flag: 'wx' });
    if (snapshot(project).revision !== revision) throw new Error('Loot or referenced catalog changed while saving');
    renameSync(staged, state.file);
  } finally { if (existsSync(staged)) unlinkSync(staged); }
  return { revision: snapshot(project).revision, backup, restartRequired: true as const };
}
