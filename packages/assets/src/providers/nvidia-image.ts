import type { ImageGenRequest, ImageGenResult, ImageGenerator } from '../types/image-gen.js';
import { mergeAbortSignal } from '@metroforge/shared';

export interface NvidiaImageConfig {
  apiKey?: string;
  baseUrl?: string;
  /** NVIDIA NIM model id, e.g. black-forest-labs/flux.1-schnell */
  modelId?: string;
  enabled?: boolean;
}

interface OpenAIImageResponse {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
}

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'black-forest-labs/flux.1-schnell';

/** Hosted NVIDIA NIM image generation — OpenAI-compatible /v1/images/generations. */
export class NvidiaImageProvider implements ImageGenerator {
  id = 'nvidia-image';
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly modelId: string;
  private readonly enabled: boolean;

  constructor(config: NvidiaImageConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.NVIDIA_API_KEY;
    this.baseUrl = (config.baseUrl ?? process.env.NVIDIA_API_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    );
    this.modelId = config.modelId ?? process.env.NVIDIA_IMAGE_MODEL ?? DEFAULT_MODEL;
    this.enabled = config.enabled ?? !!this.apiKey;
  }

  async checkHealth(): Promise<boolean> {
    if (!this.enabled || !this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { data?: { id: string }[] };
      const ids = (data.data ?? []).map((m) => m.id);
      if (ids.length === 0) return true;
      return ids.some((id) => id === this.modelId || id.includes('flux') || id.includes('stable-diffusion'));
    } catch {
      return false;
    }
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    if (!this.apiKey) {
      throw new Error('NVIDIA_API_KEY is not configured');
    }

    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);
    const size = `${request.width}x${request.height}`;

    const res = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId,
        prompt: request.prompt,
        n: 1,
        size,
        response_format: 'b64_json',
        seed,
      }),
      signal: mergeAbortSignal(request.signal, 120_000),
    });

    const body = (await res.json()) as OpenAIImageResponse;
    if (!res.ok) {
      throw new Error(body.error?.message ?? `NVIDIA image API failed (${res.status})`);
    }

    const b64 = body.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('NVIDIA image API returned no image data');
    }

    return {
      image: Buffer.from(b64, 'base64'),
      provider: this.id,
      modelId: this.modelId,
      seed,
      fallbackGenerated: false,
    };
  }
}
