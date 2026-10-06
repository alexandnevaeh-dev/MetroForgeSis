import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mergeAbortSignal, resolvePythonExecutable } from '@metroforge/shared';
import type { ImageEditRequest, ImageEditResult } from '../types/image-edit.js';
import { decodePngRgba } from '../png.js';
import { nvidiaModelById, nvidiaSelectModelForImageTask } from '../foundry/nvidia-catalog.js';
import {
  buildNimImageEditMultipart,
  classifyNvidiaHttpFailure,
  extractNimEditImageBytes,
  hostedEditRequestBody,
  parseNvidiaErrorBody,
  requestHash,
  type NvidiaImageEndpointFamily,
  type NvidiaProviderDiagnostic,
} from './nvidia-image-contract.js';
import {
  assertValidNvidiaImageBytes,
  NvidiaContentFilteredError,
  NvidiaInvalidImagePayloadError,
  type NvidiaImageConfig,
} from './nvidia-image.js';
import {
  assertNoSecretLeak,
  buildNvidiaProvenance,
  hashNvidiaPrompt,
  resolveNvidiaConfig,
} from './nvidia-foundation.js';
import {
  classifyNvidiaErrorCode,
  NvidiaStructuredError,
  type NvidiaFoundationErrorCode,
} from './nvidia-provider.js';
import { NvidiaHttpClient } from './nvidia-http.js';
import {
  classifyNimErrorFromMessage,
  resolveCapabilityDeployment,
} from './nvidia-nim.js';
import { buildNimEndpoint, normalizeNimBaseUrl } from './nvidia-nim-url.js';

interface GenaiImageResponse {
  artifacts?: { base64?: string; finishReason?: string }[];
  detail?: string | { msg?: string }[];
  title?: string;
  error?: { message?: string };
}

const DEFAULT_IMAGE_API_BASE = 'https://ai.api.nvidia.com/v1/genai';
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
}

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function ensurePngBuffer(image: Buffer, pythonPath: string): Buffer {
  if (isPng(image)) return image;
  if (!isJpeg(image)) {
    throw new NvidiaStructuredError({
      code: 'NVIDIA_INVALID_RESPONSE',
      provider: 'nvidia',
      capability: 'IMAGE_EDIT',
      classification: 'PROVIDER_RESPONSE_INVALID',
      retryable: false,
      message: 'NVIDIA image edit returned unrecognized image bytes',
    });
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
  if (result.status !== 0 || !isPng(result.stdout as Buffer)) {
    throw new NvidiaStructuredError({
      code: 'NVIDIA_INVALID_RESPONSE',
      provider: 'nvidia',
      capability: 'IMAGE_EDIT',
      classification: 'PROVIDER_RESPONSE_INVALID',
      retryable: false,
      message: 'NVIDIA JPEG→PNG conversion failed for edit output',
    });
  }
  return result.stdout as Buffer;
}

function parseErrorMessage(body: GenaiImageResponse | null, status: number): string {
  if (!body) return `NVIDIA image edit API failed (HTTP ${status})`;
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail.map((d) => (typeof d === 'string' ? d : d.msg ?? JSON.stringify(d))).join('; ');
  }
  if (body.error?.message) return body.error.message;
  if (body.title) return body.title;
  return `NVIDIA image edit API failed (HTTP ${status})`;
}

function loadReferenceBytes(ref: ImageEditRequest['sourceAssets'][number]): Buffer {
  if (ref.bytes?.length) return ref.bytes;
  if (ref.path) return readFileSync(ref.path);
  throw new NvidiaStructuredError({
    code: 'NVIDIA_INVALID_SOURCE_ASSET',
    provider: 'nvidia',
    capability: 'IMAGE_EDIT',
    classification: 'PROVIDER_REQUEST_INVALID',
    retryable: false,
    message: `Source asset ${ref.assetId} has no bytes or readable path`,
  });
}

function assertSourceDecodes(bytes: Buffer, assetId: string): { width: number; height: number } {
  if (bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) {
    throw new NvidiaStructuredError({
      code: 'NVIDIA_INVALID_SOURCE_ASSET',
      provider: 'nvidia',
      capability: 'IMAGE_EDIT',
      classification: 'PROVIDER_REQUEST_INVALID',
      retryable: false,
      message: `Source asset ${assetId} has invalid file size (${bytes.length} bytes)`,
    });
  }
  if (!isPng(bytes) && !isJpeg(bytes)) {
    throw new NvidiaStructuredError({
      code: 'NVIDIA_INVALID_SOURCE_ASSET',
      provider: 'nvidia',
      capability: 'IMAGE_EDIT',
      classification: 'PROVIDER_REQUEST_INVALID',
      retryable: false,
      message: `Source asset ${assetId} MIME type unsupported (expected PNG or JPEG)`,
    });
  }
  try {
    if (isPng(bytes)) {
      const decoded = decodePngRgba(bytes);
      return { width: decoded.width, height: decoded.height };
    }
  } catch {
    /* JPEG dimensions optional for preflight */
  }
  return { width: 1024, height: 1024 };
}

function mapNimHttpError(status: number, message: string): NvidiaFoundationErrorCode {
  const fromMsg = classifyNimErrorFromMessage(message, status);
  if (fromMsg) return fromMsg;
  if (status === 401 || status === 403) return 'NVIDIA_AUTH_ERROR';
  if (status === 404) return 'NVIDIA_MODEL_NOT_FOUND';
  if (status === 429) return 'NVIDIA_RATE_LIMIT';
  if (status === 408 || status === 504) return 'NVIDIA_TIMEOUT';
  return classifyNvidiaErrorCode(status, message);
}

/**
 * NVIDIA IMAGE_EDIT provider.
 * - Hosted preview: POST {imageApiBaseUrl}/{model} JSON + data URI (may reject custom refs).
 * - NIM: POST {NVIDIA_NIM_BASE_URL}/images/edits multipart (custom MetroForge images).
 */
export class NvidiaImageEditProvider {
  readonly id = 'nvidia-image-edit';
  private readonly apiKey: string | undefined;
  private readonly imageApiBaseUrl: string;
  private readonly nimBaseUrl: string | undefined;
  private readonly modelId: string;
  private readonly enabled: boolean;
  private readonly pythonPath: string;
  private readonly maxRetries: number;
  private readonly http: NvidiaHttpClient;
  private lastDiagnostic: NvidiaProviderDiagnostic | null = null;
  private lastRequestId: string | undefined;
  private lastEndpointFamily: NvidiaImageEndpointFamily = 'NVIDIA_HOSTED_BUILD_API';

  constructor(config: NvidiaImageConfig = {}) {
    const resolved = resolveNvidiaConfig();
    this.apiKey = config.apiKey ?? process.env.NVIDIA_API_KEY;
    this.imageApiBaseUrl = (
      config.imageApiBaseUrl ??
      process.env.NVIDIA_IMAGE_API_BASE_URL ??
      DEFAULT_IMAGE_API_BASE
    ).replace(/\/$/, '');
    this.nimBaseUrl = normalizeNimBaseUrl(config.nimBaseUrl ?? resolved.nimBaseUrl);
    this.modelId =
      config.modelId ??
      process.env.NVIDIA_IMAGE_EDIT_MODEL ??
      process.env.NVIDIA_IMAGE_MODEL ??
      nvidiaSelectModelForImageTask('IMAGE_EDIT').modelId;
    this.enabled = config.enabled ?? Boolean(this.apiKey || this.nimBaseUrl);
    this.pythonPath = resolvePythonExecutable(config.pythonPath);
    this.maxRetries = Math.max(0, config.maxRetries ?? 0);
    this.http = new NvidiaHttpClient({
      apiKey: this.apiKey,
      baseUrl: this.nimBaseUrl ?? resolved.baseUrl,
      timeoutMs: 180_000,
    });
  }

  get endpointFamily(): NvidiaImageEndpointFamily {
    return this.lastEndpointFamily;
  }

  getLastDiagnostic(): NvidiaProviderDiagnostic | null {
    return this.lastDiagnostic;
  }

  getLastRequestId(): string | undefined {
    return this.lastRequestId;
  }

  /** Prefer NIM when NVIDIA_NIM_BASE_URL is set; otherwise hosted genai preview. */
  resolveEditDeployment(): ReturnType<typeof resolveCapabilityDeployment> {
    return resolveCapabilityDeployment('IMAGE_EDIT');
  }

  validateRequest(request: ImageEditRequest, modelId?: string): void {
    const deployment = this.resolveEditDeployment();
    if (deployment.mode === 'nim' && !this.nimBaseUrl) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_NIM_NOT_CONFIGURED',
        provider: 'nvidia',
        capability: 'IMAGE_EDIT',
        classification: 'CONFIGURATION',
        retryable: false,
        message: 'NVIDIA_NIM_BASE_URL is not configured for custom-reference IMAGE_EDIT',
      });
    }
    if (deployment.mode === 'hosted' && !this.apiKey) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_CONFIGURATION_ERROR',
        provider: 'nvidia',
        capability: 'IMAGE_EDIT',
        classification: 'CONFIGURATION',
        retryable: false,
        message: 'NVIDIA_API_KEY is not configured',
      });
    }
    if (!this.enabled) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_CONFIGURATION_ERROR',
        provider: 'nvidia',
        capability: 'IMAGE_EDIT',
        classification: 'CONFIGURATION',
        retryable: false,
        message: 'NVIDIA image edit provider is disabled',
      });
    }
    if (!request.instruction.trim()) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_INVALID_SOURCE_ASSET',
        provider: 'nvidia',
        capability: 'IMAGE_EDIT',
        classification: 'PROVIDER_REQUEST_INVALID',
        retryable: false,
        message: 'Image edit instruction must not be empty',
      });
    }
    if (request.sourceAssets.length === 0) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_INVALID_SOURCE_ASSET',
        provider: 'nvidia',
        capability: 'IMAGE_EDIT',
        classification: 'PROVIDER_REQUEST_INVALID',
        retryable: false,
        message: 'Image edit requires at least one source asset',
      });
    }

    const selectedModel = modelId ?? request.modelOverride ?? this.modelId;
    const meta = nvidiaModelById(selectedModel);
    const allowNimNotConfigured =
      deployment.mode === 'nim' && meta && (meta.nimAvailable || meta.supportsCustomReferences);
    if (!meta || (meta.status !== 'enabled' && !(allowNimNotConfigured && meta.status === 'not-configured'))) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_MODEL_NOT_FOUND',
        provider: 'nvidia',
        model: selectedModel,
        capability: 'IMAGE_EDIT',
        classification: 'PROVIDER_REQUEST_INVALID',
        retryable: false,
        message: `NVIDIA model unavailable or disabled: ${selectedModel}`,
      });
    }
    if (!meta.supportsEditing && !meta.capabilities.includes('IMAGE_EDIT') && !meta.capabilities.includes('image-editing')) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_UNSUPPORTED_CAPABILITY',
        provider: 'nvidia',
        model: selectedModel,
        capability: 'IMAGE_EDIT',
        classification: 'UNSUPPORTED',
        retryable: false,
        message: `Model ${selectedModel} does not support IMAGE_EDIT`,
      });
    }

    if (deployment.mode === 'nim' && meta.supportsCustomReferences === false && meta.hostedAvailable) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_UNSUPPORTED_CAPABILITY',
        provider: 'nvidia',
        model: selectedModel,
        capability: 'IMAGE_EDIT',
        classification: 'UNSUPPORTED',
        retryable: false,
        message: `Model ${selectedModel} does not support custom MetroForge reference uploads on this deployment`,
      });
    }
    // NOTE: considered adding a hosted-mode supportsCustomReferences:false pre-flight block here
    // (mirroring the NIM-mode check above), but nvidia-image-edit.test.ts's "NVIDIA image edit
    // HTTP" suite deliberately exercises flux.1-kontext-dev with real (non-canned) reference bytes
    // and expects a genuine attempt against the network (401/422/200 all handled), not a pre-empted
    // validation error — i.e. the hosted endpoint's actual behavior for custom references is
    // apparently not as clear-cut as the catalog's supportsCustomReferences:false flag suggests
    // (real HTTP 422 "expected example_id, got base64" is one *observed* failure mode, not a
    // universal one). Left as a real network attempt, consistent with existing tested behavior —
    // see the Candidate 06C report for what the *live* result actually was.

    const maxRefs = meta.maxReferenceImages ?? (meta.supportsReferenceImages ? 1 : 0);
    if (maxRefs > 0 && request.sourceAssets.length > maxRefs) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_REFERENCE_LIMIT_EXCEEDED',
        provider: 'nvidia',
        model: selectedModel,
        capability: 'IMAGE_EDIT',
        classification: 'PROVIDER_REQUEST_INVALID',
        retryable: false,
        message: `Model ${selectedModel} accepts at most ${maxRefs} reference image(s)`,
      });
    }

    if (request.mask && !meta.supportsMask) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_UNSUPPORTED_CAPABILITY',
        provider: 'nvidia',
        model: selectedModel,
        capability: 'IMAGE_EDIT',
        classification: 'UNSUPPORTED',
        retryable: false,
        message: `Model ${selectedModel} does not support mask editing`,
      });
    }

    for (const ref of request.sourceAssets) {
      assertSourceDecodes(loadReferenceBytes(ref), ref.assetId);
    }
  }

  async editImage(request: ImageEditRequest): Promise<ImageEditResult> {
    const deployment = this.resolveEditDeployment();
    const modelId =
      request.modelOverride ??
      (deployment.mode === 'nim'
        ? process.env.NVIDIA_IMAGE_EDIT_MODEL?.trim() || 'qwen/qwen-image-edit-2511'
        : this.modelId);
    this.validateRequest(request, modelId);

    if (deployment.mode === 'nim') {
      return this.editViaNim(request, modelId);
    }
    return this.editViaHosted(request, modelId);
  }

  private async editViaNim(request: ImageEditRequest, modelId: string): Promise<ImageEditResult> {
    this.lastEndpointFamily = 'NVIDIA_SELF_HOSTED_NIM_OPENAI_IMAGES';
    const started = Date.now();
    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);
    const references = request.sourceAssets.map((ref) => loadReferenceBytes(ref));
    const width = request.width ?? 1024;
    const height = request.height ?? 1024;

    let multipart: ReturnType<typeof buildNimImageEditMultipart>;
    try {
      multipart = buildNimImageEditMultipart({
        model: modelId.includes('/') ? modelId.split('/').pop()! : modelId,
        instruction: request.instruction,
        references,
        seed,
      });
    } catch (err) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_INVALID_SOURCE_ASSET',
        provider: 'nvidia',
        model: modelId,
        capability: 'IMAGE_EDIT',
        classification: 'PROVIDER_REQUEST_INVALID',
        retryable: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const maxAttempts = 1 + this.maxRetries;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const editUrl = buildNimEndpoint(this.nimBaseUrl, 'images/edits');
        if (!editUrl) {
          throw new NvidiaStructuredError({
            code: 'NVIDIA_NIM_NOT_CONFIGURED',
            provider: 'nvidia',
            model: modelId,
            capability: 'IMAGE_EDIT',
            classification: 'CONFIGURATION',
            retryable: false,
            message: 'NVIDIA_NIM_BASE_URL is not configured',
          });
        }
        const res = await this.http.requestJson<unknown>({
          method: 'POST',
          url: editUrl,
          multipart,
          signal: request.signal,
          timeoutMs: 180_000,
          skipAuth: !this.apiKey,
        });

        this.lastRequestId = res.requestId;
        this.lastDiagnostic = {
          category: res.ok ? 'PROVIDER_RESPONSE_INVALID' : classifyNvidiaHttpFailure(res.status),
          endpointFamily: this.lastEndpointFamily,
          status: res.status,
          contentType: res.contentType,
          message: res.ok ? 'ok' : (parseNvidiaErrorBody(res.body).message ?? res.rawText).slice(0, 400),
          requestId: res.requestId,
          attempt,
          requestHash: requestHash({ model: modelId, prompt: request.instruction, seed, refs: references.length }),
        };

        if (!res.ok) {
          const msg = parseErrorMessage(res.body as GenaiImageResponse | null, res.status);
          throw new NvidiaStructuredError({
            code: mapNimHttpError(res.status, msg),
            provider: 'nvidia',
            model: modelId,
            capability: 'IMAGE_EDIT',
            httpStatus: res.status,
            classification: classifyNvidiaHttpFailure(res.status),
            retryable: res.status === 429 || res.status === 503 || res.status >= 500,
            message: msg,
            requestId: this.lastRequestId,
          });
        }

        const decoded = extractNimEditImageBytes(res.body);
        if (!decoded) {
          throw new NvidiaInvalidImagePayloadError('NVIDIA NIM image edit returned no image data');
        }
        assertValidNvidiaImageBytes(decoded);
        const png = ensurePngBuffer(decoded, this.pythonPath);
        let nativeWidth = width;
        let nativeHeight = height;
        try {
          const dims = decodePngRgba(png);
          nativeWidth = dims.width;
          nativeHeight = dims.height;
        } catch {
          /* keep defaults */
        }

        return this.toEditResult({
          request,
          modelId,
          png,
          seed,
          started,
          nativeWidth,
          nativeHeight,
          deployment: 'nim',
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof NvidiaStructuredError) throw err;
        if (attempt >= maxAttempts) break;
      }
    }

    const msg = lastError?.message ?? 'NVIDIA NIM image edit failed';
    assertNoSecretLeak(msg, this.apiKey);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|unreachable/i.test(msg)) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_NIM_UNREACHABLE',
        provider: 'nvidia',
        model: modelId,
        capability: 'IMAGE_EDIT',
        classification: 'TRANSPORT',
        retryable: false,
        message: msg,
      });
    }
    if (lastError instanceof NvidiaInvalidImagePayloadError) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_NIM_INVALID_RESPONSE',
        provider: 'nvidia',
        model: modelId,
        capability: 'IMAGE_EDIT',
        classification: 'PROVIDER_RESPONSE_INVALID',
        retryable: false,
        message: msg,
        requestId: this.lastRequestId,
      });
    }
    throw new NvidiaStructuredError({
      code: classifyNimErrorFromMessage(msg) ?? 'NVIDIA_NIM_INFERENCE_ERROR',
      provider: 'nvidia',
      model: modelId,
      capability: 'IMAGE_EDIT',
      classification: 'TRANSPORT',
      retryable: false,
      message: msg,
      requestId: this.lastRequestId,
    });
  }

  private async editViaHosted(request: ImageEditRequest, modelId: string): Promise<ImageEditResult> {
    this.lastEndpointFamily = 'NVIDIA_HOSTED_BUILD_API';
    const started = Date.now();
    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);
    const references = request.sourceAssets.map((ref) => loadReferenceBytes(ref));
    const width = request.width ?? 1024;
    const height = request.height ?? 1024;

    let payload: Record<string, unknown>;
    try {
      payload = hostedEditRequestBody({
        instruction: request.instruction,
        seed,
        width,
        height,
        references,
      });
    } catch (err) {
      throw new NvidiaStructuredError({
        code: 'NVIDIA_INVALID_SOURCE_ASSET',
        provider: 'nvidia',
        model: modelId,
        capability: 'IMAGE_EDIT',
        classification: 'PROVIDER_REQUEST_INVALID',
        retryable: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const url = `${this.imageApiBaseUrl}/${modelId}`;
    let lastError: Error | undefined;
    const maxAttempts = 1 + this.maxRetries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'NVCF-POLL-SECONDS': '120',
          },
          body: JSON.stringify(payload),
          signal: mergeAbortSignal(request.signal, 180_000),
        });

        const rawText = await res.text();
        assertNoSecretLeak(rawText, this.apiKey);
        let body: GenaiImageResponse | null = null;
        try {
          body = JSON.parse(rawText) as GenaiImageResponse;
        } catch {
          body = null;
        }

        if (!res.ok) {
          const msg = parseErrorMessage(body, res.status);
          const parsed = parseNvidiaErrorBody(body);
          this.lastDiagnostic = {
            category: classifyNvidiaHttpFailure(res.status),
            endpointFamily: this.lastEndpointFamily,
            status: res.status,
            contentType: res.headers.get('content-type') ?? undefined,
            errorType: parsed.errorType,
            field: parsed.field,
            location: parsed.location,
            message: (parsed.message ?? msg).slice(0, 400),
            requestId: res.headers.get('nvcf-request-id') ?? res.headers.get('x-request-id') ?? undefined,
            attempt,
            requestHash: requestHash(payload),
          };
          this.lastRequestId = this.lastDiagnostic.requestId;

          if (res.status === 422 && /example_id/i.test(`${msg} ${rawText}`)) {
            throw new NvidiaStructuredError({
              code: 'NVIDIA_UNSUPPORTED_CAPABILITY',
              provider: 'nvidia',
              model: modelId,
              capability: 'IMAGE_EDIT',
              httpStatus: 422,
              classification: 'PROVIDER_REQUEST_INVALID',
              retryable: false,
              message:
                'NVIDIA hosted Kontext preview only accepts canned example_id images, not custom reference uploads (HTTP 422). Configure NVIDIA_NIM_BASE_URL for custom-reference IMAGE_EDIT.',
              requestId: this.lastRequestId,
            });
          }

          throw new NvidiaStructuredError({
            code: classifyNvidiaErrorCode(res.status, msg),
            provider: 'nvidia',
            model: modelId,
            capability: 'IMAGE_EDIT',
            httpStatus: res.status,
            classification: classifyNvidiaHttpFailure(res.status),
            retryable: res.status === 429 || res.status === 503 || res.status >= 500,
            message: msg,
            requestId: this.lastRequestId,
          });
        }

        const artifact = body?.artifacts?.[0];
        const finishReason = artifact?.finishReason?.toUpperCase() ?? '';
        const b64 = artifact?.base64?.trim();
        if (!b64) {
          throw new NvidiaInvalidImagePayloadError(
            `NVIDIA image edit returned no image data${finishReason ? ` finishReason=${artifact?.finishReason}` : ''}`,
          );
        }
        if (finishReason === 'CONTENT_FILTERED') {
          throw new NvidiaContentFilteredError(
            `NVIDIA image edit rejected by content-safety classifier (finishReason=${artifact?.finishReason})`,
          );
        }

        let decoded: Buffer;
        try {
          decoded = Buffer.from(b64, 'base64');
        } catch {
          throw new NvidiaInvalidImagePayloadError('NVIDIA image edit returned undecodable base64');
        }
        assertValidNvidiaImageBytes(decoded);
        const png = ensurePngBuffer(decoded, this.pythonPath);
        let nativeWidth = width;
        let nativeHeight = height;
        try {
          const dims = decodePngRgba(png);
          nativeWidth = dims.width;
          nativeHeight = dims.height;
        } catch {
          /* keep defaults */
        }

        this.lastRequestId =
          res.headers.get('nvcf-request-id') ?? res.headers.get('x-request-id') ?? undefined;

        return this.toEditResult({
          request,
          modelId,
          png,
          seed,
          started,
          nativeWidth,
          nativeHeight,
          deployment: 'hosted',
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof NvidiaStructuredError) throw err;
        if (attempt >= maxAttempts) break;
      }
    }

    const msg = lastError?.message ?? 'NVIDIA image edit failed';
    assertNoSecretLeak(msg, this.apiKey);
    if (lastError instanceof NvidiaInvalidImagePayloadError || lastError instanceof NvidiaContentFilteredError) {
      throw new NvidiaStructuredError({
        code: lastError instanceof NvidiaContentFilteredError ? 'NVIDIA_CONTENT_POLICY_ERROR' : 'NVIDIA_INVALID_RESPONSE',
        provider: 'nvidia',
        model: modelId,
        capability: 'IMAGE_EDIT',
        classification: lastError instanceof NvidiaContentFilteredError ? 'CONTENT_POLICY' : 'PROVIDER_RESPONSE_INVALID',
        retryable: false,
        message: msg,
        requestId: this.lastRequestId,
      });
    }
    throw new NvidiaStructuredError({
      code: 'NVIDIA_TRANSPORT_ERROR',
      provider: 'nvidia',
      model: modelId,
      capability: 'IMAGE_EDIT',
      classification: 'TRANSPORT',
      retryable: false,
      message: msg,
      requestId: this.lastRequestId,
    });
  }

  private toEditResult(input: {
    request: ImageEditRequest;
    modelId: string;
    png: Buffer;
    seed: number;
    started: number;
    nativeWidth: number;
    nativeHeight: number;
    deployment: 'hosted' | 'nim';
  }): ImageEditResult {
    const sourceAssetIds = input.request.sourceAssets.map((s) => s.assetId);
    const provenanceBase = buildNvidiaProvenance({
      model: input.modelId,
      deployment: input.deployment,
      capability: 'IMAGE_EDIT',
      prompt: input.request.instruction,
      seed: input.seed,
      width: input.nativeWidth,
      height: input.nativeHeight,
      mimeType: 'image/png',
      fileSize: input.png.length,
      endpointFamily: this.lastEndpointFamily,
      requestId: this.lastRequestId,
    });

    return {
      provider: this.id,
      model: input.modelId,
      sourceAssetIds,
      images: [
        {
          buffer: input.png,
          mimeType: 'image/png',
          width: input.nativeWidth,
          height: input.nativeHeight,
        },
      ],
      seed: input.seed,
      durationMs: Date.now() - input.started,
      requestId: this.lastRequestId,
      provenance: {
        provider: 'nvidia-image-edit',
        model: input.modelId,
        capability: 'IMAGE_EDIT',
        sourceAssetIds,
        instructionHash: hashNvidiaPrompt(input.request.instruction),
        seed: input.seed,
        generatedAt: provenanceBase.generatedAt,
        nativeDimensions: { width: input.nativeWidth, height: input.nativeHeight },
        source: 'image_edit',
        purpose: input.request.purpose,
        requestedChangeScope: input.request.metadata?.requestedChangeScope as string | undefined,
        deployment: input.deployment,
        endpointFamily: provenanceBase.endpointFamily,
        mimeType: 'image/png',
        fileSize: input.png.length,
        requestId: this.lastRequestId,
      },
    };
  }
}
