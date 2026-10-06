import type {
  ImageGenRequest,
  ImageGenResult,
  ImageGenerator,
  ImageProviderHealthReport,
} from '../types/image-gen.js';
import type { ImageEditor, ImageEditRequest, ImageEditResult } from '../types/image-edit.js';
import { foundryFetch, classifyHttpStatus, decodeImagePayload, type FoundryFetch } from '../foundry/http.js';
import { AuthenticationError, LicenseRejectedError, UnsupportedCapabilityError } from '../foundry/errors.js';
import { classifyAssetLicense, licensePasses } from '../foundry/license.js';
import { ensurePngBuffer } from '../image-format.js';
import { decodePngRgba } from '../png.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface HuggingFaceImageConfig {
  apiKey?: string;
  modelId?: string;
  baseUrl?: string;
  /** Model id for image-to-image/edit requests — a *different* pipeline-tag model than
   *  text-to-image (modelId). Defaults to a well-documented image-to-image model; capability is
   *  not guaranteed without a live probe (see getEditHealthReport). */
  editModelId?: string;
  commercialUseRequired?: boolean;
  enabled?: boolean;
  fetchImpl?: FoundryFetch;
}

/**
 * Hugging Face Inference image adapter. Does not assume a public model has free inference —
 * health-checks the model card + endpoint first.
 */
export class HuggingFaceImageProvider implements ImageGenerator, ImageEditor {
  id = 'huggingface-image';
  private readonly apiKey?: string;
  private readonly modelId: string;
  private readonly editModelId: string;
  private readonly baseUrl: string;
  private readonly commercialUseRequired: boolean;
  private readonly enabled: boolean;
  private readonly fetchImpl: FoundryFetch;

  constructor(config: HuggingFaceImageConfig = {}) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'stabilityai/sdxl-turbo';
    // Qwen-Image-Edit is the best-documented open image-to-image/instruction-edit model
    // currently hosted on HF Inference — see huggingface.co/Qwen/Qwen-Image-Edit. Unverified in
    // this environment (no HUGGINGFACE_API_KEY configured to probe against) — see
    // getEditHealthReport()/probeEditCapability() and the Candidate 06C report.
    this.editModelId = config.editModelId ?? process.env.HUGGINGFACE_EDIT_MODEL ?? 'Qwen/Qwen-Image-Edit';
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

  /**
   * Bounded capability probe distinct from getHealthReport() (which checks the *generation*
   * model card) — this checks whether editModelId's model card actually exists and is tagged for
   * an image-to-image-capable task, before any real edit is attempted. Per the task spec: "Probe
   * it. Do not start 20 character edits before proving one works."
   */
  async probeEditCapability(): Promise<{ available: boolean; reason: string; modelId: string }> {
    if (!this.apiKey) return { available: false, reason: 'HUGGINGFACE_API_KEY not set', modelId: this.editModelId };
    try {
      const card = await foundryFetch(
        `https://huggingface.co/api/models/${this.editModelId}`,
        { timeoutMs: 8000, secrets: [this.apiKey] },
        this.fetchImpl,
      );
      if (card.status === 401 || card.status === 403) {
        return { available: false, reason: 'Hugging Face authentication failed', modelId: this.editModelId };
      }
      if (card.status === 404) {
        return { available: false, reason: `model ${this.editModelId} does not exist`, modelId: this.editModelId };
      }
      if (!card.ok) {
        return { available: false, reason: `model card HTTP ${card.status}`, modelId: this.editModelId };
      }
      const data = (await card.json()) as { pipeline_tag?: string; gated?: boolean };
      const task = data.pipeline_tag ?? '';
      if (task && !/image-to-image|image-text-to-image/.test(task)) {
        return { available: false, reason: `model task "${task}" is not image-editing capable`, modelId: this.editModelId };
      }
      return { available: true, reason: data.gated ? 'reachable but gated' : 'reachable', modelId: this.editModelId };
    } catch (err) {
      return {
        available: false,
        reason: err instanceof Error ? err.message : 'edit capability probe failed',
        modelId: this.editModelId,
      };
    }
  }

  /**
   * Image-to-image edit via HF's classic Inference API — same request/response shape as
   * generateImage() above (JSON {inputs, parameters}), just with `inputs` carrying the base64
   * source image instead of a text prompt, and the instruction moved into `parameters.prompt`.
   * This is the best-documented, widely-used pattern for image-to-image pipeline-tag models on
   * classic HF Inference (as opposed to the newer multi-provider "Inference Providers" router,
   * whose exact request shape varies per routed provider). UNVERIFIED against a live endpoint in
   * this environment — no HUGGINGFACE_API_KEY configured to test against; see
   * probeEditCapability() and the Candidate 06C report for what was and wasn't confirmed live.
   */
  async editImage(request: ImageEditRequest): Promise<ImageEditResult> {
    if (!this.apiKey) throw new AuthenticationError('HUGGINGFACE_API_KEY not set');
    if (request.sourceAssets.length === 0) {
      throw new UnsupportedCapabilityError('Hugging Face image edit requires at least one source asset');
    }
    const source = request.sourceAssets[0]!;
    const sourceBytes = source.bytes ?? (source.path ? readFileSync(source.path) : undefined);
    if (!sourceBytes) {
      throw new UnsupportedCapabilityError('Hugging Face image edit requires source bytes or a readable path');
    }

    const modelId = request.modelOverride ?? this.editModelId;
    const seed = request.seed ?? 0;
    const started = Date.now();
    const res = await foundryFetch(
      `${this.baseUrl}/${modelId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeoutMs: 90_000,
        secrets: [this.apiKey],
        body: JSON.stringify({
          inputs: sourceBytes.toString('base64'),
          parameters: { prompt: request.instruction, width: request.width, height: request.height, seed },
        }),
        signal: request.signal,
      },
      this.fetchImpl,
    );
    if (!res.ok) throw classifyHttpStatus(res.status, await res.text());
    const contentType = res.headers.get('content-type') ?? '';
    const rawImage = contentType.includes('application/json')
      ? decodeImagePayload(await res.json(), [this.apiKey])
      : Buffer.from(await res.arrayBuffer());
    const png = ensurePngBuffer(rawImage);
    let width = request.width ?? 0;
    let height = request.height ?? 0;
    try {
      const decoded = decodePngRgba(png);
      width = decoded.width;
      height = decoded.height;
    } catch {
      /* keep requested dims */
    }

    return {
      provider: this.id,
      model: modelId,
      sourceAssetIds: [source.assetId],
      images: [{ buffer: png, mimeType: 'image/png', width, height }],
      seed,
      durationMs: Date.now() - started,
      provenance: {
        provider: this.id,
        model: modelId,
        capability: 'IMAGE_EDIT',
        sourceAssetIds: [source.assetId],
        instructionHash: createHash('sha256').update(request.instruction).digest('hex').slice(0, 16),
        seed,
        generatedAt: new Date().toISOString(),
        nativeDimensions: { width, height },
        source: 'image_edit',
        purpose: request.purpose,
      },
    };
  }
}
