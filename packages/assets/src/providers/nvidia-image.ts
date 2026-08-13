import { spawnSync } from 'node:child_process';
import type { ImageGenRequest, ImageGenResult, ImageGenerator, ImageProviderHealthReport } from '../types/image-gen.js';
import { mergeAbortSignal } from '@metroforge/shared';

export interface NvidiaImageConfig {
  apiKey?: string;
  /**
   * Text/chat NVIDIA OpenAI-compatible base (integrate.api…/v1).
   * Image generation uses a separate hosted genai base — see `imageApiBaseUrl`.
   */
  baseUrl?: string;
  /**
   * Hosted Visual GenAI base, e.g. https://ai.api.nvidia.com/v1/genai
   * Final URL is `{imageApiBaseUrl}/{modelId}`.
   */
  imageApiBaseUrl?: string;
  /** NVIDIA NIM / genai model id, e.g. black-forest-labs/flux.1-dev */
  modelId?: string;
  enabled?: boolean;
  /** Python used only to convert JPEG artifacts → PNG for the pixel-art pipeline. */
  pythonPath?: string;
}

interface GenaiImageResponse {
  artifacts?: { base64?: string; finishReason?: string }[];
  detail?: string | { msg?: string }[];
  title?: string;
  error?: { message?: string };
}

/** Text NIM /models catalog base (auth probe). */
const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
/** Hosted Visual GenAI invoke base (not OpenAI /images/generations). */
const DEFAULT_IMAGE_API_BASE = 'https://ai.api.nvidia.com/v1/genai';
/**
 * Default to flux.1-dev — live account probe: flux.1-schnell returned NVCF 504/errored;
 * flux.1-dev returned 200 + artifacts. Image models are NOT listed on integrate /models.
 */
const DEFAULT_MODEL = 'black-forest-labs/flux.1-dev';

/** Verified-working / documented NVIDIA cloud image model ids (not invented from thin air). */
const KNOWN_GENAI_IMAGE_MODELS = [
  'black-forest-labs/flux.1-dev',
  'black-forest-labs/flux.1-schnell',
] as const;

export type NvidiaImageHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'MISCONFIGURED'
  | 'NETWORK_ERROR'
  | 'MODEL_UNAVAILABLE'
  | 'UNKNOWN';

export interface NvidiaImageHealthDetails {
  status: NvidiaImageHealthStatus;
  reason: string;
  configured: boolean;
  latencyMs: number | null;
  lastCheckedAt: string;
  /** Image-like model ids from /models when present, else known genai ids. */
  nearbyModels?: string[];
  /** Short suggestion list for Settings/Providers UI. */
  suggestedModelIds?: string[];
  safeDiagnostic?: string;
}

function clampFluxDim(n: number): number {
  // FLUX.1 hosted preview typically expects 1024×1024.
  if (n <= 0) return 1024;
  return 1024;
}

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
}

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * Pixel-art pipeline requires PNG. NVIDIA genai often returns JPEG artifacts.
 * Convert via Pillow (same Python runtime Diffusers uses) — no new npm deps.
 */
function ensurePngBuffer(image: Buffer, pythonPath: string): Buffer {
  if (isPng(image)) return image;
  if (!isJpeg(image)) {
    throw new Error('NVIDIA image API returned unrecognized image bytes (expected PNG or JPEG)');
  }
  const script = [
    'import sys,io',
    'from PIL import Image',
    'img=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGBA")',
    'out=io.BytesIO()',
    'img.save(out, format="PNG")',
    'sys.stdout.buffer.write(out.getvalue())',
  ].join('; ');
  const result = spawnSync(pythonPath, ['-c', script], {
    input: image,
    maxBuffer: 32 * 1024 * 1024,
    encoding: 'buffer',
  });
  if (result.status !== 0) {
    const err = (result.stderr?.toString('utf8') || result.error?.message || 'Pillow convert failed').slice(
      0,
      240,
    );
    throw new Error(
      `NVIDIA image was JPEG but PNG conversion failed (${err}). Install Pillow for the configured Python.`,
    );
  }
  const png = result.stdout as Buffer;
  if (!isPng(png)) {
    throw new Error('NVIDIA JPEG→PNG conversion produced non-PNG output');
  }
  return png;
}

function parseErrorMessage(body: GenaiImageResponse | null, status: number): string {
  if (!body) return `NVIDIA image API failed (HTTP ${status})`;
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail.map((d) => (typeof d === 'string' ? d : d.msg ?? JSON.stringify(d))).join('; ');
  }
  if (body.error?.message) return body.error.message;
  if (body.title) return body.title;
  return `NVIDIA image API failed (HTTP ${status})`;
}

/** Hosted NVIDIA Visual GenAI — POST ai.api.nvidia.com/v1/genai/{model}. */
export class NvidiaImageProvider implements ImageGenerator {
  id = 'nvidia-image';
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly imageApiBaseUrl: string;
  private readonly modelId: string;
  private readonly enabled: boolean;
  private readonly pythonPath: string;

  constructor(config: NvidiaImageConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.NVIDIA_API_KEY;
    this.baseUrl = (config.baseUrl ?? process.env.NVIDIA_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.imageApiBaseUrl = (
      config.imageApiBaseUrl ??
      process.env.NVIDIA_IMAGE_API_BASE_URL ??
      DEFAULT_IMAGE_API_BASE
    ).replace(/\/$/, '');
    this.modelId = config.modelId ?? process.env.NVIDIA_IMAGE_MODEL ?? DEFAULT_MODEL;
    this.enabled = config.enabled ?? !!this.apiKey;
    this.pythonPath = config.pythonPath ?? process.env.DIFFUSERS_PYTHON ?? 'python';
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    const details = await this.getHealthDetails();
    return {
      status: details.status,
      reason: details.reason,
      latencyMs: details.latencyMs,
      nearbyModels: details.nearbyModels,
      suggestedModelIds: details.suggestedModelIds,
      safeDiagnostic: details.safeDiagnostic,
    };
  }

  /**
   * Structured health for Providers UI / doctor. Never logs or returns the API key.
   * Auth: GET integrate /models. Image path: GET genai/{model} expects 405 (path exists).
   * Image models are often absent from /models — known genai ids remain selectable.
   */
  async getHealthDetails(): Promise<NvidiaImageHealthDetails> {
    const now = new Date().toISOString();
    if (!this.enabled || !this.apiKey) {
      return {
        status: 'MISCONFIGURED',
        reason: 'NVIDIA_API_KEY is not configured',
        configured: false,
        latencyMs: null,
        lastCheckedAt: now,
        safeDiagnostic: 'Set NVIDIA_API_KEY in repo-root .env (main/CLI only).',
      };
    }

    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      const latencyMs = Date.now() - start;

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'AUTH_FAILED',
          reason: `NVIDIA image API rejected credentials (HTTP ${res.status})`,
          configured: true,
          latencyMs,
          lastCheckedAt: now,
          safeDiagnostic: 'Key rejected by integrate /models — rotate or recreate NVIDIA_API_KEY.',
        };
      }
      if (res.status === 429) {
        return {
          status: 'RATE_LIMITED',
          reason: 'NVIDIA image API rate limited (HTTP 429)',
          configured: true,
          latencyMs,
          lastCheckedAt: now,
        };
      }
      if (!res.ok) {
        return {
          status: 'UNAVAILABLE',
          reason: `NVIDIA image models endpoint returned HTTP ${res.status}`,
          configured: true,
          latencyMs,
          lastCheckedAt: now,
        };
      }

      const data = (await res.json()) as { data?: { id: string }[] };
      const ids = (data.data ?? []).map((m) => m.id);
      const nearbyFromCatalog = ids.filter(
        (id) =>
          id.includes('flux') ||
          id.includes('stable-diffusion') ||
          id.includes('sdxl') ||
          id.includes('imagen'),
      );

      // Probe genai path cheaply (GET → 405 Method Not Allowed means route exists).
      let genaiReachable = false;
      let genaiDiag = '';
      try {
        const genaiRes = await fetch(`${this.imageApiBaseUrl}/${this.modelId}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        // 405 = method not allowed (POST-only) → healthy path; 404 = model/function missing
        if (genaiRes.status === 405 || genaiRes.status === 401 || genaiRes.status === 403) {
          genaiReachable = true;
        } else if (genaiRes.status === 404) {
          genaiDiag = `genai path returned HTTP 404 for model ${this.modelId}`;
        } else {
          genaiReachable = genaiRes.status < 500;
          genaiDiag = `genai probe HTTP ${genaiRes.status}`;
        }
      } catch (err) {
        return {
          status: 'NETWORK_ERROR',
          reason: err instanceof Error ? err.message : 'NVIDIA genai health probe failed',
          configured: true,
          latencyMs: Date.now() - start,
          lastCheckedAt: now,
          safeDiagnostic: 'Could not reach ai.api.nvidia.com genai endpoint.',
          nearbyModels: nearbyFromCatalog.length > 0 ? nearbyFromCatalog : [...KNOWN_GENAI_IMAGE_MODELS],
          suggestedModelIds: (nearbyFromCatalog.length > 0
            ? nearbyFromCatalog
            : [...KNOWN_GENAI_IMAGE_MODELS]
          ).slice(0, 5),
        };
      }

      const knownSuggestions = [...KNOWN_GENAI_IMAGE_MODELS];
      const nearby =
        nearbyFromCatalog.length > 0
          ? nearbyFromCatalog
          : knownSuggestions.filter((id) => id !== this.modelId || true);
      const suggested = (nearbyFromCatalog.length > 0 ? nearbyFromCatalog : knownSuggestions).slice(0, 5);

      if (ids.includes(this.modelId) && genaiReachable) {
        return {
          status: 'HEALTHY',
          reason: `NVIDIA image API reachable; model ${this.modelId} listed and genai path OK`,
          configured: true,
          latencyMs: Date.now() - start,
          lastCheckedAt: now,
          nearbyModels: nearby,
          suggestedModelIds: suggested,
        };
      }

      if (genaiReachable && (KNOWN_GENAI_IMAGE_MODELS as readonly string[]).includes(this.modelId)) {
        return {
          status: 'HEALTHY',
          reason:
            `NVIDIA genai image endpoint reachable for ${this.modelId} ` +
            `(hosted Visual GenAI; not required to appear on integrate /models).`,
          configured: true,
          latencyMs: Date.now() - start,
          lastCheckedAt: now,
          nearbyModels: nearby,
          suggestedModelIds: suggested,
          safeDiagnostic: 'Image invoke uses ai.api.nvidia.com/v1/genai/{model}, not /images/generations.',
        };
      }

      if (!genaiReachable) {
        return {
          status: 'MODEL_UNAVAILABLE',
          reason:
            genaiDiag ||
            `Configured NVIDIA_IMAGE_MODEL "${this.modelId}" is not available on the genai endpoint.`,
          configured: true,
          latencyMs: Date.now() - start,
          lastCheckedAt: now,
          nearbyModels: nearby,
          suggestedModelIds: suggested,
          safeDiagnostic: `Set NVIDIA_IMAGE_MODEL to one of: ${suggested.join(', ')}`,
        };
      }

      return {
        status: 'DEGRADED',
        reason:
          `Configured NVIDIA_IMAGE_MODEL "${this.modelId}" is not listed on /models. ` +
          `Suggested image models: ${suggested.slice(0, 3).join(', ')}. ` +
          `Set NVIDIA_IMAGE_MODEL then re-probe.`,
        configured: true,
        latencyMs: Date.now() - start,
        lastCheckedAt: now,
        nearbyModels: nearby,
        suggestedModelIds: suggested,
        safeDiagnostic: genaiDiag || undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'NVIDIA image health probe failed';
      const network =
        /fetch failed|ECONNREFUSED|ENOTFOUND|AbortError|timeout|network/i.test(msg) ||
        err instanceof TypeError;
      return {
        status: network ? 'NETWORK_ERROR' : 'UNAVAILABLE',
        reason: msg,
        configured: true,
        latencyMs: Date.now() - start,
        lastCheckedAt: now,
      };
    }
  }

  async checkHealth(): Promise<boolean> {
    const details = await this.getHealthDetails();
    return details.status === 'HEALTHY' || details.status === 'DEGRADED';
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    if (!this.apiKey) {
      throw new Error('NVIDIA_API_KEY is not configured');
    }

    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);
    const width = clampFluxDim(request.width);
    const height = clampFluxDim(request.height);
    const url = `${this.imageApiBaseUrl}/${this.modelId}`;

    // FLUX hosted preview: keep payload minimal (extra fields → 422 on some variants).
    // NVCF-POLL-SECONDS required — without it the client can hang with 0 bytes.
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'NVCF-POLL-SECONDS': '120',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        seed,
        width,
        height,
      }),
      signal: mergeAbortSignal(request.signal, 180_000),
    });

    const rawText = await res.text();
    let body: GenaiImageResponse | null = null;
    try {
      body = JSON.parse(rawText) as GenaiImageResponse;
    } catch {
      body = null;
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(`NVIDIA image API auth failed (HTTP ${res.status})`);
    }
    if (res.status === 429) {
      throw new Error('NVIDIA image API rate limited (HTTP 429)');
    }
    if (res.status === 404) {
      throw new Error(
        `NVIDIA image model unavailable (HTTP 404) for ${this.modelId}. Set NVIDIA_IMAGE_MODEL to a working genai id (e.g. black-forest-labs/flux.1-dev).`,
      );
    }
    if (res.status === 504 || res.headers.get('nvcf-status') === 'errored') {
      throw new Error(
        `NVIDIA image generation errored/timeout (HTTP ${res.status}) for ${this.modelId}. Try NVIDIA_IMAGE_MODEL=black-forest-labs/flux.1-dev.`,
      );
    }
    if (!res.ok) {
      throw new Error(parseErrorMessage(body, res.status));
    }

    const b64 = body?.artifacts?.[0]?.base64;
    if (!b64) {
      throw new Error('NVIDIA image API returned no image data');
    }

    const decoded = Buffer.from(b64, 'base64');
    const image = ensurePngBuffer(decoded, this.pythonPath);

    return {
      image,
      provider: this.id,
      modelId: this.modelId,
      seed,
      fallbackGenerated: false,
      fallbackDepth: 0,
      selectedProvider: this.id,
      selectedModel: this.modelId,
      requestedCapability: 'IMAGE_GENERATION',
      productionAllowed: true,
    };
  }
}
