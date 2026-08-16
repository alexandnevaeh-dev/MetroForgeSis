import type {
  ImageGenRequest,
  ImageGenResult,
  ImageGenerator,
  ImageProviderHealthReport,
} from '../types/image-gen.js';
import { foundryFetch, classifyHttpStatus, type FoundryFetch } from '../foundry/http.js';
import { AuthenticationError, GenerationFailedError } from '../foundry/errors.js';

export interface DeepAIConfig {
  apiKey?: string;
  enabled?: boolean;
  fetchImpl?: FoundryFetch;
}

/** Optional cloud adapter. Do not assume unlimited free access. */
export class DeepAIProvider implements ImageGenerator {
  id = 'deepai';
  constructor(private readonly config: DeepAIConfig = {}) {}

  async checkHealth(): Promise<boolean> {
    const report = await this.getHealthReport();
    return report.status === 'HEALTHY' || report.status === 'DEGRADED';
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    if (this.config.enabled === false) return { status: 'UNAVAILABLE', reason: 'Disabled', latencyMs: null };
    if (!this.config.apiKey) return { status: 'MISCONFIGURED', reason: 'DEEPAI_API_KEY not set', latencyMs: null };
    return { status: 'DEGRADED', reason: 'DeepAI configured (metered; no cheap health endpoint)', latencyMs: null };
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    const key = this.config.apiKey;
    if (!key) throw new AuthenticationError('DEEPAI_API_KEY not set');
    const form = new FormData();
    form.set('text', request.prompt);
    const res = await foundryFetch(
      'https://api.deepai.org/api/text2img',
      {
        method: 'POST',
        headers: { 'api-key': key },
        body: form,
        timeoutMs: 60_000,
        secrets: [key],
        signal: request.signal,
      },
      this.config.fetchImpl ?? fetch,
    );
    if (!res.ok) throw classifyHttpStatus(res.status, await res.text());
    const data = (await res.json()) as { output_url?: string };
    if (!data.output_url) throw new GenerationFailedError('DeepAI returned no output_url');
    const img = await foundryFetch(data.output_url, { timeoutMs: 30_000 }, this.config.fetchImpl ?? fetch);
    if (!img.ok) throw classifyHttpStatus(img.status, await img.text());
    return {
      image: Buffer.from(await img.arrayBuffer()),
      provider: this.id,
      modelId: 'deepai-text2img',
      seed: request.seed ?? 0,
      fallbackGenerated: false,
      productionAllowed: true,
    };
  }
}
