import { createHash } from 'node:crypto';
import {
  NVIDIA_MODEL_CATALOG,
  nvidiaEnabledModels,
  nvidiaModelById,
  type NvidiaDeploymentType,
  type NvidiaModelDescriptor,
} from '../foundry/nvidia-catalog.js';
import type { NvidiaImageEndpointFamily } from './nvidia-image-contract.js';
import type { ImageGenRequest, ImageGenResult } from '../types/image-gen.js';
import { normalizeNimBaseUrl } from './nvidia-nim-url.js';

/** Provider-neutral capability ids used by routing / provenance. */
export type NvidiaCapabilityId =
  | 'IMAGE_GENERATION'
  | 'IMAGE_EDIT'
  | 'TEXT_GENERATION'
  | 'VISION_QA'
  | 'VIDEO_GENERATION'
  | 'THREE_D_GENERATION';

/**
 * Compatible stubs for future capabilities — interfaces only where not yet live.
 * Image generation reuses ImageGenRequest / ImageGenResult.
 * Image edit uses provider-neutral ImageEditRequest / ImageEditResult.
 */
export type { ImageEditRequest, ImageEditResult } from '../types/image-edit.js';

export interface TextGenerationCapabilityRequest {
  prompt: string;
  systemPrompt?: string;
  modelOverride?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface VisionAnalyzeRequest {
  image: Buffer;
  prompt: string;
  modelOverride?: string;
  signal?: AbortSignal;
}

export interface VideoGenerationRequest {
  prompt: string;
  durationSeconds?: number;
  seed?: number;
  modelOverride?: string;
  signal?: AbortSignal;
}

export interface ThreeDGenerationRequest {
  prompt: string;
  referenceImage?: Buffer;
  seed?: number;
  modelOverride?: string;
  signal?: AbortSignal;
}

export interface NvidiaResolvedConfig {
  provider: 'nvidia';
  configured: boolean;
  apiKeyPresent: boolean;
  baseUrl: string;
  imageApiBaseUrl: string;
  imageModelId: string;
  deployment: NvidiaDeploymentType;
  endpointFamily: NvidiaImageEndpointFamily;
  /** Set when a NIM OpenAI-compatible root is configured for IMAGE_EDIT. */
  nimBaseUrl?: string;
  nimCacheDir?: string;
  /** Capability-specific modes (generation can stay hosted while edit uses NIM). */
  imageGenerationDeployment: NvidiaDeploymentType;
  imageEditDeployment: NvidiaDeploymentType;
}

export type NvidiaDoctorReadiness =
  | 'NOT_CONFIGURED'
  | 'AUTH_REQUIRED'
  | 'UNREACHABLE'
  | 'DEGRADED'
  | 'IMAGE_GENERATION_READY'
  | 'HEALTHY';

export interface NvidiaDoctorReport {
  provider: 'nvidia';
  configured: boolean;
  authenticated: boolean;
  apiReachable: boolean;
  catalogReachable: boolean;
  imageGenerationAvailable: boolean;
  readiness: NvidiaDoctorReadiness;
  baseUrl: string;
  imageApiBaseUrl: string;
  deployment: NvidiaDeploymentType;
  endpointFamily: NvidiaImageEndpointFamily;
  configuredImageModel: string;
  enabledModels: string[];
  disabledUnverifiedModels: string[];
  latencyMs: number | null;
  healthStatus: string;
  reason: string;
  setupInstructions?: string[];
  secretRedaction: 'SAFE';
}

export interface NvidiaAssetProvenance {
  provider: 'nvidia';
  model: string;
  deployment: NvidiaDeploymentType;
  capability: NvidiaCapabilityId;
  promptHash: string;
  seed: number;
  generatedAt: string;
  nativeDimensions: { width: number; height: number };
  source: 'nvidia' | 'image_edit';
  endpointFamily: NvidiaImageEndpointFamily;
  mimeType: string;
  fileSize: number;
  requestId?: string;
  sourceAssetIds?: string[];
  parentAssetId?: string;
  rootAssetId?: string;
  versionNumber?: number;
  instructionHash?: string;
}

export interface NvidiaPersistedAssetRecord {
  assetId: string;
  provider: 'nvidia';
  model: string;
  capability: NvidiaCapabilityId;
  prompt: string;
  seed: number;
  generationTimestamp: string;
  nativeWidth: number;
  nativeHeight: number;
  mimeType: string;
  fileSize: number;
  outputPath: string;
  requestId?: string;
  provenance: NvidiaAssetProvenance;
}

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_IMAGE_API_BASE = 'https://ai.api.nvidia.com/v1/genai';
const DEFAULT_IMAGE_MODEL = 'black-forest-labs/flux.1-dev';

export function resolveNvidiaConfig(env: NodeJS.ProcessEnv = process.env): NvidiaResolvedConfig {
  const apiKey = env.NVIDIA_API_KEY?.trim();
  const baseUrl = (env.NVIDIA_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  const imageApiBaseUrl = (
    env.NVIDIA_IMAGE_API_BASE_URL?.trim() || DEFAULT_IMAGE_API_BASE
  ).replace(/\/$/, '');
  const imageModelId = env.NVIDIA_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const nimBaseUrl = normalizeNimBaseUrl(env.NVIDIA_NIM_BASE_URL);
  const nimCacheDir = env.NVIDIA_NIM_CACHE_DIR?.trim() || undefined;
  const deployment: NvidiaDeploymentType =
    env.NVIDIA_DEPLOYMENT?.trim() === 'nim' ? 'nim' : 'hosted';
  const endpointFamily: NvidiaImageEndpointFamily =
    deployment === 'nim' ? 'NVIDIA_SELF_HOSTED_NIM_INFER' : 'NVIDIA_HOSTED_BUILD_API';
  const imageEditDeployment: NvidiaDeploymentType =
    nimBaseUrl || deployment === 'nim' ? 'nim' : 'hosted';

  return {
    provider: 'nvidia',
    configured: Boolean(apiKey) || Boolean(nimBaseUrl),
    apiKeyPresent: Boolean(apiKey),
    baseUrl,
    imageApiBaseUrl,
    imageModelId,
    deployment,
    endpointFamily,
    nimBaseUrl,
    nimCacheDir,
    imageGenerationDeployment: 'hosted',
    imageEditDeployment,
  };
}

export function hashNvidiaPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}

export function buildNvidiaProvenance(input: {
  model: string;
  deployment: NvidiaDeploymentType;
  capability: NvidiaCapabilityId;
  prompt: string;
  seed: number;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
  endpointFamily: NvidiaImageEndpointFamily;
  requestId?: string;
  generatedAt?: string;
}): NvidiaAssetProvenance {
  return {
    provider: 'nvidia',
    model: input.model,
    deployment: input.deployment,
    capability: input.capability,
    promptHash: hashNvidiaPrompt(input.prompt),
    seed: input.seed,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    nativeDimensions: { width: input.width, height: input.height },
    source: 'nvidia',
    endpointFamily: input.endpointFamily,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    requestId: input.requestId,
  };
}

export function nvidiaModelsForCapability(capability: NvidiaCapabilityId): NvidiaModelDescriptor[] {
  return nvidiaEnabledModels().filter(
    (m) =>
      m.capabilities.includes(capability) ||
      (capability === 'IMAGE_GENERATION' && m.capabilities.includes('image-generation')) ||
      (capability === 'IMAGE_EDIT' && (m.supportsEditing || m.capabilities.includes('image-editing'))),
  );
}

export function assertNoSecretLeak(text: string, apiKey: string | undefined): void {
  if (apiKey && text.includes(apiKey)) {
    throw new Error('NVIDIA secret redaction failed: API key present in output');
  }
}

/**
 * Map provider-neutral image result + request into a MetroForge-managed asset record shape.
 * Callers persist bytes to `outputPath` separately.
 */
export function toNvidiaPersistedAssetRecord(input: {
  assetId: string;
  request: ImageGenRequest;
  result: ImageGenResult;
  outputPath: string;
  config: NvidiaResolvedConfig;
  nativeWidth: number;
  nativeHeight: number;
  mimeType?: string;
  requestId?: string;
}): NvidiaPersistedAssetRecord {
  const mimeType = input.mimeType ?? 'image/png';
  const provenance = buildNvidiaProvenance({
    model: input.result.modelId,
    deployment: input.config.deployment,
    capability: 'IMAGE_GENERATION',
    prompt: input.request.prompt,
    seed: input.result.seed,
    width: input.nativeWidth,
    height: input.nativeHeight,
    mimeType,
    fileSize: input.result.image.length,
    endpointFamily: input.config.endpointFamily,
    requestId: input.requestId,
  });
  return {
    assetId: input.assetId,
    provider: 'nvidia',
    model: input.result.modelId,
    capability: 'IMAGE_GENERATION',
    prompt: input.request.prompt,
    seed: input.result.seed,
    generationTimestamp: provenance.generatedAt,
    nativeWidth: input.nativeWidth,
    nativeHeight: input.nativeHeight,
    mimeType,
    fileSize: input.result.image.length,
    outputPath: input.outputPath,
    requestId: input.requestId,
    provenance,
  };
}

export function catalogSummary(): {
  verifiedModels: string[];
  disabledUnverifiedModels: string[];
  selectedReferenceModel: string;
} {
  const verified = nvidiaEnabledModels().map((m) => m.modelId);
  const disabled = NVIDIA_MODEL_CATALOG.filter((m) => m.status !== 'enabled').map((m) => m.modelId);
  const preferred =
    nvidiaModelById('black-forest-labs/flux.1-dev')?.status === 'enabled'
      ? 'black-forest-labs/flux.1-dev'
      : verified.find((id) => nvidiaModelById(id)?.modalities.includes('image')) ?? verified[0] ?? '';
  return {
    verifiedModels: verified,
    disabledUnverifiedModels: disabled,
    selectedReferenceModel: preferred,
  };
}
