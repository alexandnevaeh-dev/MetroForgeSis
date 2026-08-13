import { generateId } from '@metroforge/shared';
import type { GenerationMode, GenerationProfile } from '@metroforge/shared';

export type QueueJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface QueueJob {
  id: string;
  type: 'generate_game' | 'generate_asset' | 'regenerate_room' | 'recompile_rooms';
  status: QueueJobStatus;
  label: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress?: number;
  error?: string;
  payload: Record<string, unknown>;
  /** Set while the job is running — use to cooperatively cancel long work. */
  abortSignal?: AbortSignal;
  /** Set by cancel() while running so pump can distinguish abort from failure. */
  cancelRequested?: boolean;
}

export class GenerationQueue {
  private jobs: QueueJob[] = [];
  private running = false;
  private readonly maxConcurrent = 1;
  private executor: ((job: QueueJob) => Promise<void>) | null = null;
  private readonly abortControllers = new Map<string, AbortController>();

  setExecutor(fn: (job: QueueJob) => Promise<void>): void {
    this.executor = fn;
  }

  enqueue(job: Omit<QueueJob, 'id' | 'status' | 'createdAt'>): QueueJob {
    const entry: QueueJob = {
      ...job,
      id: generateId('qjob'),
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    this.jobs.unshift(entry);
    void this.pump();
    return entry;
  }

  list(): QueueJob[] {
    return [...this.jobs];
  }

  get(id: string): QueueJob | null {
    return this.jobs.find((j) => j.id === id) ?? null;
  }

  cancel(id: string): boolean {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return false;
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      job.error = 'Cancelled';
      return true;
    }
    if (job.status === 'running') {
      job.cancelRequested = true;
      this.abortControllers.get(id)?.abort();
      job.status = 'cancelled';
      job.error = 'Cancelled';
      return true;
    }
    return false;
  }

  private async pump(): Promise<void> {
    if (this.running || !this.executor) return;
    const active = this.jobs.filter((j) => j.status === 'running').length;
    if (active >= this.maxConcurrent) return;

    const next = [...this.jobs].reverse().find((j) => j.status === 'queued');
    if (!next) return;

    this.running = true;
    next.status = 'running';
    next.startedAt = new Date().toISOString();
    const abortController = new AbortController();
    this.abortControllers.set(next.id, abortController);
    next.abortSignal = abortController.signal;

    try {
      await this.executor(next);
      if (next.status === 'running') {
        next.status = 'completed';
        next.completedAt = new Date().toISOString();
      } else if (next.cancelRequested) {
        next.completedAt = new Date().toISOString();
      }
    } catch (err) {
      if (!next.cancelRequested) {
        next.status = 'failed';
        next.error = err instanceof Error ? err.message : String(err);
        next.completedAt = new Date().toISOString();
      }
    } finally {
      this.abortControllers.delete(next.id);
      delete next.abortSignal;
      this.running = false;
      void this.pump();
    }
  }
}

export interface GenerateGameQueuePayload {
  prompt: string;
  profile: GenerationProfile;
  mode: GenerationMode;
  seed: number;
  cwd: string;
}
