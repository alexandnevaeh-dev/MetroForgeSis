import type { SqliteDatabase, SqliteStatement } from './types.js';

type NodeStatement = {
  run: (...params: unknown[]) => { changes?: number | bigint };
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Record<string, unknown>[];
};

type NodeDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => NodeStatement;
  close: () => void;
};

class NodeSqliteStatement implements SqliteStatement {
  constructor(private readonly stmt: NodeStatement) {}

  run(...params: unknown[]): { changes: number } {
    const result =
      params.length === 1 && isNamedParams(params[0])
        ? this.stmt.run(params[0])
        : this.stmt.run(...params);
    return { changes: Number(result.changes ?? 0) };
  }

  get(...params: unknown[]): Record<string, unknown> | undefined {
    if (params.length === 1 && isNamedParams(params[0])) {
      return this.stmt.get(params[0]);
    }
    return this.stmt.get(...params);
  }

  all(...params: unknown[]): Record<string, unknown>[] {
    if (params.length === 1 && isNamedParams(params[0])) {
      return this.stmt.all(params[0]);
    }
    return this.stmt.all(...params);
  }
}

class NodeSqliteDatabase implements SqliteDatabase {
  constructor(private readonly db: NodeDatabase) {}

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): SqliteStatement {
    return new NodeSqliteStatement(this.db.prepare(sql));
  }

  close(): void {
    this.db.close();
  }
}

export async function openNodeSqliteDatabase(dbPath: string): Promise<SqliteDatabase> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath) as NodeDatabase;
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return new NodeSqliteDatabase(db);
}

function isNamedParams(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
