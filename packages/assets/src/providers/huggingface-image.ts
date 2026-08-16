import type {
  ImageGenRequest,
  ImageGenResult,
  ImageGenerator,
  ImageProviderHealthReport,
} from '../types/image-gen.js';
import { foundryFetch, classifyHttpStatus, decodeImagePayload, type FoundryFetch } from '../foundry/http.js';
import { AuthenticationError, LicenseRejectedError, UnsupportedCapabilityError } from '../foundry/errors.js';
import { classifyAssetLicense, licensePasses } from '../foundry/license.js';

export interface HuggingFaceImageConfig {
  apiKey?: string;
  modelId?: string;
  baseUrl?: string;
  commercialUseRequired?: boolean;
  enabled?: boolean;
  fetchImpl?: FoundryFetch;
}

/**
 * Hugging Face Inference image adapter. Does not assume a public model has free inference —
 * health-checks the model card + endpoint first.
 */
export class HuggingFaceImageProvider implements ImageGenerator {
  id = 'huggingface-image';
  private readonly apiKey?: string;
  private readonly modelId: string;
  private readonly baseUrl: string;
  private readonly commercialUseRequired: boolean;
  private readonly enabled: boolean;
  private readonly fetchImpl: FoundryFetch;

  constructor(config: HuggingFaceImageConfig = {}) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'stabilityai/sdxl-turbo';
    this.baseUrl = (config.baseUrl ?? 'https://api-inference.huggingface.co/models').replace(/\/$/, '');
    this.commercialUseRequired = config.commercialUseRequired ?? false;
    this.enabled = config.enabled ?? true;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async checkHealth(): Promise<boolean> {
    const report = await this.getHealthReport();
    return report.status === 'HEALTHY' || report.status === 'DEGRADED';
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    if (!this.enabled) return { status: 'UNAVAILABLE', reason: 'Disabled', latencyMs: null };
    if (!this.apiKey) return { status: 'MISCONFIGURED', reason: 'HUGGINGFACE_API_KEY not set', latencyMs: null };
    const started = Date.now();
    try {
      const card = await foundryFetch(
        `https://huggingface.co/api/models/${this.modelId}`,
        { timeoutMs: 8000, secrets: [this.apiKey] },
        this.fetchImpl,
      );
      const latencyMs = Date.now() - started;
      if (card.status === 401 || card.status === 403) {
        return { status: 'AUTH_FAILED', reason: 'Hugging Face authentication failed', latencyMs };
      }
      if (card.status === 404) {
        return { status: 'MODEL_UNAVAILABLE', reason: `model ${this.modelId} does not exist`, latencyMs };
      }
      if (!card.ok) {
        return { status: 'DEGRADED', reason: `model card HTTP ${card.status}`, latencyMs };
      }
      const data = (await card.json()) as {
        pipeline_tag?: string;
        cardData?: { license?: string };
        gated?: boolean;
      };
      const task = data.pipeline_tag ?? '';
      if (task && !/text-to-image|image-to-image|image-text-to-image/.test(task)) {
        return {
          status: 'UNAVAILABLE',
          reason: `model task ${task} is not image generation`,
          latencyMs,
        };
      }
      if (this.commercialUseRequired) {
        const decision = classifyAssetLicense({
          license: data.cardData?.license ?? 'unknown',
          commercialUse: data.cardData?.license ? 'allowed' : 'unknown',
        }, true);
        if (!licensePasses(decision, true)) {
          return { status: 'UNAVAILABLE', reason: `license rejected: ${decision.reason}`, latencyMs };
        }
      }
      return {
        status: data.gated ? 'DEGRADED' : 'HEALTHY',
        reason: data.gated ? 'gated model — inference may require extra access' : 'model card reachable',
        latencyMs,
      };
    } catch (err) {
      return {
        status: 'NETWORK_ERROR',
        reason: err instanceof Error ? err.message : 'Hugging Face health check failed',
        latencyMs: Date.now() - started,
      };
    }
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    if (!this.apiKey) throw new AuthenticationError('HUGGINGFACE_API_KEY not set');
    const health = await this.getHealthReport();
    if (health.status === 'UNAVAILABLE' && health.reason.startsWith('license')) {
      throw new LicenseRejectedError(health.reason);
    }
    if (health.status === 'UNAVAILABLE' && health.reason.includes('not image')) {
      throw new UnsupportedCapabilityError(health.reason);
    }
    const seed = request.seed ?? 0;
    const res = await foundryFetch(
      `${this.baseUrl}/${this.modelId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeoutMs: 90_000,
        secrets: [this.apiKey],
        body: JSON.stringify({
          inputs: request.prompt,
          parameters: { width: request.width, height: request.height, seed },
        }),
        signal: request.signal,
      },
      this.fetchImpl,
    );
    if (!res.ok) throw classifyHttpStatus(res.status, await res.text());
    const contentType = res.headers.get('content-type') ?? '';
    const image = contentType.includes('application/json')
      ? decodeImagePayload(await res.json(), [this.apiKey])
      : Buffer.from(await res.arrayBuffer());
    return {
      image,
      provider: this.id,
      modelId: this.modelId,
      seed,
      fallbackGenerated: false,
      productionAllowed: true,
    };
  }
}
