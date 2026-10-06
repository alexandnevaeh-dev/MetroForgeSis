import type { VisualFailureCategory } from './types.js';

/**
 * Classifies a caught provider error/message into a routing-relevant category. Deliberately
 * string/status-pattern based rather than provider-specific — every provider adapter throws
 * differently (NvidiaStructuredError, plain Error, HTTP Response text, AbortError from a timed-out
 * fetch), so this looks at the normalized (message, httpStatus) pair every adapter can produce.
 */
function extractHttpStatusFromError(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    const candidate = rec.httpStatus ?? rec.status ?? rec.statusCode;
    if (typeof candidate === 'number') return candidate;
  }
  return undefined;
}

export function classifyVisualFailure(err: unknown, httpStatus?: number): VisualFailureCategory {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  // Prefer an explicit status, then one carried on the error object (NvidiaStructuredError etc.),
  // then a literal "HTTP 5xx"/"HTTP 4xx" mentioned in the message text as a last resort — several
  // providers' plain Error messages embed the status without a structured field for it.
  const messageStatusMatch = lower.match(/\bhttp\s*(\d{3})\b/);
  httpStatus = httpStatus ?? extractHttpStatusFromError(err) ?? (messageStatusMatch ? Number(messageStatusMatch[1]) : undefined);

  if (httpStatus === 401 || httpStatus === 403 || /auth/i.test(lower)) return 'AUTH';
  if (httpStatus === 429 || /rate.?limit/i.test(lower)) return 'RATE_LIMIT';
  if (
    httpStatus === 408 ||
    httpStatus === 504 ||
    /timed?.?out|timeout|aborterror/i.test(lower) ||
    (err instanceof Error && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'TimeoutError')
  ) {
    return 'TIMEOUT';
  }
  if (httpStatus !== undefined && httpStatus >= 500) return 'SERVER_ERROR';
  if (httpStatus === 404 || /model.*not.?found|model.*unavailable/i.test(lower)) return 'MODEL_UNAVAILABLE';
  if (/unsupported|does not support|not.?configured/i.test(lower)) return 'UNSUPPORTED_CAPABILITY';
  if (/network|econnrefused|enotfound|fetch failed|unreachable/i.test(lower)) return 'NETWORK';
  if (/invalid.*image|corrupt|blank|undecodable|empty image/i.test(lower)) return 'INVALID_IMAGE';
  if (/validation failed/i.test(lower)) return 'VALIDATION_REJECTED';
  if (httpStatus !== undefined && httpStatus >= 400) return 'BAD_RESPONSE';
  return 'UNKNOWN';
}

/** Whether a failure of this category should even be retried against the SAME provider before
 *  moving on — matches the routing table in the task spec (AUTH/UNSUPPORTED never retry the same
 *  provider; TIMEOUT/SERVER_ERROR get bounded retries elsewhere via maxAttemptsPerProvider). */
export function isRetryableWithinProvider(category: VisualFailureCategory): boolean {
  return category === 'TIMEOUT' || category === 'SERVER_ERROR' || category === 'RATE_LIMIT';
}

/** Whether this failure should immediately disable the provider for the rest of the run,
 *  regardless of the circuit breaker's failure-count threshold (AUTH/UNSUPPORTED_CAPABILITY are
 *  never going to succeed on retry — no point burning the threshold budget on them). */
export function isTerminalForProvider(category: VisualFailureCategory): boolean {
  return category === 'AUTH' || category === 'UNSUPPORTED_CAPABILITY' || category === 'MODEL_UNAVAILABLE';
}
