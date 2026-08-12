import { BaseHttpTextProvider, type HttpProviderConfig } from './base-http.js';
import type { TextGenerationRequest, TextGenerationResponse } from '../types.js';

export type NvidiaErrorCode =
  | 'NVIDIA_INVALID_RESPONSE'
  | 'NVIDIA_AUTH_FAILED'
  | 'NVIDIA_RATE_LIMITED'
  | 'NVIDIA_TIMEOUT'
  | 'NVIDIA_MODEL_NOT_FOUND'
  | 'NVIDIA_PROVIDER_UNAVAILABLE'
  | 'NVIDIA_REQUEST_FAILED';

export class NvidiaProviderError extends Error {
  constructor(
    public readonly code: NvidiaErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NvidiaProviderError';
  }
}

export interface NvidiaHealthDetails {
  provider: 'nvidia';
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
  lastCheckedAt: string;
  errorCode: NvidiaErrorCode | null;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

/** Masks a secret so it can never leak into logs/errors/UI while still letting a user
 *  recognize *which* key is configured. `nvapi-abc123...xyz789` -> `nvapi-••••••••z789`. */
function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  const prefix = key.includes('-') ? `${key.split('-')[0]}-` : '';
  const suffix = key.slice(-4);
  return `${prefix}${'•'.repeat(8)}${suffix}`;
}

/** Defense-in-depth: strips any literal occurrence of the real key out of a string before it
 *  can reach an error message, log line, or thrown exception — even if some future code path
 *  accidentally interpolates it (e.g. an API echoing back part of a request). */
function redact(text: string, apiKey: string | undefined): string {
  if (!apiKey) return text;
  return text.split(apiKey).join(maskApiKey(apiKey));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface NvidiaProviderConfig extends HttpProviderConfig {
  maxRetries?: number;
}

/**
 * NVIDIA NIM / API Catalog provider — OpenAI-compatible hosted inference
 * (https://integrate.api.nvidia.com/v1/chat/completions). Free developer-tier access, gated
 * on NVIDIA_API_KEY; intentionally classified `usageClass: development_prototyping` at the
 * model-catalog level (see config/models.catalog.json) rather than treated as guaranteed
 * production capacity — see docs/METROFORGE_CURRENT_BUILD.md for why that distinction matters.
 */
export class NvidiaProvider extends BaseHttpTextProvider {
  id = 'nvidia';
  name = 'NVIDIA NIM';
  license = 'NVIDIA API Terms of Use';
  private readonly maxRetries: number;

  constructor(config: NvidiaProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://integrate.api.nvidia.com/v1',
      defaultModel: config.defaultModel || 'meta/llama-3.1-8b-instruct',
      priority: config.priority ?? 70,
    });
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async listModels(): Promise<string[]> {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [this.config.defaultModel];
      const data = (await res.json()) as { data?: { id: string }[] };
      return (data.data ?? []).map((m) => m.id);
    } catch {
      return [this.config.defaultModel];
    }
  }

  /** Cheap, request-free-of-generation health probe: hits the models-list endpoint rather
   *  than spending a real completion just to confirm reachability. Does not fall back to a
   *  chat completion — an unreachable /models is reported as such, not silently upgraded to
   *  a more expensive check.
   *
   *  Verified live against the real endpoint: NVIDIA's GET /v1/models is publicly readable
   *  and returns 200 with the full catalog *regardless of whether the bearer key is valid* —
   *  so `reachable: true` only proves the NVIDIA API itself is up, not that this specific key
   *  will be accepted by /chat/completions. A truly invalid key surfaces as NVIDIA_AUTH_FAILED
   *  the first time generateText() actually runs, not here — confirming key validity any
   *  earlier would mean spending a real generation request, which the health check must not do. */
  async getHealthDetails(): Promise<NvidiaHealthDetails> {
    const now = new Date().toISOString();
    if (!this.apiKey) {
      return { provider: 'nvidia', configured: false, reachable: false, latencyMs: null, lastCheckedAt: now, errorCode: null };
    }

    const start = Date.now();
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - start;
      if (res.status === 401 || res.status === 403) {
        return { provider: 'nvidia', configured: true, reachable: false, latencyMs, lastCheckedAt: now, errorCode: 'NVIDIA_AUTH_FAILED' };
      }
      if (!res.ok) {
        return { provider: 'nvidia', configured: true, reachable: false, latencyMs, lastCheckedAt: now, errorCode: 'NVIDIA_PROVIDER_UNAVAILABLE' };
      }
      return { provider: 'nvidia', configured: true, reachable: true, latencyMs, lastCheckedAt: now, errorCode: null };
    } catch {
      return {
        provider: 'nvidia',
        configured: true,
        reachable: false,
        latencyMs: Date.now() - start,
        lastCheckedAt: now,
        errorCode: 'NVIDIA_PROVIDER_UNAVAILABLE',
      };
    }
  }

  override async checkHealth() {
    const details = await this.getHealthDetails();
    if (!details.configured) return 'unavailable' as const;
    return details.reachable ? ('healthy' as const) : ('unavailable' as const);
  }

  protected buildRequest(model: string, request: TextGenerationRequest) {
    const messages: { role: string; content: string }[] = [];
    if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
    messages.push({ role: 'user', content: request.prompt });

    return {
      url: `${this.config.baseUrl}/chat/completions`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: request.temperature ?? 0.2,
          top_p: 0.95,
          max_tokens: request.maxTokens ?? 4096,
          stream: false,
          ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      } satisfies RequestInit,
    };
  }

  private errorCodeForStatus(status: number): NvidiaErrorCode {
    if (status === 401 || status === 403) return 'NVIDIA_AUTH_FAILED';
    if (status === 404) return 'NVIDIA_MODEL_NOT_FOUND';
    if (status === 429) return 'NVIDIA_RATE_LIMITED';
    if (RETRYABLE_STATUS.has(status)) return 'NVIDIA_PROVIDER_UNAVAILABLE';
    return 'NVIDIA_REQUEST_FAILED';
  }

  /** Overrides the base class's single-shot fetch to add bounded retry with exponential
   *  backoff for transient failures (408/429/5xx/network), honoring Retry-After on 429.
   *  Non-retryable failures (400/401/403/404, malformed response) fail fast so
   *  FallbackManager can move to the next candidate provider immediately rather than
   *  wasting the whole retry budget on an error retrying can't fix. */
  override async generateText(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    if (!this.apiKey) {
      throw new NvidiaProviderError('NVIDIA_AUTH_FAILED', 'NVIDIA NIM API key not configured');
    }

    const model = this.config.defaultModel;
    const { url, init } = this.buildRequest(model, request);
    const start = Date.now();

    let lastError: NvidiaProviderError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { ...init, signal: AbortSignal.timeout(120000) });
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === 'TimeoutError';
        lastError = new NvidiaProviderError(
          isTimeout ? 'NVIDIA_TIMEOUT' : 'NVIDIA_PROVIDER_UNAVAILABLE',
          redact(`NVIDIA NIM request failed: ${err instanceof Error ? err.message : String(err)}`, this.apiKey),
        );
        if (attempt < this.maxRetries) {
          await sleep(this.backoffMs(attempt));
          continue;
        }
        throw lastError;
      }

      if (res.ok) {
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          throw new NvidiaProviderError('NVIDIA_INVALID_RESPONSE', 'NVIDIA NIM returned a non-JSON response');
        }
        const text = this.extractContent(data);
        return { text, model, provider: this.id, durationMs: Date.now() - start };
      }

      const code = this.errorCodeForStatus(res.status);
      const bodyText = redact(await res.text().catch(() => ''), this.apiKey);
      lastError = new NvidiaProviderError(
        code,
        `NVIDIA NIM request failed: ${res.status} ${res.statusText}${bodyText ? ` — ${bodyText.slice(0, 300)}` : ''}`,
      );

      const retryable = RETRYABLE_STATUS.has(res.status);
      if (!retryable || attempt >= this.maxRetries) {
        throw lastError;
      }

      const retryAfterHeader = res.headers.get('Retry-After');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      await sleep(retryAfterMs && Number.isFinite(retryAfterMs) ? retryAfterMs : this.backoffMs(attempt));
    }

    // Unreachable in practice (the loop above always returns or throws), but keeps the
    // function's return type honest without a non-null assertion.
    throw lastError ?? new NvidiaProviderError('NVIDIA_REQUEST_FAILED', 'NVIDIA NIM request failed');
  }

  private backoffMs(attempt: number): number {
    const base = BASE_BACKOFF_MS * 2 ** attempt;
    const jitter = Math.random() * base * 0.25;
    return base + jitter;
  }

  private extractContent(data: unknown): string {
    const d = data as { choices?: { message?: { content?: string } }[] };
    const content = d.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.length > 0) return content;
    throw new NvidiaProviderError(
      'NVIDIA_INVALID_RESPONSE',
      'NVIDIA NIM response missing choices[0].message.content',
    );
  }
}
