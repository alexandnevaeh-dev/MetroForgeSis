import type { SqliteDatabase } from '../types.js';
import { generateId } from '@metroforge/shared';

export interface ValidationResultRecord {
  id: string;
  projectId: string;
  gate: string;
  passed: boolean;
  message: string;
  detailsJson: string;
  timestamp: string;
}

export class ValidationResultRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: {
    projectId: string;
    gate: string;
    passed: boolean;
    message: string;
    details?: Record<string, unknown>;
  }): ValidationResultRecord {
    const record: ValidationResultRecord = {
      id: generateId('val'),
      projectId: input.projectId,
      gate: input.gate,
      passed: input.passed,
      message: input.message,
      detailsJson: JSON.stringify(input.details ?? {}),
      timestamp: new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO validation_results (id, project_id, gate, passed, message, details_json, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.projectId,
        record.gate,
        record.passed ? 1 : 0,
        record.message,
        record.detailsJson,
        record.timestamp,
      );

    return record;
  }

  listByProject(projectId: string): ValidationResultRecord[] {
    return (
      this.db
        .prepare('SELECT * FROM validation_results WHERE project_id = ? ORDER BY timestamp')
        .all(projectId) as Record<string, unknown>[]
    ).map((row) => ({
      id: row.id as string,
      projectId: row.project_id as string,
      gate: row.gate as string,
      passed: Boolean(row.passed),
      message: row.message as string,
      detailsJson: (row.details_json as string) ?? '{}',
      timestamp: row.timestamp as string,
    }));
  }

  deleteByProject(projectId: string): void {
    this.db.prepare('DELETE FROM validation_results WHERE project_id = ?').run(projectId);
  }

  /** Replace the current attempt, including failures, without exposing a partial snapshot. */
  replaceByProject(projectId: string, results: readonly {
    gate: string; passed: boolean; message: string; details?: Record<string, unknown>;
  }[]): ValidationResultRecord[] {
    const timestamp = new Date().toISOString();
    // Serialize before deleting anything: invalid details cannot erase prior evidence.
    const records = results.map(input => ({id:generateId('val'),projectId,gate:input.gate,
      passed:input.passed,message:input.message,detailsJson:JSON.stringify(input.details??{}),timestamp}));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.deleteByProject(projectId);
      const insert=this.db.prepare(`INSERT INTO validation_results
        (id, project_id, gate, passed, message, details_json, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for(const record of records)insert.run(record.id,projectId,record.gate,record.passed?1:0,record.message,record.detailsJson,timestamp);
      this.db.exec('COMMIT');
      return records;
    } catch(error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
