/**
 * Canonical OpenAI-compatible NIM root ending in `/v1` (no trailing slash beyond that).
 * Accepts both `https://host` and `https://host/v1` without producing `/v1/v1/...`.
 */
export function normalizeNimBaseUrl(raw: string | undefined | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  let url = trimmed.replace(/\/+$/, '');
  while (/\/v1\/v1(\/|$)/i.test(url)) {
    url = url.replace(/\/v1\/v1/gi, '/v1');
  }
  if (!/\/v1$/i.test(url)) {
    url = `${url}/v1`;
  }
  return url;
}

/** Build a path under the normalized NIM `/v1` root (e.g. images/edits → …/v1/images/edits). */
export function buildNimEndpoint(
  baseUrl: string | undefined | null,
  relativePath: string,
): string | undefined {
  const root = normalizeNimBaseUrl(baseUrl);
  if (!root) return undefined;
  const rel = relativePath.replace(/^\/+/, '').replace(/^v1\//i, '');
  return `${root}/${rel}`;
}
