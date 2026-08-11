import type { SqliteDatabase } from './types.js';
import { openSqlJsDatabase } from './sqljs.js';

let nodeSqliteAvailable: boolean | null = null;

function isElectronRuntime(): boolean {
  return typeof process !== 'undefined' && process.versions.electron != null;
}

async function canUseNodeSqlite(): Promise<boolean> {
  if (isElectronRuntime()) return false;
  if (nodeSqliteAvailable !== null) return nodeSqliteAvailable;
  try {
    await import('node:sqlite');
    nodeSqliteAvailable = true;
  } catch {
    nodeSqliteAvailable = false;
  }
  return nodeSqliteAvailable;
}

export async function openSqliteDatabase(dbPath: string): Promise<SqliteDatabase> {
  if (await canUseNodeSqlite()) {
    const { openNodeSqliteDatabase } = await import('./node-sqlite.js');
    return await openNodeSqliteDatabase(dbPath);
  }
  return openSqlJsDatabase(dbPath);
}

export type { SqliteDatabase } from './types.js';
