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
  const mirror = join(project, 'Assets', 'StreamingAssets', 'data', 'loot', 'loot_tables.json');
  const mirrorText = existsSync(mirror) ? readFileSync(mirror, 'utf8') : null;
  if (mirrorText !== null && JSON.stringify(JSON.parse(mirrorText)) !== JSON.stringify(JSON.parse(original)))
    throw new Error('Loot runtime copies differ; reconcile them before editing');
  const referenceMirrors = [
    ['items/items.json', itemText],
    ['enemies/enemies.json', enemyText],
  ].map(([relative, source]) => {
    const runtimeFile = join(project, 'Assets', 'StreamingAssets', 'data', relative!);
    const runtimeText = existsSync(runtimeFile) ? readFileSync(runtimeFile, 'utf8') : null;
    if (runtimeText !== null && JSON.stringify(JSON.parse(runtimeText)) !== JSON.stringify(JSON.parse(source!)))
      throw new Error(`Loot referenced runtime catalog differs: ${relative}; reconcile before editing`);
    return runtimeText;
  });
  const data = JSON.parse(original);
  const items = JSON.parse(itemText).items;
  const enemies = JSON.parse(enemyText).enemies;
  if (!Array.isArray(data.tables) || !Array.isArray(items) || !Array.isArray(enemies))
    throw new Error('Project loot, item or enemy catalog is invalid');
  return { file, original, mirror, mirrorText, data, items, enemies, enemyFile, enemyText, enemyMirrorText: referenceMirrors[1] ?? null, revision: digest(JSON.stringify([original, itemText, enemyText, mirrorText, referenceMirrors])) };
}
export function readEditableLoot(project: string) {
  const state = snapshot(project);
  return { tables: state.data.tables as Record<string, unknown>[], items: state.items as Record<string, unknown>[], sources: state.enemies as Record<string, unknown>[], revision: state.revision };
}
/** Edit one existing table, preserving identity, metadata and other authored tables. */
export function saveEditableLoot(project: string, table: unknown, revision: string) {
  return writeEditableLoot(project, table, revision, false);
}
/** Create a distinct drop table without replacing any authored definition. */
export function createEditableLoot(project: string, table: unknown, revision: string) {
  return writeEditableLoot(project, table, revision, true);
}
function writeEditableLoot(project: string, table: unknown, revision: string, create: boolean) {
  const validated = LootTableSchema.parse(table);
  const state = snapshot(project);
  if (state.revision !== revision) throw new Error('Loot or referenced catalog changed; reload before saving');
  const matches = state.data.tables.filter((entry: { id?: string }) => entry.id === validated.id);
  if (create ? matches.length !== 0 : matches.length !== 1)
    throw new Error(create ? 'Loot table ID already exists' : 'Loot table must identify exactly one existing definition');
  const existing = matches[0] ?? {};
  const entries = validated.entries.map(entry => ({
    ...(Array.isArray(existing.entries) ? existing.entries.find((old: { itemId?: string }) => old.itemId === entry.itemId) : {}),
    ...entry,
  }));
  if (create) state.data.tables.push({ ...validated, entries });
  else state.data.tables = state.data.tables.map((entry: { id?: string }) => entry.id === validated.id ? { ...entry, ...validated, entries } : entry);
  validateLootCatalog(state.data.tables, state.items, state.enemies);
  return persistCatalog(project, state, JSON.stringify(state.data, null, 2), revision);
}
/** Set or clear one enemy's drop table; unrelated enemy properties are preserved. */
export function saveEditableLootSource(project: string, sourceId: string, tableId: string | null, revision: string) {
  const state = snapshot(project);
  if (state.revision !== revision) throw new Error('Loot or referenced catalog changed; reload before saving');
  if (typeof sourceId !== 'string' || !sourceId || (tableId !== null && (typeof tableId !== 'string' || !tableId)))
    throw new Error('Choose an enemy and a valid loot table, or clear its assignment');
  const matches = state.enemies.filter((enemy: { id?: string }) => enemy.id === sourceId);
  if (matches.length !== 1) throw new Error('Loot source must identify exactly one existing enemy');
  const catalog = JSON.parse(state.enemyText);
  catalog.enemies = state.enemies.map((enemy: { id?: string; lootTableId?: string }) => {
    if (enemy.id !== sourceId) return enemy;
    const edited = { ...enemy };
    if (tableId === null) delete edited.lootTableId;
    else edited.lootTableId = tableId;
    return edited;
  });
  validateLootCatalog(state.data.tables, state.items, catalog.enemies);
  return persistCatalog(project, { ...state, file: state.enemyFile, original: state.enemyText,
    mirror: join(project, 'Assets', 'StreamingAssets', 'data', 'enemies', 'enemies.json'),
    mirrorText: state.enemyMirrorText }, JSON.stringify(catalog, null, 2), revision);
}
function persistCatalog(project: string, state: ReturnType<typeof snapshot>, output: string, revision: string) {
  const id = randomUUID();
  const backupDir = join(project, '.metroforge', 'loot-edit-backups');
  mkdirSync(backupDir, { recursive: true });
  const backup = join(backupDir, `${id}.json`);
  writeFileSync(backup, state.original, { flag: 'wx' });
  const files = state.mirrorText === null ? [state.file] : [state.file, state.mirror];
  const originals = state.mirrorText === null ? [state.original] : [state.original, state.mirrorText];
  if (state.mirrorText !== null) writeFileSync(join(backupDir, `${id}.runtime.json`), state.mirrorText, { flag: 'wx' });
  const staged = files.map(file => `${file}.${id}.tmp`);
  const replaced: number[] = [];
  try {
    staged.forEach(file => writeFileSync(file, output, { flag: 'wx' }));
    if (snapshot(project).revision !== revision) throw new Error('Loot or referenced catalog changed while saving');
    files.forEach((file, index) => { renameSync(staged[index]!, file); replaced.push(index); });
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const index of replaced) {
      try { writeFileSync(files[index]!, originals[index]!); }
      catch (rollback) { rollbackErrors.push(String(rollback)); }
    }
    if (rollbackErrors.length) throw new Error(`Save failed: ${String(error)}; restore backups at ${backupDir}: ${rollbackErrors.join('; ')}`);
    throw error;
  } finally { staged.forEach(file => { if (existsSync(file)) unlinkSync(file); }); }
  return { revision: snapshot(project).revision, backup, runtimeSynchronized: state.mirrorText !== null, restartRequired: true as const };
}
