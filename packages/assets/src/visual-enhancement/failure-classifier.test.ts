import { describe, expect, it } from 'vitest';
import { classifyVisualFailure, isRetryableWithinProvider, isTerminalForProvider } from './failure-classifier.js';

describe('classifyVisualFailure', () => {
  it('classifies auth failures from status or message', () => {
    expect(classifyVisualFailure(new Error('unauthorized'), 401)).toBe('AUTH');
    expect(classifyVisualFailure(new Error('unauthorized'), 403)).toBe('AUTH');
    expect(classifyVisualFailure(new Error('authentication failed'))).toBe('AUTH');
  });

  it('classifies rate limiting', () => {
    expect(classifyVisualFailure(new Error('too many requests'), 429)).toBe('RATE_LIMIT');
    expect(classifyVisualFailure(new Error('rate limit exceeded'))).toBe('RATE_LIMIT');
  });

  it('classifies timeouts, including AbortError from a raced timeout', () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    expect(classifyVisualFailure(abortErr)).toBe('TIMEOUT');
    expect(classifyVisualFailure(new Error('request timed out after 45000ms'))).toBe('TIMEOUT');
    expect(classifyVisualFailure(new Error('gateway timeout'), 504)).toBe('TIMEOUT');
  });

  it('classifies 5xx as SERVER_ERROR', () => {
    expect(classifyVisualFailure(new Error('internal error'), 500)).toBe('SERVER_ERROR');
    expect(classifyVisualFailure(new Error('bad gateway'), 502)).toBe('SERVER_ERROR');
  });

  it('classifies model-not-found / unsupported-capability', () => {
    expect(classifyVisualFailure(new Error('model not found'), 404)).toBe('MODEL_UNAVAILABLE');
    expect(classifyVisualFailure(new Error('model does not support IMAGE_EDIT'))).toBe('UNSUPPORTED_CAPABILITY');
  });

  it('classifies network failures', () => {
    expect(classifyVisualFailure(new Error('fetch failed'))).toBe('NETWORK');
    expect(classifyVisualFailure(new Error('ECONNREFUSED'))).toBe('NETWORK');
  });

  it('classifies invalid/corrupt image output', () => {
    expect(classifyVisualFailure(new Error('NVIDIA image payload too small — likely blank/corrupt response'))).toBe(
      'INVALID_IMAGE',
    );
  });

  it('classifies pipeline-side validation rejection', () => {
    expect(classifyVisualFailure(new Error('validation failed: near-solid color, no visible subject detail'))).toBe(
      'VALIDATION_REJECTED',
    );
  });

  it('falls back to UNKNOWN for unrecognized errors', () => {
    expect(classifyVisualFailure(new Error('something bizarre happened'))).toBe('UNKNOWN');
  });
});

describe('isRetryableWithinProvider / isTerminalForProvider', () => {
  it('TIMEOUT/SERVER_ERROR/RATE_LIMIT are retryable within the same provider', () => {
    expect(isRetryableWithinProvider('TIMEOUT')).toBe(true);
    expect(isRetryableWithinProvider('SERVER_ERROR')).toBe(true);
    expect(isRetryableWithinProvider('RATE_LIMIT')).toBe(true);
    expect(isRetryableWithinProvider('AUTH')).toBe(false);
  });

  it('AUTH/UNSUPPORTED_CAPABILITY/MODEL_UNAVAILABLE are terminal for the provider', () => {
    expect(isTerminalForProvider('AUTH')).toBe(true);
    expect(isTerminalForProvider('UNSUPPORTED_CAPABILITY')).toBe(true);
    expect(isTerminalForProvider('MODEL_UNAVAILABLE')).toBe(true);
    expect(isTerminalForProvider('TIMEOUT')).toBe(false);
  });
});
