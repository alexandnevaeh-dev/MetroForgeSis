export class GenerationCancelledError extends Error {
  readonly name = 'GenerationCancelledError';

  constructor(message = 'Generation cancelled by user') {
    super(message);
  }
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new GenerationCancelledError();
  }
}

/** Combines a caller abort signal with an optional timeout for fetch/subprocess calls. */
export function mergeAbortSignal(signal?: AbortSignal, timeoutMs?: number): AbortSignal {
  if (signal && timeoutMs != null) {
    return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
  }
  if (signal) return signal;
  return AbortSignal.timeout(timeoutMs ?? 120_000);
}
