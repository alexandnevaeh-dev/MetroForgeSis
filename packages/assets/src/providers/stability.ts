import type {
  ImageGenRequest,
  ImageGenResult,
  ImageGenerator,
  ImageProviderHealthReport,
} from '../types/image-gen.js';
import { foundryFetch, classifyHttpStatus, type FoundryFetch } from '../foundry/http.js';
import { AuthenticationError } from '../foundry/errors.js';

export interface StabilityConfig {
  apiKey?: string;
  modelId?: string;
  enabled?: boolean;
  fetchImpl?: FoundryFetch;
}

/** Metered Stability AI adapter — never treated as free. */
export class StabilityProvider implements ImageGenerator {
  id = 'stability';
  private readonly apiKey?: string;
  private readonly modelId: string;
  private readonly enabled: boolean;
  private readonly fetchImpl: FoundryFetch;

  constructor(config: StabilityConfig = {}) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'stable-image-core';
    this.enabled = config.enabled ?? true;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async checkHealth(): Promise<boolean> {
    const report = await this.getHealthReport();
    return report.status === 'HEALTHY' || report.status === 'DEGRADED';
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    if (!this.enabled) return { status: 'UNAVAILABLE', reason: 'Disabled', latencyMs: null };
    if (!this.apiKey) return { status: 'MISCONFIGURED', reason: 'STABILITY_API_KEY not set', latencyMs: null };
    const started = Date.now();
    try {
      const res = await foundryFetch(
        'https://api.stability.ai/v1/user/account',
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          timeoutMs: 8000,
          secrets: [this.apiKey],
        },
        this.fetchImpl,
      );
      const latencyMs = Date.now() - started;
      if (res.status === 401 || res.status === 403) {
        return { status: 'AUTH_FAILED', reason: 'Stability authentication failed', latencyMs };
      }
      if (!res.ok) return { status: 'DEGRADED', reason: `account HTTP ${res.status}`, latencyMs };
      return { status: 'HEALTHY', reason: 'Stability account reachable (metered)', latencyMs };
    } catch (err) {
      return {
        status: 'NETWORK_ERROR',
        reason: err instanceof Error ? err.message : 'Stability health check failed',
        latencyMs: Date.now() - started,
      };
    }
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    if (!this.apiKey) throw new AuthenticationError('STABILITY_API_KEY not set');
    const form = new FormData();
    form.set('prompt', request.prompt);
    form.set('negative_prompt', request.negativePrompt ?? '');
    form.set('output_format', 'png');
    const res = await foundryFetch(
      'https://api.stability.ai/v2beta/stable-image/generate/core',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'image/*' },
        body: form,
        timeoutMs: 90_000,
        secrets: [this.apiKey],
        signal: request.signal,
      },
      this.fetchImpl,
    );
    if (!res.ok) throw classifyHttpStatus(res.status, await res.text());
    return {
      image: Buffer.from(await res.arrayBuffer()),
      provider: this.id,
      modelId: this.modelId,
      seed: request.seed ?? 0,
      fallbackGenerated: false,
      productionAllowed: true,
    };
  }
}
