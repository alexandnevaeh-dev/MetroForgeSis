import { spawnSync } from 'node:child_process';
import type { ImageGenRequest, ImageGenResult, ImageGenerator, ImageProviderHealthReport } from '../types/image-gen.js';
import { mergeAbortSignal } from '@metroforge/shared';
import { decodePngRgba } from '../png.js';

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
  /** Extra generate attempts after the first (default 2 → 3 total). */
  maxRetries?: number;
  /** Backoff between retries in ms (default [1000, 2000]). */
  retryBackoffMs?: number[];
}

interface GenaiImageResponse {
  artifacts?: { base64?: string; finishReason?: string }[];
  detail?: string | { msg?: string }[];
  title?: string;
  error?: { message?: string };
}

/**
 * Empty / tiny / corrupt NVCF payloads — safe to retry with backoff.
 * Auth, rate-limit, and hard 404s are not retryable.
 */
export class NvidiaInvalidImagePayloadError extends Error {
  readonly retryable = true as const;
  constructor(message: string) {
    super(message);
    this.name = 'NvidiaInvalidImagePayloadError';
  }
}

/** Real FLUX 1024² artifacts are far larger; ~6KB HTTP bodies with tiny/empty base64 fail here. */
export const NVIDIA_MIN_DECODED_IMAGE_BYTES = 5_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [1_000, 2_000] as const;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNvidiaImageError(err: unknown): boolean {
  if (err instanceof NvidiaInvalidImagePayloadError) return true;
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    /no image data|too small|blank|near-black|unrecognized image|corrupt|errored\/timeout|HTTP 504|empty NVCF|invalid NVCF/i.test(
      msg,
    ) || err.name === 'NvidiaInvalidImagePayloadError'
  );
}

/** Reject empty / tiny / non-image / near-black decoded NVCF artifacts early. */
export function assertValidNvidiaImageBytes(decoded: Buffer): void {
  if (decoded.length === 0) {
    throw new NvidiaInvalidImagePayloadError('NVIDIA image API returned empty image bytes');
  }
  if (decoded.length < NVIDIA_MIN_DECODED_IMAGE_BYTES) {
    throw new NvidiaInvalidImagePayloadError(
      `NVIDIA image payload too small (${decoded.length} bytes) — likely blank/corrupt NVCF response`,
    );
  }
  if (!isPng(decoded) && !isJpeg(decoded)) {
    throw new NvidiaInvalidImagePayloadError(
      'NVIDIA image API returned unrecognized image bytes (expected PNG or JPEG)',
    );
  }
}

function assertPngHasVisibleContent(png: Buffer): void {
  let decoded: { rgba: Uint8Array; width: number; height: number };
  try {
    decoded = decodePngRgba(png);
  } catch (err) {
    throw new NvidiaInvalidImagePayloadError(
      `NVIDIA image PNG corrupt or undecodable (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  const { rgba, width, height } = decoded;
  const pixels = width * height;
  if (pixels <= 0) {
    throw new NvidiaInvalidImagePayloadError('NVIDIA image has zero dimensions');
  }
  let nonBlack = 0;
  const stride = Math.max(1, Math.floor(pixels / 4096));
  for (let p = 0; p < pixels; p += stride) {
    const i = p * 4;
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    const a = rgba[i + 3] ?? 0;
    if (a > 16 && (r > 8 || g > 8 || b > 8)) nonBlack += 1;
  }
  const samples = Math.ceil(pixels / stride);
  const ratio = samples > 0 ? nonBlack / samples : 0;
  if (ratio < 0.01) {
    throw new NvidiaInvalidImagePayloadError(
      `NVIDIA image appears blank/near-black (visible ratio ${ratio.toFixed(4)})`,
    );
  }
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
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number[];

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
    this.maxRetries = Math.max(0, config.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.retryBackoffMs = config.retryBackoffMs?.length
      ? config.retryBackoffMs.map((n) => Math.max(0, n))
      : [...RETRY_BACKOFF_MS];
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
    const maxAttempts = 1 + this.maxRetries;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Slight seed jitter on retries — same prompt+seed often re-hits CONTENT_FILTERED.
        const attemptSeed = attempt === 1 ? seed : (seed + attempt * 9973) >>> 0;
        return await this.generateImageOnce(request, attemptSeed);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const retryable = isRetryableNvidiaImageError(lastError);
        if (!retryable || attempt >= maxAttempts) {
          if (attempt > 1) {
            throw new Error(
              `${lastError.message} (failed after ${attempt} NVIDIA image attempts)`,
            );
          }
          throw lastError;
        }
        const delayMs =
          this.retryBackoffMs[Math.min(attempt - 1, this.retryBackoffMs.length - 1)] ?? 1_000;
        if (delayMs > 0) await sleep(delayMs);
      }
    }

    throw lastError ?? new Error('NVIDIA image generation failed');
  }

  private async generateImageOnce(request: ImageGenRequest, seed: number): Promise<ImageGenResult> {
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
      throw new NvidiaInvalidImagePayloadError(
        `NVIDIA image generation errored/timeout (HTTP ${res.status}) for ${this.modelId}. Try NVIDIA_IMAGE_MODEL=black-forest-labs/flux.1-dev.`,
      );
    }
    if (!res.ok) {
      throw new Error(parseErrorMessage(body, res.status));
    }

    // Fulfilled but empty/tiny bodies (~6KB) are the flaky Manual Generator failure mode.
    if (!body || typeof body !== 'object') {
      throw new NvidiaInvalidImagePayloadError(
        `NVIDIA image API returned invalid NVCF JSON (${rawText.length} bytes)`,
      );
    }

    const artifact = body.artifacts?.[0];
    const finishReason = artifact?.finishReason?.toUpperCase() ?? '';
    const b64 = artifact?.base64?.trim();
    if (!b64) {
      const reasonHint = finishReason ? ` finishReason=${artifact?.finishReason}` : '';
      throw new NvidiaInvalidImagePayloadError(
        `NVIDIA image API returned no image data (response ${rawText.length} bytes${reasonHint})`,
      );
    }

    // CONTENT_FILTERED / ERROR without usable bytes already handled above. If base64 is present,
    // continue into size/magic/visible checks — flaky NVCF sometimes labels good JPEGs oddly.
    if (finishReason && /ERROR|FAIL|REJECT/.test(finishReason) && rawText.length < 8_000) {
      throw new NvidiaInvalidImagePayloadError(
        `NVIDIA image artifact finishReason=${artifact?.finishReason ?? 'unknown'}`,
      );
    }

    let decoded: Buffer;
    try {
      decoded = Buffer.from(b64, 'base64');
    } catch {
      throw new NvidiaInvalidImagePayloadError('NVIDIA image API returned undecodable base64');
    }

    assertValidNvidiaImageBytes(decoded);
    const image = ensurePngBuffer(decoded, this.pythonPath);
    assertPngHasVisibleContent(image);

    // After size/magic/visible checks, SUCCESS and CONTENT_FILTERED-with-valid-pixels both return.

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
