import type { SqliteDatabase } from './types.js';

export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        profile TEXT NOT NULL,
        mode TEXT NOT NULL,
        seed INTEGER NOT NULL,
        output_path TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS generation_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        correlation_id TEXT NOT NULL,
        profile TEXT NOT NULL,
        mode TEXT NOT NULL,
        seed INTEGER NOT NULL,
        status TEXT NOT NULL,
        current_phase TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS generation_stages (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES generation_jobs(id),
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error TEXT,
        artifacts_json TEXT DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES generation_jobs(id),
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        prompt_hash TEXT,
        seed INTEGER,
        license TEXT,
        timestamp TEXT NOT NULL,
        validation_state TEXT NOT NULL DEFAULT 'pending',
        fallback_generated INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS validation_results (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        gate TEXT NOT NULL,
        passed INTEGER NOT NULL,
        message TEXT NOT NULL,
        details_json TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

export function runMigrations(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version,
    ),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec(migration.sql);
    db.prepare('INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      migration.version,
      new Date().toISOString(),
    );
  }
}
