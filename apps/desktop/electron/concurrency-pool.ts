export type WorkerCategory = 'llm' | 'image' | 'audio' | 'cpu';

export interface ConcurrencyLimits {
  llm: number;
  image: number;
  audio: number;
  cpu: number;
}

export const DEFAULT_CONCURRENCY: ConcurrencyLimits = {
  llm: 2,
  image: 1,
  audio: 1,
  cpu: 2,
};

export class ConcurrencyPool {
  private readonly active = new Map<WorkerCategory, number>();
  private readonly queues = new Map<WorkerCategory, Array<() => void>>();

  constructor(private limits: ConcurrencyLimits = DEFAULT_CONCURRENCY) {
    for (const cat of ['llm', 'image', 'audio', 'cpu'] as WorkerCategory[]) {
      this.active.set(cat, 0);
      this.queues.set(cat, []);
    }
  }

  getStatus(): Record<WorkerCategory, { active: number; limit: number; queued: number }> {
    const out = {} as Record<WorkerCategory, { active: number; limit: number; queued: number }>;
    for (const cat of ['llm', 'image', 'audio', 'cpu'] as WorkerCategory[]) {
      out[cat] = {
        active: this.active.get(cat) ?? 0,
        limit: this.limits[cat],
        queued: this.queues.get(cat)?.length ?? 0,
      };
    }
    return out;
  }

  updateLimits(partial: Partial<ConcurrencyLimits>): void {
    for (const cat of ['llm', 'image', 'audio', 'cpu'] as WorkerCategory[]) {
      if (partial[cat] != null && partial[cat]! > 0) {
        this.limits[cat] = partial[cat]!;
      }
    }
  }

  getLimits(): ConcurrencyLimits {
    return { ...this.limits };
  }

  async run<T>(category: WorkerCategory, fn: () => Promise<T>): Promise<T> {
    await this.acquire(category);
    try {
      return await fn();
    } finally {
      this.release(category);
    }
  }

  private acquire(category: WorkerCategory): Promise<void> {
    const limit = this.limits[category];
    const active = this.active.get(category) ?? 0;
    if (active < limit) {
      this.active.set(category, active + 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queues.get(category)!.push(() => {
        this.active.set(category, (this.active.get(category) ?? 0) + 1);
        resolve();
      });
    });
  }

  private release(category: WorkerCategory): void {
    const active = Math.max(0, (this.active.get(category) ?? 1) - 1);
    this.active.set(category, active);
    const queue = this.queues.get(category)!;
    const next = queue.shift();
    if (next) next();
  }
}
