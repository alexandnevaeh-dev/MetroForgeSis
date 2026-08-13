import type { SqliteDatabase } from '../types.js';
import { generateId } from '@metroforge/shared';

export interface ArtifactRecord {
  id: string;
  jobId: string;
  type: string;
  path: string;
  provider: string | null;
  model: string | null;
  promptHash: string | null;
  seed: number | null;
  license: string | null;
  timestamp: string;
  validationState: string;
  fallbackGenerated: boolean;
  metadataJson: string;
}

export class ArtifactRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: {
    jobId: string;
    type: string;
    path: string;
    provider?: string;
    model?: string;
    promptHash?: string;
    seed?: number;
    license?: string;
    validationState?: string;
    fallbackGenerated?: boolean;
    metadata?: Record<string, unknown>;
  }): ArtifactRecord {
    const record: ArtifactRecord = {
      id: generateId('art'),
      jobId: input.jobId,
      type: input.type,
      path: input.path,
      provider: input.provider ?? null,
      model: input.model ?? null,
      promptHash: input.promptHash ?? null,
      seed: input.seed ?? null,
      license: input.license ?? null,
      timestamp: new Date().toISOString(),
      validationState: input.validationState ?? 'pending',
      fallbackGenerated: input.fallbackGenerated ?? false,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    };

    this.db
      .prepare(
        `INSERT INTO artifacts (id, job_id, type, path, provider, model, prompt_hash, seed, license, timestamp, validation_state, fallback_generated, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.jobId,
        record.type,
        record.path,
        record.provider,
        record.model,
        record.promptHash,
        record.seed,
        record.license,
        record.timestamp,
        record.validationState,
        record.fallbackGenerated ? 1 : 0,
        record.metadataJson,
      );

    return record;
  }

  listByJob(jobId: string): ArtifactRecord[] {
    return (
      this.db.prepare('SELECT * FROM artifacts WHERE job_id = ? ORDER BY timestamp').all(jobId) as Record<
        string,
        unknown
      >[]
    ).map((row) => ({
      id: row.id as string,
      jobId: row.job_id as string,
      type: row.type as string,
      path: row.path as string,
      provider: row.provider as string | null,
      model: row.model as string | null,
      promptHash: row.prompt_hash as string | null,
      seed: row.seed as number | null,
      license: row.license as string | null,
      timestamp: row.timestamp as string,
      validationState: row.validation_state as string,
      fallbackGenerated: Boolean(row.fallback_generated),
      metadataJson: (row.metadata_json as string) ?? '{}',
    }));
  }
}
