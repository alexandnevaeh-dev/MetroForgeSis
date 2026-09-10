import type { FoundryCostClass } from '@metroforge/schemas';
import type { ImageTaskKind } from '@metroforge/schemas';
import type { NvidiaImageEndpointFamily } from '../providers/nvidia-image-contract.js';

export type NvidiaDeploymentType = 'hosted' | 'nim';
export type NvidiaModelStatus = 'enabled' | 'known-but-disabled' | 'experimental' | 'not-configured';

export interface NvidiaModelDescriptor {
  providerId: 'nvidia';
  modelId: string;
  displayName?: string;
  capabilities: string[];
  modalities: string[];
  /** Image task kinds this model may serve; used by capability routing. */
  imageTaskKinds?: ImageTaskKind[];
  supportsReferenceImages: boolean;
  supportsEditing: boolean;
  supportsTransparency?: boolean;
  supports3D?: boolean;
  supportsCustomReferenceImages?: boolean;
  supportsSeed?: boolean;
  supportsNegativePrompt?: boolean;
  supportsAspectRatio?: boolean;
  supportsMask?: boolean;
  supportsPromptStrength?: boolean;
  supportsOutputSize?: boolean;
  maxReferenceImages?: number;
  maxResolution?: { width: number; height: number };
  /** Hosted preview/API availability (may reject custom references). */
  hostedAvailable?: boolean;
  /** Self-hosted / remote NIM availability for custom references. */
  nimAvailable?: boolean;
  /** True only when arbitrary MetroForge assets are accepted (not canned example_id). */
  supportsCustomReferences?: boolean;
  /** Documented container image when known (never invent nvcr paths). */
  nimContainerImage?: string;
  /** Official minimum GPU memory in GB for NIM, when documented. */
  nimMinVramGb?: number;
  license?: string;
  commercialUse?: boolean;
  costClass: FoundryCostClass;
  qualityScore?: number;
  speedScore?: number;
  consistencyScore?: number;
  health?: 'healthy' | 'degraded' | 'offline';
  deploymentType?: NvidiaDeploymentType;
  endpointFamily?: NvidiaImageEndpointFamily;
  /** Only enabled models are live-routable. */
  status: NvidiaModelStatus;
  priority?: number;
  experimental?: boolean;
}

/**
 * Data-driven NVIDIA capability catalog. Live routing uses `status: 'enabled'` rows only.
 * Unverified candidates stay known-but-disabled / experimental — never fabricated as live.
 */
export const NVIDIA_MODEL_CATALOG: NvidiaModelDescriptor[] = [
  {
    providerId: 'nvidia',
    modelId: 'black-forest-labs/flux.1-dev',
    displayName: 'FLUX.1-dev',
    capabilities: ['image-generation', 'IMAGE_GENERATION', 'CHARACTER_CONCEPT', 'ENVIRONMENT_CONCEPT'],
    modalities: ['image'],
    imageTaskKinds: ['CONCEPT_IMAGE', 'SPRITE_SOURCE', 'TILESET_SOURCE', 'BACKGROUND_SOURCE'],
    supportsReferenceImages: false,
    supportsEditing: false,
    supportsTransparency: false,
    supportsSeed: true,
    supportsNegativePrompt: false,
    supportsAspectRatio: false,
    supportsMask: false,
    supportsPromptStrength: false,
    supportsOutputSize: true,
    maxReferenceImages: 0,
    maxResolution: { width: 1024, height: 1024 },
    costClass: 'credit',
    qualityScore: 88,
    speedScore: 55,
    consistencyScore: 70,
    license: 'NVIDIA API Terms / FLUX.1-dev model card',
    commercialUse: true,
    deploymentType: 'hosted',
    endpointFamily: 'NVIDIA_HOSTED_BUILD_API',
    status: 'enabled',
    priority: 90,
  },
  {
    providerId: 'nvidia',
    modelId: 'black-forest-labs/flux.1-schnell',
    displayName: 'FLUX.1-schnell',
    capabilities: ['image-generation', 'IMAGE_GENERATION', 'VFX_SOURCE'],
    modalities: ['image'],
    imageTaskKinds: ['VFX_SOURCE'],
    supportsReferenceImages: false,
    supportsEditing: false,
    supportsSeed: true,
    supportsNegativePrompt: false,
    supportsMask: false,
    maxReferenceImages: 0,
    costClass: 'credit',
    qualityScore: 78,
    speedScore: 86,
    consistencyScore: 62,
    license: 'NVIDIA API Terms / FLUX.1-schnell model card',
    commercialUse: true,
    deploymentType: 'hosted',
    endpointFamily: 'NVIDIA_HOSTED_BUILD_API',
    status: 'enabled',
    priority: 70,
  },
  {
    providerId: 'nvidia',
    modelId: 'black-forest-labs/flux.1-kontext-dev',
    displayName: 'FLUX.1-Kontext-dev',
    capabilities: [
      'image-generation',
      'image-editing',
      'image-consistency',
      'IMAGE_GENERATION',
      'IMAGE_EDIT',
      'IMAGE_TO_IMAGE',
    ],
    modalities: ['image'],
    imageTaskKinds: ['REFERENCE_VARIATION', 'IMAGE_EDIT'],
    supportsReferenceImages: true,
    supportsEditing: true,
    supportsCustomReferenceImages: false,
    supportsCustomReferences: false,
    hostedAvailable: true,
    nimAvailable: true,
    supportsSeed: true,
    supportsMask: false,
    supportsPromptStrength: false,
    supportsOutputSize: true,
    maxReferenceImages: 1,
    costClass: 'credit',
    qualityScore: 86,
    speedScore: 60,
    consistencyScore: 88,
    license: 'NVIDIA API Terms / FLUX.1-Kontext-dev model card',
    commercialUse: true,
    deploymentType: 'hosted',
    endpointFamily: 'NVIDIA_HOSTED_BUILD_API',
    status: 'enabled',
    priority: 95,
  },
  {
    providerId: 'nvidia',
    modelId: 'qwen/qwen-image-edit-2511',
    displayName: 'Qwen-Image-Edit-2511 (NIM)',
    capabilities: [
      'image-editing',
      'IMAGE_EDIT',
      'REFERENCE_CONDITIONING',
      'MULTI_REFERENCE',
      'IMAGE_TO_IMAGE',
    ],
    modalities: ['image'],
    imageTaskKinds: ['IMAGE_EDIT', 'REFERENCE_VARIATION'],
    supportsReferenceImages: true,
    supportsEditing: true,
    supportsCustomReferenceImages: true,
    supportsCustomReferences: true,
    hostedAvailable: false,
    nimAvailable: true,
    supportsSeed: true,
    supportsMask: false,
    supportsOutputSize: true,
    maxReferenceImages: 3,
    nimContainerImage: 'nvcr.io/nim/qwen/qwen-image-edit:1.0.1-variant',
    nimMinVramGb: 80,
    costClass: 'credit',
    qualityScore: 92,
    speedScore: 45,
    consistencyScore: 90,
    license: 'NVIDIA NIM / Qwen-Image-Edit model card',
    commercialUse: true,
    deploymentType: 'nim',
    endpointFamily: 'NVIDIA_SELF_HOSTED_NIM_OPENAI_IMAGES',
    status: 'not-configured',
    priority: 100,
  },
  {
    providerId: 'nvidia',
    modelId: 'qwen/qwen-image-edit-2509',
    displayName: 'Qwen-Image-Edit-2509 (NIM)',
    capabilities: [
      'image-editing',
      'IMAGE_EDIT',
      'REFERENCE_CONDITIONING',
      'MULTI_REFERENCE',
      'IMAGE_TO_IMAGE',
    ],
    modalities: ['image'],
    imageTaskKinds: ['IMAGE_EDIT', 'REFERENCE_VARIATION'],
    supportsReferenceImages: true,
    supportsEditing: true,
    supportsCustomReferenceImages: true,
    supportsCustomReferences: true,
    hostedAvailable: false,
    nimAvailable: true,
    supportsSeed: true,
    maxReferenceImages: 3,
    nimContainerImage: 'nvcr.io/nim/qwen/qwen-image-edit:1.0.1-variant',
    nimMinVramGb: 80,
    costClass: 'credit',
    qualityScore: 90,
    speedScore: 45,
    consistencyScore: 88,
    license: 'NVIDIA NIM / Qwen-Image-Edit model card',
    commercialUse: true,
    deploymentType: 'nim',
    endpointFamily: 'NVIDIA_SELF_HOSTED_NIM_OPENAI_IMAGES',
    status: 'not-configured',
    priority: 98,
  },
  {
    providerId: 'nvidia',
    modelId: 'qwen/qwen-image-edit',
    displayName: 'Qwen-Image-Edit (NIM base)',
    capabilities: ['image-editing', 'IMAGE_EDIT', 'REFERENCE_CONDITIONING', 'IMAGE_TO_IMAGE'],
    modalities: ['image'],
    imageTaskKinds: ['IMAGE_EDIT', 'REFERENCE_VARIATION'],
    supportsReferenceImages: true,
    supportsEditing: true,
    supportsCustomReferenceImages: true,
    supportsCustomReferences: true,
    hostedAvailable: false,
    nimAvailable: true,
    supportsSeed: true,
    maxReferenceImages: 1,
    nimContainerImage: 'nvcr.io/nim/qwen/qwen-image-edit:1.0.1-variant',
    nimMinVramGb: 80,
    costClass: 'credit',
    qualityScore: 88,
    speedScore: 45,
    consistencyScore: 86,
    license: 'NVIDIA NIM / Qwen-Image-Edit model card',
    commercialUse: true,
    deploymentType: 'nim',
    endpointFamily: 'NVIDIA_SELF_HOSTED_NIM_OPENAI_IMAGES',
    status: 'not-configured',
    priority: 96,
  },
  {
    providerId: 'nvidia',
    modelId: 'meta/llama-3.1-8b-instruct',
    displayName: 'Llama 3.1 8B Instruct',
    capabilities: ['LLM', 'reasoning', 'TEXT_GENERATION', 'CODE_GENERATION'],
    modalities: ['text'],
    supportsReferenceImages: false,
    supportsEditing: false,
    costClass: 'credit',
    qualityScore: 72,
    speedScore: 80,
    license: 'NVIDIA API Terms of Use',
    commercialUse: true,
    deploymentType: 'hosted',
    status: 'enabled',
    priority: 60,
  },
  {
    providerId: 'nvidia',
    modelId: 'nvidia/llama-3.1-nemotron-70b-instruct',
    displayName: 'Nemotron 70B Instruct',
    capabilities: ['LLM', 'reasoning', 'coding', 'TEXT_GENERATION', 'CODE_GENERATION'],
    modalities: ['text'],
    supportsReferenceImages: false,
    supportsEditing: false,
    costClass: 'credit',
    qualityScore: 90,
    speedScore: 50,
    license: 'NVIDIA API Terms of Use',
    commercialUse: true,
    deploymentType: 'hosted',
    status: 'enabled',
    priority: 80,
  },
  // Known candidates — not live until account/API verification promotes them.
  {
    providerId: 'nvidia',
    modelId: 'black-forest-labs/flux.2-klein',
    displayName: 'FLUX.2-klein (unverified)',
    capabilities: ['image-generation', 'IMAGE_GENERATION'],
    modalities: ['image'],
    supportsReferenceImages: false,
    supportsEditing: false,
    supportsSeed: true,
    costClass: 'credit',
    deploymentType: 'hosted',
    endpointFamily: 'NVIDIA_HOSTED_BUILD_API',
    status: 'known-but-disabled',
    experimental: true,
    priority: 0,
  },
  {
    providerId: 'nvidia',
    modelId: 'qwen/qwen-image',
    displayName: 'Qwen-Image (unverified on NVIDIA)',
    capabilities: ['image-generation', 'IMAGE_GENERATION'],
    modalities: ['image'],
    supportsReferenceImages: false,
    supportsEditing: false,
    costClass: 'credit',
    deploymentType: 'hosted',
    status: 'known-but-disabled',
    experimental: true,
    priority: 0,
  },
  {
    providerId: 'nvidia',
    modelId: 'stabilityai/stable-diffusion-3.5-large',
    displayName: 'SD 3.5 Large (unverified on NVIDIA)',
    capabilities: ['image-generation', 'IMAGE_GENERATION'],
    modalities: ['image'],
    supportsReferenceImages: false,
    supportsEditing: false,
    costClass: 'credit',
    deploymentType: 'hosted',
    status: 'known-but-disabled',
    experimental: true,
    priority: 0,
  },
  {
    providerId: 'nvidia',
    modelId: 'nvidia/trellis',
    displayName: 'TRELLIS 3D (not configured)',
    capabilities: ['THREE_D_GENERATION'],
    modalities: ['3d'],
    supportsReferenceImages: true,
    supportsEditing: false,
    supports3D: true,
    costClass: 'credit',
    deploymentType: 'hosted',
    status: 'not-configured',
    experimental: true,
    priority: 0,
  },
  {
    providerId: 'nvidia',
    modelId: 'nvidia/wan-video',
    displayName: 'WAN-family video (not configured)',
    capabilities: ['VIDEO_GENERATION'],
    modalities: ['video'],
    supportsReferenceImages: false,
    supportsEditing: false,
    costClass: 'credit',
    deploymentType: 'hosted',
    status: 'not-configured',
    experimental: true,
    priority: 0,
  },
];

export function nvidiaEnabledModels(): NvidiaModelDescriptor[] {
  return NVIDIA_MODEL_CATALOG.filter((m) => m.status === 'enabled');
}

export function nvidiaModelById(modelId: string): NvidiaModelDescriptor | undefined {
  return NVIDIA_MODEL_CATALOG.find((m) => m.modelId === modelId);
}

/**
 * Select the highest-priority enabled model that lists `kind` in imageTaskKinds,
 * falling back to any enabled image-generation model.
 */
export function nvidiaSelectModelForImageTask(kind: ImageTaskKind): NvidiaModelDescriptor {
  const enabled = nvidiaEnabledModels().filter((m) => m.modalities.includes('image'));
  const exact = enabled
    .filter((m) => m.imageTaskKinds?.includes(kind))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (exact[0]) return exact[0];

  const needsEdit = kind === 'IMAGE_EDIT' || kind === 'REFERENCE_VARIATION';
  if (needsEdit) {
    const editCapable = enabled
      .filter((m) => m.supportsEditing || m.supportsReferenceImages)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    if (editCapable[0]) return editCapable[0];
  }

  const generation = enabled
    .filter((m) => m.capabilities.includes('image-generation') || m.capabilities.includes('IMAGE_GENERATION'))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (generation[0]) return generation[0];

  throw new Error(`No enabled NVIDIA image model for task kind ${kind}`);
}
