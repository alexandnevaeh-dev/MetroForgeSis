import { isProviderUserEnabled } from '@metroforge/shared';
import type { FoundryCostClass } from '@metroforge/schemas';
import { ImageProviderRegistry, type ImageProviderRegistration } from '../image-router.js';
import { ComfyUIProvider } from '../providers/comfyui.js';
import { DiffusersProvider } from '../providers/diffusers.js';
import { LocalSpriteWorkerImageAdapter } from '../providers/local-sprite-worker-adapter.js';
import { NvidiaImageProvider } from '../providers/nvidia-image.js';
import { Automatic1111Provider } from '../providers/automatic1111.js';
import { HuggingFaceImageProvider } from '../providers/huggingface-image.js';
import { StabilityProvider } from '../providers/stability.js';
import { DeepAIProvider } from '../providers/deepai.js';
import { ReplicateProvider } from '../providers/replicate.js';
import { KenneyProvider } from '../providers/kenney.js';
import { OpenGameArtProvider } from '../providers/opengameart.js';
import { PollinationsImageProvider } from '../providers/pollinations-image.js';
import { DreamOProvider, PulidProvider, QwenImageEditProvider } from '../providers/local-visual-fleet.js';
import { NVIDIA_MODEL_CATALOG } from './nvidia-catalog.js';
import {
  LOCAL_GPU_IMAGE_ESTIMATED_VRAM_MB,
  LOCAL_IMAGE_EDIT_ESTIMATED_VRAM_MB,
} from './vram.js';

export interface FoundryImageBootstrapOptions {
  comfyuiUrl?: string;
  automatic1111Url?: string;
  diffusersPython?: string;
  diffusersModelId?: string;
  pollinationsBaseUrl?: string;
  pollinationsModel?: string;
  pollinationsApiKey?: string;
  /** Registering a public keyless network provider unconditionally would surprise a caller who
   *  never asked for network access (e.g. OFFLINE mode, or a sandboxed test run). Default false —
   *  the provider is skipped, not merely deprioritized, unless the caller opts in. */
  enablePollinations?: boolean;
  qwenImageWorker?: string;
  qwenImageModelPath?: string;
  dreamoWorker?: string;
  dreamoModelPath?: string;
  pulidWorker?: string;
  pulidModelPath?: string;
  nvidiaApiKey?: string;
  nvidiaApiBaseUrl?: string;
  nvidiaImageApiBaseUrl?: string;
  nvidiaImageModel?: string;
  huggingfaceApiKey?: string;
  huggingfaceImageModel?: string;
  stabilityApiKey?: string;
  deepaiApiKey?: string;
  replicateApiToken?: string;
  commercialUseRequired?: boolean;
  providerEnabled?: Record<string, boolean>;
  /** When true, also register Kenney/OpenGameArt retrieve adapters. Default false for the
   *  generation registry so stock packs cannot steal hero-character routes. */
  includeRetrieval?: boolean;
}

export interface DisabledImageProvider {
  id: string;
  local: boolean;
  priority: number;
  healthy: boolean;
  health: string;
  status: string;
  reason: string;
  userEnabled: boolean;
}

function allow(options: FoundryImageBootstrapOptions, id: string): boolean {
  return isProviderUserEnabled(options.providerEnabled, id);
}

function disabled(id: string, local: boolean, priority: number, reason: string): DisabledImageProvider {
  return {
    id,
    local,
    priority,
    healthy: false,
    health: 'disabled',
    status: 'DISABLED',
    reason,
    userEnabled: false,
  };
}

export function registerFoundryImageProviders(
  registry: ImageProviderRegistry,
  options: FoundryImageBootstrapOptions,
): DisabledImageProvider[] {
  const skipped: DisabledImageProvider[] = [];
  const push = (registration: ImageProviderRegistration, id: string, fallbackReason: string) => {
    if (!allow(options, id)) {
      skipped.push(disabled(id, registration.local, registration.priority, fallbackReason));
      return;
    }
    registry.register(registration);
  };

  if (options.comfyuiUrl) {
    push(
      {
        provider: new ComfyUIProvider({ baseUrl: options.comfyuiUrl }),
        local: true,
        priority: 90,
        costClass: 'local' satisfies FoundryCostClass,
        family: 'local-image',
        capabilities: ['image-generation'],
        qualityScore: 80,
        speedScore: 70,
        consistencyScore: 75,
        reliabilityScore: 70,
        commercialUse: 'unknown',
        license: 'ComfyUI workflow — model license unverified',
        executionTargets: ['LOCAL_SERVICE', 'REMOTE_COMFYUI'],
        endpoint: options.comfyuiUrl,
        estimatedVramMb: LOCAL_GPU_IMAGE_ESTIMATED_VRAM_MB,
      },
      'comfyui',
      'Disabled in Settings',
    );
  }

  if (options.nvidiaApiKey) {
    const nvidiaModelMeta = NVIDIA_MODEL_CATALOG.find(
      (m) => m.modelId === (options.nvidiaImageModel ?? process.env.NVIDIA_IMAGE_MODEL ?? 'black-forest-labs/flux.1-dev'),
    );
    push(
      {
        provider: new NvidiaImageProvider({
          apiKey: options.nvidiaApiKey,
          baseUrl: options.nvidiaApiBaseUrl,
          imageApiBaseUrl: options.nvidiaImageApiBaseUrl,
          modelId: options.nvidiaImageModel,
          pythonPath: options.diffusersPython,
        }),
        local: false,
        priority: nvidiaModelMeta?.priority ?? 88,
        costClass: nvidiaModelMeta?.costClass ?? 'credit',
        family: 'nvidia',
        capabilities: nvidiaModelMeta?.capabilities ?? ['image-generation', 'vision'],
        supportsReferenceImages: nvidiaModelMeta?.supportsReferenceImages ?? false,
        qualityScore: nvidiaModelMeta?.qualityScore ?? 88,
        speedScore: nvidiaModelMeta?.speedScore ?? 60,
        consistencyScore: nvidiaModelMeta?.consistencyScore ?? 70,
        reliabilityScore: 75,
        commercialUse: nvidiaModelMeta?.commercialUse === false ? 'restricted' : 'allowed',
        license: nvidiaModelMeta?.license ?? 'NVIDIA API Terms / model card',
        executionTargets: ['REMOTE_API'],
        endpoint: options.nvidiaImageApiBaseUrl ?? options.nvidiaApiBaseUrl,
      },
      'nvidia-image',
      'Disabled in Settings',
    );
  }

  push(
    {
      provider: new DiffusersProvider({
        pythonPath: options.diffusersPython,
        modelId: options.diffusersModelId,
      }),
      local: true,
      priority: 85,
      costClass: 'local',
      family: 'local-image',
      capabilities: ['image-generation', 'image-editing', 'image-consistency'],
      supportsReferenceImages: true,
      qualityScore: 74,
      speedScore: 65,
      consistencyScore: 68,
      reliabilityScore: 60,
      commercialUse: 'unknown',
      license: 'Local diffusion — model license unverified',
      executionTargets: ['LOCAL_CPU', 'LOCAL_CUDA', 'REMOTE_WORKER'],
      estimatedVramMb: LOCAL_GPU_IMAGE_ESTIMATED_VRAM_MB,
      supportsCpuOffload: true,
    },
    'diffusers',
    'Disabled in Settings',
  );

  // Free, fully local, zero-network, zero-model-weight, zero-payment (workers/local_sprite_worker.py
  // — stdlib + Pillow only; see docs/asset-pipeline/LOCAL_SPRITE_WORKER.md for the real, sourced
  // research behind why this exists rather than one of four externally-suggested candidates, all
  // of which fail the free/local/no-payment requirement for actual generation). Registered
  // unconditionally (no API key or running local service to gate on, unlike every provider above)
  // with a low qualityScore/priority reflecting what it honestly is — a simple seeded procedural
  // shape generator, not a competitor to real AI-generated art — so it only wins selection when
  // nothing better is actually healthy (e.g. LOCAL_ONLY/OFFLINE modes with no GPU/model configured,
  // where every other local candidate reports UNAVAILABLE today).
  push(
    {
      provider: new LocalSpriteWorkerImageAdapter({ pythonPath: options.diffusersPython }),
      local: true,
      priority: 20,
      costClass: 'local',
      family: 'local-image',
      capabilities: ['image-generation'],
      qualityScore: 25,
      speedScore: 95,
      consistencyScore: 100,
      reliabilityScore: 90,
      commercialUse: 'allowed',
      license: 'MetroForge internally authored procedural generator (original work)',
      executionTargets: ['LOCAL_CPU'],
      estimatedVramMb: 0,
      // This worker's real memory footprint is a few MB of Pillow image buffers, nothing like
      // the 12GB FP32 floor production-capacity.ts's gate assumes for a real diffusion backend —
      // applying that gate here would incorrectly block a provider that was never measured
      // against it and could never plausibly need it.
      useProductionCapacityGate: false,
    },
    'local-sprite-worker',
    'Disabled in Settings',
  );

  // Free, keyless, no local GPU required — the one candidate that survives when neither a paid
  // API key nor local inference hardware is configured. Built (packages/assets/src/providers/
  // pollinations-image.ts, fully tested) but never registered anywhere until now, so it never
  // actually participated in provider selection despite being the ideal FREE_ONLY/no-GPU fallback.
  if (options.enablePollinations) {
    push(
      {
        provider: new PollinationsImageProvider({
          baseUrl: options.pollinationsBaseUrl,
          model: options.pollinationsModel,
          apiKey: options.pollinationsApiKey,
        }),
        local: false,
        priority: 55,
        costClass: 'free',
        family: 'pollinations',
        capabilities: ['image-generation'],
        qualityScore: 62,
        speedScore: 55,
        consistencyScore: 45,
        reliabilityScore: 55,
        commercialUse: 'unknown',
        license: 'Pollinations public API — per-model terms, not independently verified',
        executionTargets: ['REMOTE_API'],
        endpoint: options.pollinationsBaseUrl,
      },
      'pollinations-image',
      'Disabled in Settings',
    );
  }

  push(
    {
      provider: new QwenImageEditProvider({ pythonPath: options.diffusersPython, workerPath: options.qwenImageWorker, modelPath: options.qwenImageModelPath }),
      local: true,
      priority: 95,
      costClass: 'local',
      family: 'local-image-edit',
      capabilities: ['image-generation', 'image-editing', 'image-consistency'],
      supportsReferenceImages: true,
      qualityScore: 90,
      speedScore: 35,
      consistencyScore: 92,
      reliabilityScore: 45,
      commercialUse: 'unknown',
      license: 'Qwen-Image-Edit-2509 model card required',
      executionTargets: ['LOCAL_CUDA', 'REMOTE_WORKER'],
      hardwareOwner: 'configured qwen worker',
      estimatedVramMb: LOCAL_IMAGE_EDIT_ESTIMATED_VRAM_MB,
    },
    'qwen-image-edit',
    'Disabled in Settings',
  );

  push(
    {
      provider: new DreamOProvider({ pythonPath: options.diffusersPython, workerPath: options.dreamoWorker, modelPath: options.dreamoModelPath }),
      local: true,
      priority: 90,
      costClass: 'local',
      family: 'local-image-edit',
      capabilities: ['image-generation', 'image-editing', 'image-consistency'],
      supportsReferenceImages: true,
      qualityScore: 88,
      speedScore: 35,
      consistencyScore: 88,
      reliabilityScore: 40,
      commercialUse: 'unknown',
      license: 'DreamO v1.1 model card required',
      executionTargets: ['LOCAL_CUDA', 'REMOTE_WORKER'],
      hardwareOwner: 'configured dreamo worker',
      estimatedVramMb: LOCAL_IMAGE_EDIT_ESTIMATED_VRAM_MB,
    },
    'dreamo',
    'Disabled in Settings',
  );

  push(
    {
      provider: new PulidProvider({ pythonPath: options.diffusersPython, workerPath: options.pulidWorker, modelPath: options.pulidModelPath, enabled: false }),
      local: true,
      priority: 40,
      costClass: 'local',
      family: 'local-image-edit',
      capabilities: ['image-generation', 'image-editing', 'image-consistency'],
      supportsReferenceImages: true,
      qualityScore: 70,
      speedScore: 35,
      consistencyScore: 80,
      reliabilityScore: 30,
      commercialUse: 'unknown',
      license: 'PuLID experimental model/checkpoint terms required',
      estimatedVramMb: LOCAL_IMAGE_EDIT_ESTIMATED_VRAM_MB,
    },
    'pulid',
    'Disabled in Settings',
  );

  const a1111Url = options.automatic1111Url;
  if (a1111Url) {
    push(
      {
        provider: new Automatic1111Provider({ baseUrl: a1111Url }),
        local: true,
        priority: 84,
        costClass: 'local',
        family: 'local-image',
        capabilities: ['image-generation', 'image-editing'],
        supportsReferenceImages: true,
        qualityScore: 76,
        speedScore: 68,
        consistencyScore: 70,
        reliabilityScore: 62,
        commercialUse: 'unknown',
        license: 'AUTOMATIC1111 checkpoint license unverified',
      },
      'automatic1111',
      'Disabled in Settings',
    );
  }

  if (options.huggingfaceApiKey) {
    push(
      {
        provider: new HuggingFaceImageProvider({
          apiKey: options.huggingfaceApiKey,
          modelId: options.huggingfaceImageModel,
          commercialUseRequired: options.commercialUseRequired,
        }),
        local: false,
        priority: 70,
        costClass: 'credit',
        family: 'huggingface',
        capabilities: ['image-generation'],
        qualityScore: 72,
        speedScore: 58,
        consistencyScore: 60,
        reliabilityScore: 55,
        commercialUse: 'unknown',
        license: 'Hugging Face model card (per-model)',
      },
      'huggingface-image',
      'Disabled in Settings',
    );
  }

  if (options.stabilityApiKey) {
    push(
      {
        provider: new StabilityProvider({ apiKey: options.stabilityApiKey }),
        local: false,
        priority: 65,
        costClass: 'paid',
        family: 'stability',
        capabilities: ['image-generation', 'image-editing', 'texture'],
        supportsReferenceImages: true,
        qualityScore: 90,
        speedScore: 70,
        consistencyScore: 74,
        reliabilityScore: 80,
        commercialUse: 'allowed',
        license: 'Stability API terms',
      },
      'stability',
      'Disabled in Settings',
    );
  }

  if (options.deepaiApiKey) {
    push(
      {
        provider: new DeepAIProvider({ apiKey: options.deepaiApiKey }),
        local: false,
        priority: 40,
        costClass: 'paid',
        family: 'deepai',
        capabilities: ['image-generation'],
        qualityScore: 55,
        speedScore: 75,
        consistencyScore: 40,
        reliabilityScore: 50,
        commercialUse: 'unknown',
        license: 'DeepAI terms — unverified commercial status',
      },
      'deepai',
      'Disabled in Settings',
    );
  }

  if (options.replicateApiToken) {
    push(
      {
        provider: new ReplicateProvider({ apiToken: options.replicateApiToken }),
        local: false,
        priority: 45,
        costClass: 'paid',
        family: 'replicate',
        capabilities: ['image-generation', '3d-generation'],
        qualityScore: 84,
        speedScore: 60,
        consistencyScore: 70,
        reliabilityScore: 70,
        commercialUse: 'unknown',
        license: 'Replicate model-dependent',
      },
      'replicate',
      'Disabled in Settings',
    );
  }

  if (options.includeRetrieval) {
    push(
      {
        provider: new KenneyProvider({ commercialUseRequired: options.commercialUseRequired }),
        local: true,
        priority: 95,
        costClass: 'free',
        family: 'kenney',
        kind: 'retrieve',
        capabilities: ['image-generation'],
        qualityScore: 60,
        speedScore: 100,
        consistencyScore: 50,
        reliabilityScore: 95,
        commercialUse: 'allowed',
        license: 'CC0-1.0',
      },
      'kenney',
      'Disabled in Settings',
    );
    push(
      {
        provider: new OpenGameArtProvider({ commercialUseRequired: options.commercialUseRequired }),
        local: false,
        priority: 50,
        costClass: 'free',
        family: 'opengameart',
        kind: 'retrieve',
        capabilities: ['image-generation'],
        qualityScore: 58,
        speedScore: 90,
        consistencyScore: 45,
        reliabilityScore: 60,
        commercialUse: 'unknown',
        license: 'per-asset (never assume CC0)',
      },
      'opengameart',
      'Disabled in Settings',
    );
  }

  return skipped;
}

export function foundryBootstrapFromEnv(
  extra: Partial<FoundryImageBootstrapOptions> = {},
): FoundryImageBootstrapOptions {
  return {
    comfyuiUrl: extra.comfyuiUrl ?? process.env.COMFYUI_BASE_URL,
    automatic1111Url: extra.automatic1111Url ?? process.env.AUTOMATIC1111_BASE_URL,
    diffusersPython: extra.diffusersPython ?? process.env.DIFFUSERS_PYTHON,
    diffusersModelId: extra.diffusersModelId ?? process.env.DIFFUSERS_MODEL_ID,
    pollinationsBaseUrl: extra.pollinationsBaseUrl ?? process.env.POLLINATIONS_BASE_URL,
    pollinationsModel: extra.pollinationsModel ?? process.env.POLLINATIONS_IMAGE_MODEL,
    pollinationsApiKey: extra.pollinationsApiKey ?? process.env.POLLINATIONS_API_KEY,
    enablePollinations: extra.enablePollinations ?? process.env.POLLINATIONS_ENABLED === 'true',
    qwenImageWorker: extra.qwenImageWorker ?? process.env.QWEN_IMAGE_WORKER,
    qwenImageModelPath: extra.qwenImageModelPath ?? process.env.QWEN_IMAGE_MODEL_PATH,
    dreamoWorker: extra.dreamoWorker ?? process.env.DREAMO_WORKER,
    dreamoModelPath: extra.dreamoModelPath ?? process.env.DREAMO_MODEL_PATH,
    pulidWorker: extra.pulidWorker ?? process.env.PULID_WORKER,
    pulidModelPath: extra.pulidModelPath ?? process.env.PULID_MODEL_PATH,
    nvidiaApiKey: extra.nvidiaApiKey ?? process.env.NVIDIA_API_KEY,
    nvidiaApiBaseUrl: extra.nvidiaApiBaseUrl ?? process.env.NVIDIA_API_BASE_URL,
    nvidiaImageApiBaseUrl: extra.nvidiaImageApiBaseUrl ?? process.env.NVIDIA_IMAGE_API_BASE_URL,
    nvidiaImageModel: extra.nvidiaImageModel ?? process.env.NVIDIA_IMAGE_MODEL,
    huggingfaceApiKey: extra.huggingfaceApiKey ?? process.env.HUGGINGFACE_API_KEY ?? process.env.HF_TOKEN,
    huggingfaceImageModel: extra.huggingfaceImageModel ?? process.env.HF_IMAGE_MODEL,
    stabilityApiKey: extra.stabilityApiKey ?? process.env.STABILITY_API_KEY,
    deepaiApiKey: extra.deepaiApiKey ?? process.env.DEEPAI_API_KEY,
    replicateApiToken: extra.replicateApiToken ?? process.env.REPLICATE_API_TOKEN,
    commercialUseRequired: extra.commercialUseRequired,
    providerEnabled: extra.providerEnabled,
    includeRetrieval: extra.includeRetrieval,
  };
}
