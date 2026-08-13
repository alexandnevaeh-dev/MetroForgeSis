import { describe, expect, it } from 'vitest';
import { GenerationCancelledError, mergeAbortSignal, throwIfCancelled } from './cancellation.js';

describe('throwIfCancelled', () => {
  it('does nothing when signal is absent', () => {
    expect(() => throwIfCancelled(undefined)).not.toThrow();
  });

  it('does nothing when signal is not aborted', () => {
    const controller = new AbortController();
    expect(() => throwIfCancelled(controller.signal)).not.toThrow();
  });

  it('throws GenerationCancelledError when signal is aborted', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfCancelled(controller.signal)).toThrow(GenerationCancelledError);
  });
});

describe('mergeAbortSignal', () => {
  it('returns a timeout signal when no caller signal is provided', () => {
    expect(mergeAbortSignal(undefined, 5000)).toBeInstanceOf(AbortSignal);
  });

  it('returns the caller signal when no timeout is provided', () => {
    const controller = new AbortController();
    expect(mergeAbortSignal(controller.signal)).toBe(controller.signal);
  });
});
