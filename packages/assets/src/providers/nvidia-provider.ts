import type { ImageGenRequest, ImageGenResult } from '../types/image-gen.js';
import type { ImageEditRequest, ImageEditResult } from '../types/image-edit.js';
import {
  assertNoSecretLeak,
  resolveNvidiaConfig,
  type NvidiaCapabilityId,
  type NvidiaDoctorReport,
  type NvidiaResolvedConfig,
  type TextGenerationCapabilityRequest,
  type ThreeDGenerationRequest,
  type VideoGenerationRequest,
  type VisionAnalyzeRequest,
} from './nvidia-foundation.js';
import { NvidiaHttpClient } from './nvidia-http.js';
import { NvidiaImageProvider, type NvidiaImageConfig } from './nvidia-image.js';
import { NvidiaImageEditProvider } from './nvidia-image-edit.js';
import {
  classifyNvidiaHttpFailure,
  type NvidiaImageErrorCategory,
} from './nvidia-image-contract.js';
import {
  probeNvidiaNimHealth,
  remoteNimRequirements,
  resolveCapabilityDeployment,
  resolveNimApiKey,
  type NvidiaCombinedDoctorReport,
} from './nvidia-nim.js';

/** Spec-aligned NVIDIA error codes (N1). */
export type NvidiaFoundationErrorCode =
  | 'NVIDIA_CONFIGURATION_ERROR'
  | 'NVIDIA_AUTH_ERROR'
  | 'NVIDIA_RATE_LIMIT'
  | 'NVIDIA_CAPACITY_ERROR'
  | 'NVIDIA_TIMEOUT'
  | 'NVIDIA_TRANSPORT_ERROR'
  | 'NVIDIA_MODEL_NOT_FOUND'
  | 'NVIDIA_UNSUPPORTED_CAPABILITY'
  | 'NVIDIA_INVALID_SOURCE_ASSET'
  | 'NVIDIA_REFERENCE_LIMIT_EXCEEDED'
  | 'NVIDIA_IMAGE_UPLOAD_ERROR'
  | 'NVIDIA_CONTENT_POLICY_ERROR'
  | 'NVIDIA_INFERENCE_ERROR'
  | 'NVIDIA_INVALID_RESPONSE'
  | 'NVIDIA_NIM_NOT_CONFIGURED'
  | 'NVIDIA_NIM_UNREACHABLE'
  | 'NVIDIA_NIM_NOT_READY'
  | 'NVIDIA_NIM_MODEL_NOT_LOADED'
  | 'NVIDIA_NIM_GPU_UNSUPPORTED'
  | 'NVIDIA_NIM_OUT_OF_MEMORY'
  | 'NVIDIA_NIM_INFERENCE_ERROR'
  | 'NVIDIA_NIM_INVALID_RESPONSE';

export interface NvidiaStructuredErrorInfo {
  code: NvidiaFoundationErrorCode;
  provider: 'nvidia';
  model?: string;
  capability?: NvidiaCapabilityId;
  httpStatus?: number;
  classification: NvidiaImageErrorCategory | 'CONFIGURATION' | 'UNSUPPORTED' | 'TRANSPORT' | 'CONTENT_POLICY';
  retryable: boolean;
  message: string;
  requestId?: string;
}

export class NvidiaStructuredError extends Error {
  readonly code: NvidiaFoundationErrorCode;
  readonly provider = 'nvidia' as const;
  readonly model?: string;
  readonly capability?: NvidiaCapabilityId;
  readonly httpStatus?: number;
  readonly classification: NvidiaStructuredErrorInfo['classification'];
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(info: NvidiaStructuredErrorInfo) {
    super(info.message);
    this.name = 'NvidiaStructuredError';
    this.code = info.code;
    this.model = info.model;
    this.capability = info.capability;
    this.httpStatus = info.httpStatus;
    this.classification = info.classification;
    this.retryable = info.retryable;
    this.requestId = info.requestId;
  }

  toJSON(): NvidiaStructuredErrorInfo {
    return {
      code: this.code,
      provider: this.provider,
      model: this.model,
      capability: this.capability,
      httpStatus: this.httpStatus,
      classification: this.classification,
      retryable: this.retryable,
      message: this.message,
      requestId: this.requestId,
    };
  }
}

export function classifyNvidiaErrorCode(
  status: number | null | undefined,
  hint?: string,
): NvidiaFoundationErrorCode {
  if (status === 401 || status === 403) return 'NVIDIA_AUTH_ERROR';
  if (status === 429) return 'NVIDIA_RATE_LIMIT';
  if (status === 404) return 'NVIDIA_MODEL_NOT_FOUND';
  if (status === 408 || status === 504) return 'NVIDIA_TIMEOUT';
  if (status === 503) return 'NVIDIA_CAPACITY_ERROR';
  if (hint && /content.?filter|CONTENT_FILTERED|safety/i.test(hint)) return 'NVIDIA_CONTENT_POLICY_ERROR';
  if (status !== undefined && status !== null && status >= 500) return 'NVIDIA_INFERENCE_ERROR';
  if (status === 400 || status === 422) return 'NVIDIA_INVALID_RESPONSE';
  if (status === undefined || status === null) return 'NVIDIA_TRANSPORT_ERROR';
  return 'NVIDIA_INFERENCE_ERROR';
}

export function nvidiaErrorFromHttpStatus(
  status: number,
  message: string,
  extras?: Partial<NvidiaStructuredErrorInfo>,
): NvidiaStructuredError {
  const code = classifyNvidiaErrorCode(status, message);
  const category = classifyNvidiaHttpFailure(status);
  return new NvidiaStructuredError({
    code,
    provider: 'nvidia',
    httpStatus: status,
    classification: category,
    retryable: status === 429 || status === 503 || status === 504 || status >= 500,
    message,
    ...extras,
  });
}

/**
 * First-class NVIDIA capability facade.
 * Image generation is live; other modalities are typed stubs for later milestones.
 * Prefer this over inventing FluxProvider / QwenProvider classes.
 */
export class NvidiaCapabilityAdapter {
  readonly providerId = 'nvidia' as const;
  readonly http: NvidiaHttpClient;
  readonly image: NvidiaImageProvider;
  readonly imageEditProvider: NvidiaImageEditProvider;

  constructor(config: NvidiaImageConfig = {}) {
    const resolved = resolveNvidiaConfig();
    this.http = new NvidiaHttpClient({
      apiKey: config.apiKey ?? process.env.NVIDIA_API_KEY,
      baseUrl: config.baseUrl ?? resolved.baseUrl,
    });
    this.image = new NvidiaImageProvider(config);
    this.imageEditProvider = new NvidiaImageEditProvider(config);
  }

  /** Safe config — never includes the API key. */
  getConfig(): NvidiaResolvedConfig {
    return resolveNvidiaConfig();
  }

  doctor(): Promise<NvidiaDoctorReport> {
    return this.image.doctor();
  }

  /** Combined hosted + NIM doctor — does not run inference. */
  async doctorCombined(): Promise<NvidiaCombinedDoctorReport> {
    const hosted = await this.image.doctor();
    const cfg = resolveNvidiaConfig();
    const nim = await probeNvidiaNimHealth({
      baseUrl: cfg.nimBaseUrl,
      apiKey: resolveNimApiKey(),
      selectedModel: process.env.NVIDIA_IMAGE_EDIT_MODEL ?? 'qwen/qwen-image-edit-2511',
    });
    return {
      provider: 'nvidia',
      hosted: {
        configured: hosted.configured,
        authenticated: hosted.authenticated,
        reachable: hosted.apiReachable,
        imageGeneration: hosted.imageGenerationAvailable,
        readiness: hosted.readiness,
        baseUrl: hosted.imageApiBaseUrl,
        model: hosted.configuredImageModel,
      },
      nim,
      secretRedaction: 'SAFE',
    };
  }

  capabilityDeployment(capability: NvidiaCapabilityId) {
    return resolveCapabilityDeployment(capability);
  }

  remoteNimRequirements() {
    return remoteNimRequirements();
  }

  async imageGenerate(request: ImageGenRequest): Promise<ImageGenResult> {
    return this.image.generateImage(request);
  }

  async imageEdit(request: ImageEditRequest): Promise<ImageEditResult> {
    return this.imageEditProvider.editImage(request);
  }

  async textGenerate(_request: TextGenerationCapabilityRequest): Promise<never> {
    throw this.unsupported('TEXT_GENERATION');
  }

  async visionAnalyze(_request: VisionAnalyzeRequest): Promise<never> {
    throw this.unsupported('VISION_QA');
  }

  async videoGenerate(_request: VideoGenerationRequest): Promise<never> {
    throw this.unsupported('VIDEO_GENERATION');
  }

  async threeDGenerate(_request: ThreeDGenerationRequest): Promise<never> {
    throw this.unsupported('THREE_D_GENERATION');
  }

  private unsupported(capability: NvidiaCapabilityId): NvidiaStructuredError {
    const message = `NVIDIA capability ${capability} is defined but not implemented in N1`;
    assertNoSecretLeak(message, process.env.NVIDIA_API_KEY);
    return new NvidiaStructuredError({
      code: 'NVIDIA_UNSUPPORTED_CAPABILITY',
      provider: 'nvidia',
      capability,
      classification: 'UNSUPPORTED',
      retryable: false,
      message,
    });
  }
}

/** Report / architecture alias — one NvidiaProvider, many models beneath it. */
export { NvidiaCapabilityAdapter as NvidiaProvider };
