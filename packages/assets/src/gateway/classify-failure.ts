import { GenerationCancelledError } from '@metroforge/shared';
import {
  AuthenticationError,
  LicenseRejectedError,
  QuotaExceededError,
  UnsupportedCapabilityError,
  RateLimitError,
  ProviderUnavailableError,
  CompilationFailedError,
  QARejectedError,
  GenerationFailedError,
} from '../foundry/errors.js';
import type { AssetGenerationFailureClass } from './types.js';

/**
 * Maps a thrown error to a real failure class instead of collapsing everything into
 * "generation failed" (production standard §10/§30). Fallback eligibility is derived from this,
 * never from string-matching a message — see FALLBACK_ELIGIBLE below.
 */
export function classifyFailure(err: unknown): AssetGenerationFailureClass {
  if (err instanceof GenerationCancelledError) return 'cancelled';
  if (err instanceof RateLimitError) return 'rate-limited';
  if (err instanceof ProviderUnavailableError) return 'provider-unavailable';
  if (err instanceof AuthenticationError) return 'authentication';
  if (err instanceof QuotaExceededError) return 'quota';
  if (err instanceof UnsupportedCapabilityError) return 'unsupported-capability';
  if (err instanceof LicenseRejectedError) return 'license-rejection';
  if (err instanceof QARejectedError) return 'qa-failure';
  if (err instanceof CompilationFailedError) return 'post-processing-failure';
  if (err instanceof GenerationFailedError) return 'generation-quality-failure';
  if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'ZodError') {
    return 'invalid-request';
  }
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
  if (message.includes('circuit open') || message.includes('circuit breaker')) return 'circuit-open';
  return 'unknown';
}

/**
 * Whether a `foundry-with-legacy-fallback` gateway may retry a failed request against the legacy
 * backend. Deliberately conservative: cancellation, invalid requests, and anything that reflects
 * an explicit policy/license constraint must never be silently retried on a different backend —
 * that would mean the fallback ships an asset the original request specifically forbade.
 */
export function isFallbackEligible(failureClass: AssetGenerationFailureClass): boolean {
  switch (failureClass) {
    case 'cancelled':
    case 'invalid-request':
    case 'policy-rejection':
    case 'license-rejection':
      return false;
    default:
      return true;
  }
}
