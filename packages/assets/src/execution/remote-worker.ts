import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type ExecutionTargetType =
  | 'LOCAL_CPU'
  | 'LOCAL_CUDA'
  | 'LOCAL_SERVICE'
  | 'REMOTE_METROFORGE_WORKER'
  | 'REMOTE_COMFYUI'
  | 'RUNPOD_SERVERLESS'
  | 'RUNPOD_POD'
  | 'VAST_INSTANCE'
  | 'MODAL_FUNCTION'
  | 'HF_INFERENCE_ENDPOINT'
  | 'HF_ZEROGPU_SPACE'
  | 'LIGHTNING_STUDIO'
  | 'KAGGLE_NOTEBOOK'
  | 'COLAB_NOTEBOOK'
  | 'HOSTED_PROVIDER_API';

/** Free-vs-paid execution economics, tracked separately from model quality/readiness —
 *  a quota/rate-limit failure on a FREE backend must never be read as "the model is bad". */
export type CostTier = 'FREE' | 'FREE_QUOTA' | 'FREE_CREDIT' | 'PAID' | 'USER_OWNED';

export interface ExecutionTarget {
  id: string;
  type: ExecutionTargetType;
  location: 'local' | 'remote';
  provider: string;
  endpoint?: string;
  hardwareProfile?: string;
  gpuType?: string;
  gpuMemoryMb?: number;
  installedModels?: string[];
  capabilities: string[];
  health: string;
  authenticationType?: 'none' | 'bearer' | 'api-key';
  estimatedLatencyMs?: number;
  availability?: string;
  costMetadata?: { costClass?: string; costTier?: CostTier; billingProvider?: string; gpuClass?: string };
}

export interface RemoteSourceImage {
  assetId: string;
  sourceVersion?: string;
  sha256: string;
  bytes: Buffer;
}

export interface RemoteVisualRequest {
  requestId: string;
  projectId?: string;
  assetId: string;
  capability: string;
  providerModel: string;
  prompt: string;
  negativePrompt?: string;
  seed: number;
  width: number;
  height: number;
  sourceImages?: RemoteSourceImage[];
  referenceStrength?: number;
  controlImages?: RemoteSourceImage[];
  conditioning?: Record<string, unknown>;
  visualConstitution?: { id?: string; version?: string };
}

export interface RemoteVisualResult {
  requestId: string;
  success: boolean;
  provider: string;
  model: string;
  revision?: string;
  executionTarget: ExecutionTarget;
  seed: number;
  durationMs: number;
  image?: Buffer;
  outputSha256?: string;
  warnings: string[];
  errors: string[];
  license?: Record<string, unknown>;
  provenance: Record<string, unknown>;
}

export interface RemoteVisualWorkerClient {
  target: ExecutionTarget;
  health(signal?: AbortSignal): Promise<Record<string, unknown>>;
  capabilities(signal?: AbortSignal): Promise<Record<string, unknown>>;
  generate(request: RemoteVisualRequest, signal?: AbortSignal): Promise<RemoteVisualResult>;
}

/** Remote worker model lifecycle — installation state is distinct from load/ready state. */
export type RemoteModelState =
  | 'MODEL_NOT_INSTALLED'
  | 'MODEL_DOWNLOADING'
  | 'MODEL_VERIFYING'
  | 'MODEL_READY'
  | 'MODEL_LOADING'
  | 'MODEL_LOADED'
  | 'MODEL_ERROR';

/** Separate timeout budgets — a large-model cold start is not a network failure. */
export interface RemoteWorkerTimeouts {
  connectionMs: number;
  coldStartMs: number;
  modelLoadMs: number;
  generationMs: number;
  artifactTransferMs: number;
}

export const DEFAULT_REMOTE_WORKER_TIMEOUTS: RemoteWorkerTimeouts = {
  connectionMs: 10_000,
  coldStartMs: 120_000,
  modelLoadMs: 300_000,
  generationMs: 180_000,
  artifactTransferMs: 60_000,
};

export class RemoteWorkerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'RemoteWorkerError';
  }
}

export interface GpuOomDetail {
  gpu?: string;
  vramMb?: number;
  model?: string;
  runtimeProfile?: string;
  precision?: string;
  width?: number;
  height?: number;
}

export class ProviderGpuOomError extends RemoteWorkerError {
  constructor(public readonly detail: GpuOomDetail) {
    super('PROVIDER_GPU_OOM', `PROVIDER_GPU_OOM: ${JSON.stringify(detail)}`);
  }
}

export function sha256Bytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

export function sourceImageFromPath(assetId: string, path: string, expectedHash: string, sourceVersion?: string): RemoteSourceImage {
  const bytes = readFileSync(path);
  const actual = sha256Bytes(bytes);
  if (actual !== expectedHash.toUpperCase()) throw new RemoteWorkerError('CANONICAL_REFERENCE_MISMATCH', `CANONICAL_REFERENCE_MISMATCH: Reference hash mismatch for ${assetId}`);
  return { assetId, sourceVersion, sha256: actual, bytes };
}