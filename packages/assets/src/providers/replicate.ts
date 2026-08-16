import type {
  ImageGenRequest,
  ImageGenResult,
  ImageGenerator,
  ImageProviderHealthReport,
} from '../types/image-gen.js';
import { foundryFetch, classifyHttpStatus, type FoundryFetch } from '../foundry/http.js';
import { AuthenticationError, GenerationFailedError } from '../foundry/errors.js';

export interface ReplicateConfig {
  apiToken?: string;
  modelId?: string;
  enabled?: boolean;
  fetchImpl?: FoundryFetch;
}

/** Optional paid meta-provider. Disabled in free-only unless a no-cost path is verified. */
export class ReplicateProvider implements ImageGenerator {
  id = 'replicate';
  constructor(private readonly config: ReplicateConfig = {}) {}

  async checkHealth(): Promise<boolean> {
    const report = await this.getHealthReport();
    return report.status === 'HEALTHY' || report.status === 'DEGRADED';
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    if (this.config.enabled === false) return { status: 'UNAVAILABLE', reason: 'Disabled', latencyMs: null };
    if (!this.config.apiToken) {
      return { status: 'MISCONFIGURED', reason: 'REPLICATE_API_TOKEN not set', latencyMs: null };
    }
    const started = Date.now();
    try {
      const res = await foundryFetch(
        'https://api.replicate.com/v1/account',
        {
          headers: { Authorization: `Bearer ${this.config.apiToken}` },
          timeoutMs: 8000,
          secrets: [this.config.apiToken],
        },
        this.config.fetchImpl ?? fetch,
      );
      const latencyMs = Date.now() - started;
      if (res.status === 401 || res.status === 403) {
        return { status: 'AUTH_FAILED', reason: 'Replicate authentication failed', latencyMs };
      }
      if (!res.ok) return { status: 'DEGRADED', reason: `account HTTP ${res.status}`, latencyMs };
      return { status: 'HEALTHY', reason: 'Replicate account reachable (paid/metered)', latencyMs };
    } catch (err) {
      return {
        status: 'NETWORK_ERROR',
        reason: err instanceof Error ? err.message : 'Replicate health check failed',
        latencyMs: Date.now() - started,
      };
    }
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    const token = this.config.apiToken;
    if (!token) throw new AuthenticationError('REPLICATE_API_TOKEN not set');
    const model = this.config.modelId ?? 'black-forest-labs/flux-schnell';
    const created = await foundryFetch(
      'https://api.replicate.com/v1/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: { prompt: request.prompt, width: request.width, height: request.height },
        }),
        timeoutMs: 30_000,
        secrets: [token],
        signal: request.signal,
      },
      this.config.fetchImpl ?? fetch,
    );
    if (!created.ok) throw classifyHttpStatus(created.status, await created.text());
    const prediction = (await created.json()) as { id?: string; output?: unknown; error?: string; urls?: { get?: string } };
    if (prediction.error) throw new GenerationFailedError(prediction.error);
    const getUrl = prediction.urls?.get;
    if (!getUrl) throw new GenerationFailedError('Replicate prediction missing poll URL');
    for (let i = 0; i < 20; i++) {
      const poll = await foundryFetch(
        getUrl,
        { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 15_000, secrets: [token] },
        this.config.fetchImpl ?? fetch,
      );
      if (!poll.ok) throw classifyHttpStatus(poll.status, await poll.text());
      const body = (await poll.json()) as { status?: string; output?: unknown; error?: string };
      if (body.status === 'succeeded') {
        const url = Array.isArray(body.output) ? String(body.output[0]) : String(body.output ?? '');
        if (!url) throw new GenerationFailedError('Replicate succeeded with empty output');
        const img = await foundryFetch(url, { timeoutMs: 30_000 }, this.config.fetchImpl ?? fetch);
        if (!img.ok) throw classifyHttpStatus(img.status, await img.text());
        return {
          image: Buffer.from(await img.arrayBuffer()),
          provider: this.id,
          modelId: model,
          seed: request.seed ?? 0,
          fallbackGenerated: false,
          productionAllowed: true,
        };
      }
      if (body.status === 'failed' || body.status === 'canceled') {
        throw new GenerationFailedError(body.error ?? `Replicate ${body.status}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new GenerationFailedError('Replicate prediction timed out');
  }
}
