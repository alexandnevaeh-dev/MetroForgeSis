import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SettingsRepository } from './repositories/settings.js';
import { runMigrations } from './migrations.js';
import { openSqliteDatabase } from './sqlite.js';

describe('SettingsRepository', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'metroforge-settings-'));
    dbPath = join(dir, 'test.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function openRepo() {
    const db = await openSqliteDatabase(dbPath);
    runMigrations(db);
    return { db, repo: new SettingsRepository(db) };
  }

  it('sets and gets values', async () => {
    const { db, repo } = await openRepo();
    repo.set('app.defaultProfile', 'STANDARD');
    expect(repo.get('app.defaultProfile')).toBe('STANDARD');
    db.close();
  });

  it('upserts on conflict', async () => {
    const { db, repo } = await openRepo();
    repo.set('app.defaultMode', 'LOCAL_ONLY');
    repo.set('app.defaultMode', 'HYBRID_FREE');
    expect(repo.get('app.defaultMode')).toBe('HYBRID_FREE');
    db.close();
  });

  it('lists by prefix', async () => {
    const { db, repo } = await openRepo();
    repo.setMany({ 'app.a': '1', 'app.b': '2', 'other.c': '3' });
    expect(repo.list('app.').map((r: { key: string }) => r.key)).toEqual(['app.a', 'app.b']);
    db.close();
  });
});
