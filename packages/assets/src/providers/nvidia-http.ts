import { mergeAbortSignal } from '@metroforge/shared';
import { assertNoSecretLeak, resolveNvidiaConfig, type NvidiaResolvedConfig } from './nvidia-foundation.js';

export interface NvidiaMultipartFilePart {
  fieldName: string;
  filename: string;
  bytes: Buffer;
  mimeType?: string;
}

export interface NvidiaHttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  path?: string;
  /** Absolute URL overrides baseUrl + path. */
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** When set, sends multipart/form-data (JSON body is ignored). */
  multipart?: {
    fields?: Record<string, string>;
    files?: NvidiaMultipartFilePart[];
  };
  signal?: AbortSignal;
  timeoutMs?: number;
  /** When true, Authorization is omitted (rare public probes). */
  skipAuth?: boolean;
}

export interface NvidiaHttpResponse<T = unknown> {
  ok: boolean;
  status: number;
  headers: Headers;
  body: T | null;
  rawText: string;
  latencyMs: number;
  requestId?: string;
  contentType?: string;
}

export interface NvidiaHttpClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Reusable authenticated NVIDIA HTTP client.
 * Never logs Authorization headers or API keys; errors are redacted.
 */
export class NvidiaHttpClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: NvidiaHttpClientOptions = {}) {
    const cfg = resolveNvidiaConfig();
    this.apiKey = options.apiKey ?? process.env.NVIDIA_API_KEY;
    this.baseUrl = (options.baseUrl ?? cfg.baseUrl).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  get resolvedBaseUrl(): string {
    return this.baseUrl;
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  /** Safe config snapshot — never includes the API key. */
  describe(): Pick<NvidiaResolvedConfig, 'provider' | 'configured' | 'baseUrl' | 'deployment'> & {
    apiKeyPresent: boolean;
  } {
    const cfg = resolveNvidiaConfig();
    return {
      provider: 'nvidia',
      configured: this.configured,
      apiKeyPresent: this.configured,
      baseUrl: this.baseUrl,
      deployment: cfg.deployment,
    };
  }

  async requestJson<T = unknown>(options: NvidiaHttpRequestOptions): Promise<NvidiaHttpResponse<T>> {
    if (!options.skipAuth && !this.apiKey) {
      throw new Error('NVIDIA_API_KEY is not configured');
    }

    const url = options.url ?? `${this.baseUrl}${options.path?.startsWith('/') ? options.path : `/${options.path ?? ''}`}`;
    const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET');
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    };
    if (!options.skipAuth && this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    let requestBody: string | FormData | undefined;
    if (options.multipart) {
      const form = new FormData();
      for (const [key, value] of Object.entries(options.multipart.fields ?? {})) {
        form.append(key, value);
      }
      for (const file of options.multipart.files ?? []) {
        const blob = new Blob([new Uint8Array(file.bytes)], {
          type: file.mimeType ?? 'application/octet-stream',
        });
        form.append(file.fieldName, blob, file.filename);
      }
      requestBody = form;
      // Let fetch set multipart boundary — never set Content-Type manually.
      delete headers['Content-Type'];
    } else if (options.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      requestBody = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    const signal = mergeAbortSignal(options.signal, options.timeoutMs ?? this.timeoutMs);

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, { method, headers, body: requestBody, signal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      assertNoSecretLeak(msg, this.apiKey);
      throw new Error(`NVIDIA transport error: ${msg}`);
    }

    const rawText = await res.text();
    assertNoSecretLeak(rawText, this.apiKey);
    let body: T | null = null;
    if (rawText.trim()) {
      try {
        body = JSON.parse(rawText) as T;
      } catch {
        body = null;
      }
    }

    const requestId =
      res.headers.get('nvcf-request-id') ??
      res.headers.get('x-request-id') ??
      undefined;

    return {
      ok: res.ok,
      status: res.status,
      headers: res.headers,
      body,
      rawText,
      latencyMs: Date.now() - started,
      requestId,
      contentType: res.headers.get('content-type') ?? undefined,
    };
  }
}
