import { createLogger, redactString } from '@metroforge/shared';
import {
  AuthenticationError,
  ProviderUnavailableError,
  QuotaExceededError,
  RateLimitError,
} from './errors.js';

const logger = createLogger('asset-foundry-http');

export type FoundryFetch = typeof fetch;

export function classifyHttpStatus(status: number, body: string): Error {
  const safe = redactString(body).slice(0, 400);
  if (status === 401 || status === 403) return new AuthenticationError(`HTTP ${status}: ${safe}`);
  if (status === 429) return new RateLimitError(`HTTP 429: ${safe}`);
  if (status === 402) return new QuotaExceededError(`HTTP 402: ${safe}`);
  return new ProviderUnavailableError(`HTTP ${status}: ${safe}`);
}

export async function foundryFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number; secrets?: Array<string | undefined> } = {},
  fetchImpl: FoundryFetch = fetch,
): Promise<Response> {
  const { timeoutMs = 15_000, secrets = [], ...rest } = init;
  const signal = rest.signal
    ? rest.signal
    : AbortSignal.timeout(timeoutMs);
  try {
    return await fetchImpl(url, { ...rest, signal });
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err), secrets);
    logger.warn('foundry http failed', { url: stripQuery(url), detail: message });
    throw new ProviderUnavailableError(message);
  }
}

export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  let out = redactString(text);
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join('***REDACTED***');
  }
  return out;
}

function stripQuery(url: string): string {
  const idx = url.indexOf('?');
  return idx >= 0 ? url.slice(0, idx) : url;
}

export function decodeImagePayload(data: unknown, secrets: Array<string | undefined> = []): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (typeof data === 'string') {
    const trimmed = data.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, '');
    return Buffer.from(trimmed, 'base64');
  }
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    if (typeof rec.b64_json === 'string') return Buffer.from(rec.b64_json, 'base64');
    if (typeof rec.image === 'string') return decodeImagePayload(rec.image, secrets);
    if (Array.isArray(rec.images) && typeof rec.images[0] === 'string') {
      return decodeImagePayload(rec.images[0], secrets);
    }
    if (Array.isArray(rec.artifacts) && rec.artifacts[0] && typeof rec.artifacts[0] === 'object') {
      const art = rec.artifacts[0] as { base64?: string };
      if (art.base64) return Buffer.from(art.base64, 'base64');
    }
  }
  throw new ProviderUnavailableError(redactSecrets('Provider returned no image payload', secrets));
}
