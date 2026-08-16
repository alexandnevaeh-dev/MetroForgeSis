import type {
  ImageGenRequest,
  ImageGenResult,
  ImageGenerator,
  ImageProviderHealthReport,
} from '../types/image-gen.js';
import { foundryFetch, classifyHttpStatus, decodeImagePayload, type FoundryFetch } from '../foundry/http.js';
import { AuthenticationError } from '../foundry/errors.js';

export interface Automatic1111Config {
  baseUrl?: string;
  enabled?: boolean;
  fetchImpl?: FoundryFetch;
}

/** AUTOMATIC1111 / Stable Diffusion webui HTTP adapter. Health-checks first; never assumes localhost is up. */
export class Automatic1111Provider implements ImageGenerator {
  id = 'automatic1111';
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly fetchImpl: FoundryFetch;

  constructor(config: Automatic1111Config = {}) {
    this.baseUrl = (config.baseUrl ?? 'http://127.0.0.1:7860').replace(/\/$/, '');
    this.enabled = config.enabled ?? true;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async checkHealth(): Promise<boolean> {
    const report = await this.getHealthReport();
    return report.status === 'HEALTHY' || report.status === 'DEGRADED';
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    if (!this.enabled) {
      return { status: 'UNAVAILABLE', reason: 'Disabled', latencyMs: null };
    }
    const started = Date.now();
    try {
      const res = await foundryFetch(
        `${this.baseUrl}/sdapi/v1/sd-models`,
        { timeoutMs: 3000 },
        this.fetchImpl,
      );
      const latencyMs = Date.now() - started;
      if (res.ok) return { status: 'HEALTHY', reason: 'sdapi reachable', latencyMs };
      if (res.status === 404) {
        return { status: 'DEGRADED', reason: 'webui up but sdapi missing — enable --api', latencyMs };
      }
      return { status: 'UNAVAILABLE', reason: `sdapi HTTP ${res.status}`, latencyMs };
    } catch {
      return {
        status: 'UNAVAILABLE',
        reason: `AUTOMATIC1111 not reachable at ${this.baseUrl}`,
        latencyMs: Date.now() - started,
      };
    }
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    const healthy = await this.checkHealth();
    if (!healthy) throw new AuthenticationError('AUTOMATIC1111 is not reachable — start webui with --api');
    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);
    const res = await foundryFetch(
      `${this.baseUrl}/sdapi/v1/txt2img`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: 120_000,
        body: JSON.stringify({
          prompt: request.prompt,
          negative_prompt: request.negativePrompt ?? '',
          width: request.width,
          height: request.height,
          seed,
          steps: 20,
        }),
        signal: request.signal,
      },
      this.fetchImpl,
    );
    if (!res.ok) throw classifyHttpStatus(res.status, await res.text());
    const data = (await res.json()) as { images?: string[] };
    const image = decodeImagePayload(data);
    return {
      image,
      provider: this.id,
      modelId: 'automatic1111-local',
      seed,
      fallbackGenerated: false,
      productionAllowed: true,
    };
  }
}
