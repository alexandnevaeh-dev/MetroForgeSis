import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import initSqlJs, { type Database, type Statement } from 'sql.js';
import type { SqliteDatabase, SqliteStatement } from './types.js';

let sqlModulePromise: ReturnType<typeof initSqlJs> | null = null;

async function getSqlModule() {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs();
  }
  return sqlModulePromise;
}

function isNamedParams(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class SqlJsStatement implements SqliteStatement {
  constructor(
    private readonly db: Database,
    private readonly sql: string,
    private readonly persist: () => void,
  ) {}

  run(...params: unknown[]): { changes: number } {
    if (params.length === 1 && isNamedParams(params[0])) {
      this.db.run(this.sql, params[0] as Record<string, string | number | null>);
    } else {
      this.db.run(this.sql, params as Array<string | number | null>);
    }
    this.persist();
    return { changes: this.db.getRowsModified() };
  }

  get(...params: unknown[]): Record<string, unknown> | undefined {
    const stmt = this.prepareBound(params);
    try {
      if (stmt.step()) {
        return stmt.getAsObject() as Record<string, unknown>;
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params: unknown[]): Record<string, unknown>[] {
    const stmt = this.prepareBound(params);
    const rows: Record<string, unknown>[] = [];
    try {
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, unknown>);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  private prepareBound(params: unknown[]): Statement {
    const stmt = this.db.prepare(this.sql);
    if (params.length === 0) return stmt;
    if (params.length === 1 && isNamedParams(params[0])) {
      stmt.bind(params[0] as Record<string, string | number | null>);
    } else {
      stmt.bind(params as Array<string | number | null>);
    }
    return stmt;
  }
}

class SqlJsDatabase implements SqliteDatabase {
  readonly #db: Database;
  readonly #dbPath: string;

  constructor(db: Database, dbPath: string) {
    this.#db = db;
    this.#dbPath = dbPath;
  }

  exec(sql: string): void {
    this.#db.exec(sql);
    this.persist();
  }

  prepare(sql: string): SqliteStatement {
    return new SqlJsStatement(this.#db, sql, () => this.persist());
  }

  close(): void {
    this.persist();
    this.#db.close();
  }

  private persist(): void {
    const data = this.#db.export();
    writeFileSync(this.#dbPath, Buffer.from(data));
  }
}

export async function openSqlJsDatabase(dbPath: string): Promise<SqliteDatabase> {
  const SQL = await getSqlModule();
  const db = existsSync(dbPath)
    ? new SQL.Database(readFileSync(dbPath))
    : new SQL.Database();
  db.exec('PRAGMA foreign_keys = ON');
  return new SqlJsDatabase(db, dbPath);
}
