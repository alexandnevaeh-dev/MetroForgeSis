import type { NvidiaCapabilityId } from './nvidia-foundation.js';
import type { NvidiaDeploymentType } from '../foundry/nvidia-catalog.js';
import type { NvidiaImageEndpointFamily } from './nvidia-image-contract.js';
import { buildNimEndpoint, normalizeNimBaseUrl } from './nvidia-nim-url.js';

export { buildNimEndpoint, normalizeNimBaseUrl } from './nvidia-nim-url.js';
export type NvidiaNimLifecycleState =
  | 'STOPPED'
  | 'STARTING'
  | 'LOADING_MODEL'
  | 'READY'
  | 'DEGRADED'
  | 'FAILED'
  | 'NOT_CONFIGURED'
  | 'UNREACHABLE';

export interface NvidiaDeploymentConfig {
  mode: NvidiaDeploymentType;
  /** Hosted integrate/chat or NIM OpenAI-compatible root (…/v1). */
  baseUrl: string;
  /** Hosted Visual GenAI base (…/v1/genai) — IMAGE_GENERATION only. */
  imageApiBaseUrl: string;
  /** Explicit NIM base when IMAGE_EDIT (or global) uses NIM. */
  nimBaseUrl?: string;
  /** Optional external model cache — never inside the git repo. */
  nimCacheDir?: string;
}

export interface NvidiaCapabilityDeployment {
  capability: NvidiaCapabilityId;
  mode: NvidiaDeploymentType;
  baseUrl: string;
  endpointFamily: NvidiaImageEndpointFamily;
}

export interface NvidiaNimHealthReport {
  configured: boolean;
  reachable: boolean;
  live: boolean;
  ready: boolean;
  modelLoaded: boolean;
  imageEdit: boolean;
  readiness: 'NOT_CONFIGURED' | 'UNREACHABLE' | 'LOADING' | 'IMAGE_EDIT_READY' | 'DEGRADED' | 'FAILED';
  lifecycle: NvidiaNimLifecycleState;
  baseUrl: string | null;
  editEndpoint: string | null;
  version?: string;
  latencyMs: number | null;
  reason: string;
  models?: string[];
  selectedModelAvailable?: boolean;
  secretRedaction: 'SAFE';
}

export interface NvidiaCombinedDoctorReport {
  provider: 'nvidia';
  hosted: {
    configured: boolean;
    authenticated: boolean;
    reachable: boolean;
    imageGeneration: boolean;
    readiness: string;
    baseUrl: string;
    model: string;
  };
  nim: NvidiaNimHealthReport;
  secretRedaction: 'SAFE';
}

const DEFAULT_HOSTED_BASE = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_IMAGE_API_BASE = 'https://ai.api.nvidia.com/v1/genai';

/** Auth for NIM: prefer NVIDIA_NIM_API_KEY, else NVIDIA_API_KEY. Never log values. */
export function resolveNimApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.NVIDIA_NIM_API_KEY?.trim() || env.NVIDIA_API_KEY?.trim() || undefined;
}

export interface NvidiaNimEditPreflightGate {
  remoteConfigured: boolean;
  reachable: boolean;
  live: boolean;
  ready: boolean;
  modelAvailable: boolean;
  customReferencesSupported: boolean;
  sourceValid: boolean;
  offlineTestsAssumed: boolean;
  gatePass: boolean;
  blockers: string[];
  selectedModel?: string;
  editEndpoint?: string;
  normalizedBase?: string;
}

/**
 * Pre-inference acceptance gate — no network side effects beyond supplied health report.
 */
export function evaluateNimEditPreflightGate(input: {
  health: NvidiaNimHealthReport;
  selectedModel?: string;
  customReferencesSupported?: boolean;
  sourceValid?: boolean;
  offlineTestsPass?: boolean;
}): NvidiaNimEditPreflightGate {
  const blockers: string[] = [];
  const remoteConfigured = input.health.configured && Boolean(input.health.baseUrl);
  const reachable = input.health.reachable;
  const live = input.health.live;
  const ready = input.health.ready;
  const models = input.health.models ?? [];
  const selectedModel = input.selectedModel?.trim();
  const modelAvailable =
    Boolean(selectedModel) &&
    (models.length === 0
      ? input.health.imageEdit
      : models.some(
          (id) =>
            id === selectedModel ||
            id.endsWith(`/${selectedModel}`) ||
            selectedModel?.endsWith(`/${id}`) ||
            id.includes(selectedModel!.replace(/^.*\//, '')),
        ));
  const customReferencesSupported = input.customReferencesSupported !== false;
  const sourceValid = input.sourceValid !== false;
  const offlineTestsAssumed = input.offlineTestsPass !== false;

  if (!remoteConfigured) blockers.push('REMOTE_NIM_CONFIGURED=false');
  if (!reachable) blockers.push('REMOTE_NIM_REACHABLE=false');
  if (!live) blockers.push('REMOTE_NIM_LIVE=false');
  if (!ready) blockers.push('REMOTE_NIM_READY=false');
  if (!modelAvailable) blockers.push('IMAGE_EDIT_MODEL_AVAILABLE=false');
  if (!customReferencesSupported) blockers.push('CUSTOM_REFERENCES_SUPPORTED=false');
  if (!sourceValid) blockers.push('SOURCE_ASSET_VALID=false');
  if (!offlineTestsAssumed) blockers.push('OFFLINE_TESTS_PASS=false');

  return {
    remoteConfigured,
    reachable,
    live,
    ready,
    modelAvailable,
    customReferencesSupported,
    sourceValid,
    offlineTestsAssumed,
    gatePass: blockers.length === 0,
    blockers,
    selectedModel,
    editEndpoint: buildNimEndpoint(input.health.baseUrl, 'images/edits'),
    normalizedBase: input.health.baseUrl ?? undefined,
  };
}

/**
 * Resolve deployment targets without leaking selection into gameplay code.
 * IMAGE_GENERATION stays hosted by default; IMAGE_EDIT prefers NIM when NVIDIA_NIM_BASE_URL is set.
 */
export function resolveNvidiaDeploymentConfig(env: NodeJS.ProcessEnv = process.env): NvidiaDeploymentConfig {
  const globalMode: NvidiaDeploymentType = env.NVIDIA_DEPLOYMENT?.trim() === 'nim' ? 'nim' : 'hosted';
  const nimBaseUrl = normalizeNimBaseUrl(env.NVIDIA_NIM_BASE_URL);
  const baseUrl = (env.NVIDIA_API_BASE_URL?.trim() || DEFAULT_HOSTED_BASE).replace(/\/$/, '');
  const imageApiBaseUrl = (env.NVIDIA_IMAGE_API_BASE_URL?.trim() || DEFAULT_IMAGE_API_BASE).replace(/\/$/, '');
  const nimCacheDir = env.NVIDIA_NIM_CACHE_DIR?.trim() || undefined;

  return {
    mode: globalMode,
    baseUrl: nimBaseUrl && globalMode === 'nim' ? nimBaseUrl : baseUrl,
    imageApiBaseUrl,
    nimBaseUrl,
    nimCacheDir,
  };
}

/** Capability-specific deployment — generation can stay hosted while edit uses NIM. */
export function resolveCapabilityDeployment(
  capability: NvidiaCapabilityId,
  env: NodeJS.ProcessEnv = process.env,
): NvidiaCapabilityDeployment {
  const cfg = resolveNvidiaDeploymentConfig(env);
  const editPrefersNim = Boolean(cfg.nimBaseUrl) || cfg.mode === 'nim';

  if (capability === 'IMAGE_EDIT' && editPrefersNim) {
    const baseUrl = cfg.nimBaseUrl ?? cfg.baseUrl;
    return {
      capability,
      mode: 'nim',
      baseUrl,
      endpointFamily: 'NVIDIA_SELF_HOSTED_NIM_OPENAI_IMAGES',
    };
  }

  if (capability === 'IMAGE_GENERATION') {
    return {
      capability,
      mode: 'hosted',
      baseUrl: cfg.imageApiBaseUrl,
      endpointFamily: 'NVIDIA_HOSTED_BUILD_API',
    };
  }

  if (cfg.mode === 'nim') {
    return {
      capability,
      mode: 'nim',
      baseUrl: cfg.nimBaseUrl ?? cfg.baseUrl,
      endpointFamily: 'NVIDIA_SELF_HOSTED_NIM_INFER',
    };
  }

  return {
    capability,
    mode: 'hosted',
    baseUrl: cfg.baseUrl,
    endpointFamily: 'NVIDIA_HOSTED_BUILD_API',
  };
}

export function classifyNimErrorFromMessage(
  message: string,
  status?: number | null,
):
  | 'NVIDIA_NIM_OUT_OF_MEMORY'
  | 'NVIDIA_NIM_MODEL_NOT_LOADED'
  | 'NVIDIA_NIM_NOT_READY'
  | 'NVIDIA_NIM_INFERENCE_ERROR'
  | 'NVIDIA_NIM_INVALID_RESPONSE'
  | null {
  if (/out of memory|cuda.?oom|OOM|insufficient memory/i.test(message)) return 'NVIDIA_NIM_OUT_OF_MEMORY';
  if (/model.?not.?loaded|LOADING_MODEL|weights not/i.test(message)) return 'NVIDIA_NIM_MODEL_NOT_LOADED';
  if (/not ready|NOT_READY|starting/i.test(message) || status === 503) return 'NVIDIA_NIM_NOT_READY';
  if (status !== undefined && status !== null && status >= 500) return 'NVIDIA_NIM_INFERENCE_ERROR';
  if (status === 400 || status === 422) return 'NVIDIA_NIM_INVALID_RESPONSE';
  return null;
}

/**
 * Probe documented NIM health routes only — never invent paths.
 * Uses GET /v1/health/ready and GET /v1/health/live when base is configured.
 */
export async function probeNvidiaNimHealth(input: {
  baseUrl?: string;
  apiKey?: string;
  selectedModel?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<NvidiaNimHealthReport> {
  const fetchFn = input.fetchImpl ?? fetch;
  const baseUrl = normalizeNimBaseUrl(input.baseUrl) || null;
  const editEndpoint = buildNimEndpoint(baseUrl, 'images/edits') || null;
  if (!baseUrl) {
    return {
      configured: false,
      reachable: false,
      live: false,
      ready: false,
      modelLoaded: false,
      imageEdit: false,
      readiness: 'NOT_CONFIGURED',
      lifecycle: 'NOT_CONFIGURED',
      baseUrl: null,
      editEndpoint: null,
      latencyMs: null,
      reason: 'NVIDIA_NIM_BASE_URL is not configured — attach a remote NIM to enable custom-reference IMAGE_EDIT',
      secretRedaction: 'SAFE',
    };
  }

  const started = Date.now();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`;

  const readyUrl = buildNimEndpoint(baseUrl, 'health/ready')!;
  const liveUrl = buildNimEndpoint(baseUrl, 'health/live')!;
  const modelsUrl = buildNimEndpoint(baseUrl, 'models')!;
  const versionUrl = buildNimEndpoint(baseUrl, 'version')!;

  try {
    const readyRes = await fetchFn(readyUrl, {
      method: 'GET',
      headers,
      signal: input.signal ?? AbortSignal.timeout(10_000),
    });
    const liveRes = await fetchFn(liveUrl, {
      method: 'GET',
      headers,
      signal: input.signal ?? AbortSignal.timeout(10_000),
    });
    const latencyMs = Date.now() - started;
    const ready = readyRes.ok;
    const live = liveRes.ok;
    let models: string[] | undefined;
    let version: string | undefined;
    try {
      const modelsRes = await fetchFn(modelsUrl, {
        method: 'GET',
        headers,
        signal: input.signal ?? AbortSignal.timeout(10_000),
      });
      if (modelsRes.ok) {
        const body = (await modelsRes.json()) as { data?: { id: string }[] };
        models = (body.data ?? []).map((m) => m.id);
      }
    } catch {
      /* /models optional */
    }
    try {
      const versionRes = await fetchFn(versionUrl, {
        method: 'GET',
        headers,
        signal: input.signal ?? AbortSignal.timeout(10_000),
      });
      if (versionRes.ok) {
        const body = (await versionRes.json()) as { version?: string };
        version = typeof body.version === 'string' ? body.version : undefined;
      }
    } catch {
      /* /version optional */
    }

    const selected = input.selectedModel?.trim();
    const selectedModelAvailable =
      !selected ||
      !models ||
      models.length === 0 ||
      models.some(
        (id) =>
          id === selected ||
          id.endsWith(`/${selected}`) ||
          selected.endsWith(`/${id}`) ||
          id.includes(selected.replace(/^.*\//, '')),
      );

    const imageEdit =
      ready &&
      selectedModelAvailable &&
      (models?.some((id) => /image-edit|kontext|qwen-image-edit/i.test(id)) ?? true);

    let lifecycle: NvidiaNimLifecycleState = 'UNREACHABLE';
    let readiness: NvidiaNimHealthReport['readiness'] = 'UNREACHABLE';
    if (ready && live && imageEdit) {
      lifecycle = 'READY';
      readiness = 'IMAGE_EDIT_READY';
    } else if (live && !ready) {
      lifecycle = 'LOADING_MODEL';
      readiness = 'LOADING';
    } else if (ready && live) {
      lifecycle = 'DEGRADED';
      readiness = 'DEGRADED';
    } else if (!live && !ready) {
      lifecycle = readyRes.status >= 500 ? 'FAILED' : 'DEGRADED';
      readiness = readyRes.status >= 500 ? 'FAILED' : 'DEGRADED';
    }

    return {
      configured: true,
      reachable: readyRes.status < 500 || liveRes.status < 500,
      live,
      ready,
      modelLoaded: ready,
      imageEdit: imageEdit && ready,
      readiness,
      lifecycle,
      baseUrl,
      editEndpoint,
      version,
      latencyMs,
      reason: imageEdit && ready
        ? `NIM IMAGE_EDIT ready at ${baseUrl}`
        : `NIM configured but not edit-ready (ready=${readyRes.status}, live=${liveRes.status})`,
      models,
      selectedModelAvailable,
      secretRedaction: 'SAFE',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      reachable: false,
      live: false,
      ready: false,
      modelLoaded: false,
      imageEdit: false,
      readiness: 'UNREACHABLE',
      lifecycle: 'UNREACHABLE',
      baseUrl,
      editEndpoint,
      latencyMs: Date.now() - started,
      reason: `NVIDIA NIM unreachable: ${msg}`,
      secretRedaction: 'SAFE',
    };
  }
}

/** Documented remote requirements when local hardware cannot host Visual GenAI NIM. */
export function remoteNimRequirements(): {
  preferredModel: string;
  containerImage: string;
  minGpuVramGb: number;
  minSystemRamGb: number;
  gpuArchitecture: string;
  os: string;
  runtime: string[];
  apiEndpoint: string;
  healthEndpoints: string[];
  notes: string[];
} {
  return {
    preferredModel: 'qwen-image-edit-2511',
    containerImage: 'nvcr.io/nim/qwen/qwen-image-edit:1.0.1-variant',
    minGpuVramGb: 80,
    minSystemRamGb: 64,
    gpuArchitecture: 'NVIDIA Ampere or newer',
    os: 'Linux or WSL2',
    runtime: ['Docker or Podman', 'NVIDIA Container Toolkit / CDI GPU passthrough', 'NGC_API_KEY'],
    apiEndpoint: 'POST {NVIDIA_NIM_BASE_URL}/images/edits',
    healthEndpoints: ['GET {NVIDIA_NIM_BASE_URL}/health/ready', 'GET {NVIDIA_NIM_BASE_URL}/health/live'],
    notes: [
      'Set NVIDIA_NIM_BASE_URL to the remote NIM OpenAI-compatible root ending in /v1 (no secrets in the URL).',
      'Keep IMAGE_GENERATION on hosted FLUX.1-dev; route IMAGE_EDIT to NIM via NVIDIA_NIM_BASE_URL.',
      'Use NVIDIA_NIM_CACHE_DIR outside the MetroForge git tree for model weights.',
      'Source: https://docs.nvidia.com/nim/visual-genai/latest/support-matrix.html and getting-started.html',
    ],
  };
}
