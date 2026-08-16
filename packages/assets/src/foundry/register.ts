import { isProviderUserEnabled } from '@metroforge/shared';
import type { FoundryCostClass } from '@metroforge/schemas';
import { ImageProviderRegistry, type ImageProviderRegistration } from '../image-router.js';
import { ComfyUIProvider } from '../providers/comfyui.js';
import { DiffusersProvider } from '../providers/diffusers.js';
import { NvidiaImageProvider } from '../providers/nvidia-image.js';
import { Automatic1111Provider } from '../providers/automatic1111.js';
import { HuggingFaceImageProvider } from '../providers/huggingface-image.js';
import { StabilityProvider } from '../providers/stability.js';
import { DeepAIProvider } from '../providers/deepai.js';
import { ReplicateProvider } from '../providers/replicate.js';
import { KenneyProvider } from '../providers/kenney.js';
import { OpenGameArtProvider } from '../providers/opengameart.js';

export interface FoundryImageBootstrapOptions {
  comfyuiUrl?: string;
  automatic1111Url?: string;
  diffusersPython?: string;
  diffusersModelId?: string;
  nvidiaApiKey?: string;
  nvidiaApiBaseUrl?: string;
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
      },
      'comfyui',
      'Disabled in Settings',
    );
  }

  if (options.nvidiaApiKey) {
    push(
      {
        provider: new NvidiaImageProvider({
          apiKey: options.nvidiaApiKey,
          baseUrl: options.nvidiaApiBaseUrl,
          modelId: options.nvidiaImageModel,
          pythonPath: options.diffusersPython,
        }),
        local: false,
        priority: 88,
        costClass: 'credit',
        family: 'nvidia',
        capabilities: ['image-generation', 'vision'],
        supportsReferenceImages: false,
        qualityScore: 88,
        speedScore: 60,
        consistencyScore: 70,
        reliabilityScore: 75,
        commercialUse: 'allowed',
        license: 'NVIDIA API Terms / model card',
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
      capabilities: ['image-generation'],
      qualityScore: 74,
      speedScore: 65,
      consistencyScore: 68,
      reliabilityScore: 60,
      commercialUse: 'unknown',
      license: 'Local diffusion — model license unverified',
    },
    'diffusers',
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
    nvidiaApiKey: extra.nvidiaApiKey ?? process.env.NVIDIA_API_KEY,
    nvidiaApiBaseUrl: extra.nvidiaApiBaseUrl ?? process.env.NVIDIA_API_BASE_URL,
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
