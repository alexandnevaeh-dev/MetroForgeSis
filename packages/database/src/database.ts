import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { runMigrations } from './migrations.js';
import { ProjectRepository } from './repositories/project.js';
import { JobRepository } from './repositories/job.js';
import { openSqliteDatabase, type SqliteDatabase } from './sqlite.js';

export class MetroForgeDatabase {
  readonly db: SqliteDatabase;
  readonly projects: ProjectRepository;
  readonly jobs: JobRepository;

  private constructor(db: SqliteDatabase) {
    this.db = db;
    this.projects = new ProjectRepository(db);
    this.jobs = new JobRepository(db);
  }

  static async open(dbPath: string): Promise<MetroForgeDatabase> {
    mkdirSync(join(dbPath, '..'), { recursive: true });
    const db = await openSqliteDatabase(dbPath);
    runMigrations(db);
    return new MetroForgeDatabase(db);
  }

  close(): void {
    this.db.close();
  }
}

export async function createDatabase(dataDir: string): Promise<MetroForgeDatabase> {
  const dbPath = join(dataDir, 'metroforge.db');
  return MetroForgeDatabase.open(dbPath);
}
