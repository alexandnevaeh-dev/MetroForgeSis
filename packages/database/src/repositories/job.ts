import type { SqliteDatabase } from '../types.js';
import type { GenerationJob, GenerationStage } from '@metroforge/schemas';
import { GenerationJobSchema, GenerationStageSchema } from '@metroforge/schemas';
import { generateId, GENERATION_PHASES } from '@metroforge/shared';

export class JobRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(projectId: string, profile: GenerationJob['profile'], mode: GenerationJob['mode'], seed: number): GenerationJob {
    const now = new Date().toISOString();
    const job: GenerationJob = {
      id: generateId('job'),
      projectId,
      correlationId: generateId('corr'),
      profile,
      mode,
      seed,
      status: 'pending',
      currentPhase: null,
      createdAt: now,
      updatedAt: now,
      stages: GENERATION_PHASES.map((phase) => ({
        id: generateId('stage'),
        jobId: '',
        phase,
        status: 'PENDING',
        startedAt: null,
        completedAt: null,
        error: null,
        artifacts: [],
      })),
    };
    job.stages = job.stages.map((s) => ({ ...s, jobId: job.id }));

    this.db
      .prepare(
        `INSERT INTO generation_jobs (id, project_id, correlation_id, profile, mode, seed, status, current_phase, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        job.id,
        job.projectId,
        job.correlationId,
        job.profile,
        job.mode,
        job.seed,
        job.status,
        job.currentPhase,
        job.createdAt,
        job.updatedAt,
      );

    const insertStage = this.db.prepare(
      `INSERT INTO generation_stages (id, job_id, phase, status, started_at, completed_at, error, artifacts_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const stage of job.stages) {
      insertStage.run(
        stage.id,
        stage.jobId,
        stage.phase,
        stage.status,
        stage.startedAt,
        stage.completedAt,
        stage.error,
        JSON.stringify(stage.artifacts),
      );
    }

    return GenerationJobSchema.parse(job);
  }

  findById(id: string): GenerationJob | null {
    const row = this.db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;

    const stageRows = this.db
      .prepare('SELECT * FROM generation_stages WHERE job_id = ? ORDER BY rowid')
      .all(id) as Record<string, unknown>[];

    const stages: GenerationStage[] = stageRows.map((s) =>
      GenerationStageSchema.parse({
        id: s.id,
        jobId: s.job_id,
        phase: s.phase,
        status: s.status,
        startedAt: s.started_at,
        completedAt: s.completed_at,
        error: s.error,
        artifacts: JSON.parse((s.artifacts_json as string) ?? '[]'),
      }),
    );

    return GenerationJobSchema.parse({
      id: row.id,
      projectId: row.project_id,
      correlationId: row.correlation_id,
      profile: row.profile,
      mode: row.mode,
      seed: row.seed,
      status: row.status,
      currentPhase: row.current_phase,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      stages,
    });
  }

  updateStageStatus(
    stageId: string,
    status: GenerationStage['status'],
    error: string | null = null,
  ): void {
    const now = new Date().toISOString();
    if (status === 'RUNNING') {
      this.db
        .prepare('UPDATE generation_stages SET status = ?, started_at = ? WHERE id = ?')
        .run(status, now, stageId);
    } else if (status === 'PASSED' || status === 'FAILED' || status === 'SKIPPED') {
      this.db
        .prepare('UPDATE generation_stages SET status = ?, completed_at = ?, error = ? WHERE id = ?')
        .run(status, now, error, stageId);
    } else {
      this.db.prepare('UPDATE generation_stages SET status = ? WHERE id = ?').run(status, stageId);
    }
  }

  updateJobStatus(jobId: string, status: GenerationJob['status'], currentPhase: string | null): void {
    this.db
      .prepare('UPDATE generation_jobs SET status = ?, current_phase = ?, updated_at = ? WHERE id = ?')
      .run(status, currentPhase, new Date().toISOString(), jobId);
  }
}
