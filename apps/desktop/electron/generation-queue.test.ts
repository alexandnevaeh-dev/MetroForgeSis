import { describe, expect, it } from 'vitest';
import { GenerationQueue } from './generation-queue.js';

describe('GenerationQueue', () => {
  it('cancels a queued job', async () => {
    const queue = new GenerationQueue();
    let ran = false;

    const job = queue.enqueue({ type: 'generate_game', label: 'test', payload: {} });
    expect(queue.cancel(job.id)).toBe(true);
    expect(queue.get(job.id)?.status).toBe('cancelled');

    queue.setExecutor(async () => {
      ran = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(ran).toBe(false);
  });

  it('aborts a running job via AbortSignal', async () => {
    const queue = new GenerationQueue();
    let sawAbort = false;

    queue.setExecutor(async (job) => {
      await new Promise<void>((resolve, reject) => {
        const signal = job.abortSignal;
        if (!signal) {
          reject(new Error('missing abort signal'));
          return;
        }
        const onAbort = () => {
          sawAbort = true;
          reject(new Error('aborted'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, 500);
      });
    });

    const job = queue.enqueue({ type: 'generate_game', label: 'running', payload: {} });
    await new Promise((r) => setTimeout(r, 10));
    expect(queue.get(job.id)?.status).toBe('running');

    expect(queue.cancel(job.id)).toBe(true);
    await new Promise((r) => setTimeout(r, 30));

    expect(sawAbort).toBe(true);
    expect(queue.get(job.id)?.status).toBe('cancelled');
  });
});
