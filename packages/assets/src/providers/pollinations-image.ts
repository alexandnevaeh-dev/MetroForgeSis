import type { ImageGenRequest, ImageGenResult, ImageGenerator, ImageProviderHealthReport } from '../types/image-gen.js';
import { foundryFetch, classifyHttpStatus, type FoundryFetch } from '../foundry/http.js';
import { decodePngRgba } from '../png.js';
import { ensurePngBuffer, isJpegBuffer, isPngBuffer } from '../image-format.js';

export interface PollinationsImageConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  enabled?: boolean;
  fetchImpl?: FoundryFetch;
}

const DEFAULT_BASE_URL = 'https://image.pollinations.ai';
const MIN_RESPONSE_BYTES = 512;

/**
 * Pollinations image-generation adapter (https://pollinations.ai) — a keyless, OpenAI-compatible-
 * style public image API: GET {baseUrl}/prompt/{encoded prompt}?width&height&seed&nologo&model.
 * Generation-only — Pollinations' free public endpoint has no documented reference-image/edit
 * input, so this deliberately does NOT implement ImageEditor. Character/entity editing (which
 * needs identity-preserving reference input) stays routed to NVIDIA's edit provider when healthy;
 * Pollinations only ever wins generate-from-spec plans (backgrounds, checkpoint/pickup/gate icons)
 * in the provider chain — see replace.ts's DEFAULT_PROVIDER_CHAIN ordering.
 */
export class PollinationsImageProvider implements ImageGenerator {
  id = 'pollinations-image';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly enabled: boolean;
  private readonly fetchImpl: FoundryFetch;

  constructor(config: PollinationsImageConfig = {}) {
    this.baseUrl = (config.baseUrl ?? process.env.POLLINATIONS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.model = config.model ?? process.env.POLLINATIONS_IMAGE_MODEL ?? 'flux';
    this.apiKey = config.apiKey ?? process.env.POLLINATIONS_API_KEY;
    this.enabled = config.enabled ?? true;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private buildUrl(prompt: string, width: number, height: number, seed: number): string {
    const encoded = encodeURIComponent(prompt).slice(0, 2000);
    const params = new URLSearchParams({
      width: String(Math.max(64, Math.round(width))),
      height: String(Math.max(64, Math.round(height))),
      seed: String(seed),
      nologo: 'true',
      model: this.model,
      // safe: keeps the free public endpoint's own content-safety filter on — MetroForge never
      // wants to route around a provider's own safety gate.
      safe: 'true',
    });
    return `${this.baseUrl}/prompt/${encoded}?${params.toString()}`;
  }

  async checkHealth(): Promise<boolean> {
    const report = await this.getHealthReport();
    return report.status === 'HEALTHY' || report.status === 'DEGRADED';
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    if (!this.enabled) return { status: 'UNAVAILABLE', reason: 'Disabled', latencyMs: null };
    const started = Date.now();
    try {
      // HEAD would be ideal but Pollinations' prompt route only reliably responds to GET; use a
      // tiny 64x64 request as the health probe instead of a real asset-sized one.
      const res = await foundryFetch(
        this.buildUrl('health check pixel art tile', 64, 64, 1),
        { method: 'GET', timeoutMs: 10_000, secrets: this.apiKey ? [this.apiKey] : [] },
        this.fetchImpl,
      );
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return { status: res.status >= 500 ? 'DEGRADED' : 'UNAVAILABLE', reason: `HTTP ${res.status}`, latencyMs };
      }
      return { status: 'HEALTHY', reason: 'reachable', latencyMs };
    } catch (err) {
      return {
        status: 'NETWORK_ERROR',
        reason: err instanceof Error ? err.message : 'Pollinations health check failed',
        latencyMs: Date.now() - started,
      };
    }
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);
    const url = this.buildUrl(request.prompt, request.width, request.height, seed);
    const res = await foundryFetch(
      url,
      {
        method: 'GET',
        timeoutMs: 60_000,
        secrets: this.apiKey ? [this.apiKey] : [],
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
        signal: request.signal,
      },
      this.fetchImpl,
    );
    if (!res.ok) throw classifyHttpStatus(res.status, await res.text().catch(() => ''));

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < MIN_RESPONSE_BYTES) {
      throw new Error(`Pollinations returned an implausibly small response (${bytes.length} bytes)`);
    }
    if (!isPngBuffer(bytes) && !isJpegBuffer(bytes)) {
      throw new Error('Pollinations returned unrecognized image bytes (not PNG or JPEG)');
    }

    // Everything downstream (validateCandidate, PixelArtProcessor) only decodes PNG — normalize
    // JPEG output (flux model on Pollinations commonly returns JPEG) before returning. Also
    // serves as a decode sanity check: a corrupt/truncated response throws here, not later.
    const image = ensurePngBuffer(bytes);
    decodePngRgba(image);

    return {
      image,
      provider: this.id,
      modelId: this.model,
      seed,
      fallbackGenerated: false,
      productionAllowed: true,
    };
  }
}
