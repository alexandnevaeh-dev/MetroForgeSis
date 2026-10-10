import type { ImageGenerationProfile } from './vision.js';

export type ImageConditioningMode = 'controlnet_canny' | 'ip_adapter' | 'img2img';

/** Optional reference/control image conditioning for img2img-style generation. */
export interface ImageConditioning {
  mode: ImageConditioningMode;
  /** Reference or control source image (PNG). */
  image: Buffer;
  /** Conditioning strength / denoise (0–1). Defaults vary by mode. */
  strength?: number;
  sourceAssetId?: string;
  sourceHash?: string;
  referenceMechanism?: 'IP_ADAPTER' | 'IMG2IMG' | 'CONTROLNET';
}

export interface LocalStyleAdapter {
  path: string;
  sha256: string;
  scale: number;
}

export interface ImageGenRequest {
  localStyleAdapter?: LocalStyleAdapter;
  profile: ImageGenerationProfile;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  signal?: AbortSignal;
  conditioning?: ImageConditioning;
  /** Override provider model for this request (e.g. flux.1-kontext-dev for reference poses). */
  modelOverride?: string;
  /** Per-request inference step count. Optional and additive — a provider that doesn't read it
   *  keeps its own existing default/env-var behavior unchanged. Providers that DO read it must
   *  prefer it over any global default so a caller's declared step count and the value actually
   *  executed cannot silently diverge (a real provenance-honesty gap found and fixed while
   *  running a step-count quality experiment against the Apple-native MPS profile — see
   *  docs/audit/MODERN_COHESION_TEST_PROJECT.md). */
  inferenceSteps?: number;
}

/** Structured provider health — richer than a bare boolean; never includes API keys. */
export type ImageProviderHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'MISCONFIGURED'
  | 'NETWORK_ERROR'
  | 'MODEL_UNAVAILABLE'
  | 'UNKNOWN';

export interface ImageProviderHealthReport {
  status: ImageProviderHealthStatus;
  /** Human-readable reason suitable for Providers UI / doctor (no secrets). */
  reason: string;
  latencyMs?: number | null;
  /** Nearby / suggested model ids when the configured model is missing (NVIDIA DEGRADED). */
  nearbyModels?: string[];
  suggestedModelIds?: string[];
  /** Extra operator-facing detail with no secrets. */
  safeDiagnostic?: string;
}

export interface ImageGenResult {
  image: Buffer;
  provider: string;
  modelId: string;
  seed: number;
  fallbackGenerated: boolean;
  /** How many providers were skipped before this result (0 = primary). */
  fallbackDepth?: number;
  fallbackReason?: string;
  selectedProvider?: string;
  selectedModel?: string;
  requestedCapability?: string;
  /** False when this result is procedural/placeholder and must not gate as production. */
  productionAllowed?: boolean;
  /** Provider correlation id when available (e.g. NVCF request id). */
  requestId?: string;
  /** Optional local backend execution telemetry, excluding image payload data. */
  executionMetadata?: Record<string, unknown>;
}

export interface ImageGenerator {
  supportsLocalStyleAdapters?: boolean;
  id: string;
  checkHealth(): Promise<boolean>;
  /** Optional richer health; when absent, boolean checkHealth is mapped. */
  getHealthReport?(): Promise<ImageProviderHealthReport>;
  generateImage(request: ImageGenRequest): Promise<ImageGenResult>;
}

/** Map a rich health report to the legacy boolean used by existing callers. */
export function healthReportIsSelectable(report: ImageProviderHealthReport): boolean {
  return report.status === 'HEALTHY' || report.status === 'DEGRADED';
}

export async function resolveImageProviderHealth(
  provider: ImageGenerator,
): Promise<ImageProviderHealthReport> {
  if (typeof provider.getHealthReport === 'function') {
    return provider.getHealthReport();
  }
  try {
    const ok = await provider.checkHealth();
    return ok
      ? { status: 'HEALTHY', reason: 'Provider responded to health check', latencyMs: null }
      : { status: 'UNAVAILABLE', reason: 'Provider health check failed', latencyMs: null };
  } catch (err) {
    return {
      status: 'UNKNOWN',
      reason: err instanceof Error ? err.message : 'Health check threw',
      latencyMs: null,
    };
  }
}
