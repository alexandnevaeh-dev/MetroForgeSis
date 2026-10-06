import { describe, expect, it, vi } from 'vitest';
import { DiffusersProvider } from './diffusers.js';

describe('prompt preflight startup allowance', () => {
  it.each([undefined, 250_000])('passes the cold-start allowance to the worker (%s)', async (timeout) => {
    const provider = new DiffusersProvider({ workerPath: import.meta.filename, promptCheckTimeoutMs: timeout });
    const run = vi.spyOn(provider as any, 'runWorker').mockResolvedValue({ ok: true, anyOverflow: false });
    expect((await provider.checkPromptBudget('knight')).ok).toBe(true);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ action: 'check_prompt' }), { timeoutMs: timeout ?? 120_000 });
  });
  it('keeps a worker timeout distinct from token overflow', async () => {
    const provider = new DiffusersProvider({ workerPath: import.meta.filename });
    vi.spyOn(provider as any, 'runWorker').mockRejectedValue(new Error('worker startup timed out'));
    const result = await provider.checkPromptBudget('knight');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('startup timed out');
    expect(result.anyOverflow).toBeUndefined();
  });
  it.each([0, -1, Infinity, NaN])('rejects an invalid allowance (%s)', (timeout) => {
    expect(() => new DiffusersProvider({ promptCheckTimeoutMs: timeout })).toThrow(RangeError);
  });
});
