import { describe, expect, it, vi, afterEach } from 'vitest';
import { VisualProviderCircuitBreaker } from './circuit-breaker.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('VisualProviderCircuitBreaker', () => {
  it('starts CLOSED and available for an unknown provider', () => {
    const breaker = new VisualProviderCircuitBreaker();
    expect(breaker.state('nvidia')).toBe('CLOSED');
    expect(breaker.isAvailable('nvidia')).toBe(true);
  });

  it('opens after failureThreshold consecutive failures and becomes unavailable', () => {
    const breaker = new VisualProviderCircuitBreaker({ failureThreshold: 2, resetAfterMs: 60_000 });
    breaker.recordFailure('nvidia');
    expect(breaker.isAvailable('nvidia')).toBe(true); // 1 failure — still closed
    breaker.recordFailure('nvidia');
    expect(breaker.state('nvidia')).toBe('OPEN');
    expect(breaker.isAvailable('nvidia')).toBe(false);
  });

  it('a success resets the failure count and closes the circuit', () => {
    const breaker = new VisualProviderCircuitBreaker({ failureThreshold: 2, resetAfterMs: 60_000 });
    breaker.recordFailure('nvidia');
    breaker.recordSuccess('nvidia');
    breaker.recordFailure('nvidia');
    expect(breaker.state('nvidia')).toBe('CLOSED'); // only 1 consecutive failure since the reset
    expect(breaker.isAvailable('nvidia')).toBe(true);
  });

  it('providers are tracked independently', () => {
    const breaker = new VisualProviderCircuitBreaker({ failureThreshold: 1, resetAfterMs: 60_000 });
    breaker.recordFailure('nvidia');
    expect(breaker.isAvailable('nvidia')).toBe(false);
    expect(breaker.isAvailable('pollinations-image')).toBe(true);
  });

  it('allows a HALF_OPEN probe after resetAfterMs elapses, and re-opens on a failed probe', () => {
    vi.useFakeTimers();
    const breaker = new VisualProviderCircuitBreaker({ failureThreshold: 1, resetAfterMs: 1000 });
    breaker.recordFailure('nvidia');
    expect(breaker.isAvailable('nvidia')).toBe(false);

    vi.advanceTimersByTime(1500);
    expect(breaker.isAvailable('nvidia')).toBe(true);
    expect(breaker.state('nvidia')).toBe('HALF_OPEN');

    breaker.recordFailure('nvidia');
    expect(breaker.state('nvidia')).toBe('OPEN');
    expect(breaker.isAvailable('nvidia')).toBe(false);
  });

  it('a successful HALF_OPEN probe fully closes the circuit', () => {
    vi.useFakeTimers();
    const breaker = new VisualProviderCircuitBreaker({ failureThreshold: 1, resetAfterMs: 1000 });
    breaker.recordFailure('nvidia');
    vi.advanceTimersByTime(1500);
    expect(breaker.isAvailable('nvidia')).toBe(true); // moves to HALF_OPEN

    breaker.recordSuccess('nvidia');
    expect(breaker.state('nvidia')).toBe('CLOSED');
  });
});
