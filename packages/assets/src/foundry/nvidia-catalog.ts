import type { FoundryCostClass } from '@metroforge/schemas';

export interface NvidiaModelDescriptor {
  providerId: 'nvidia';
  modelId: string;
  capabilities: string[];
  modalities: string[];
  supportsReferenceImages: boolean;
  supportsEditing: boolean;
  supportsTransparency?: boolean;
  supports3D?: boolean;
  maxResolution?: { width: number; height: number };
  license?: string;
  commercialUse?: boolean;
  costClass: FoundryCostClass;
  qualityScore?: number;
  speedScore?: number;
  consistencyScore?: number;
  health?: 'healthy' | 'degraded' | 'offline';
}

/**
 * Data-driven NVIDIA capability catalog. Model ids come from configuration, not hardcoded
 * "always use X" routing. Defaults match currently verified endpoints; discovery can overlay.
 */
export const NVIDIA_MODEL_CATALOG: NvidiaModelDescriptor[] = [
  {
    providerId: 'nvidia',
    modelId: 'black-forest-labs/flux.1-dev',
    capabilities: ['image-generation'],
    modalities: ['image'],
    supportsReferenceImages: false,
    supportsEditing: false,
    supportsTransparency: false,
    costClass: 'credit',
    qualityScore: 88,
    speedScore: 55,
    consistencyScore: 70,
    license: 'NVIDIA API Terms / FLUX.1-dev model card',
    commercialUse: true,
  },
  {
    providerId: 'nvidia',
    modelId: 'black-forest-labs/flux.1-schnell',
    capabilities: ['image-generation'],
    modalities: ['image'],
    supportsReferenceImages: false,
    supportsEditing: false,
    costClass: 'credit',
    qualityScore: 78,
    speedScore: 86,
    consistencyScore: 62,
    license: 'NVIDIA API Terms / FLUX.1-schnell model card',
    commercialUse: true,
  },
  {
    providerId: 'nvidia',
    modelId: 'black-forest-labs/flux.1-kontext-dev',
    capabilities: ['image-generation', 'image-editing', 'image-consistency'],
    modalities: ['image'],
    supportsReferenceImages: true,
    supportsEditing: true,
    costClass: 'credit',
    qualityScore: 86,
    speedScore: 60,
    consistencyScore: 88,
    license: 'NVIDIA API Terms / FLUX.1-Kontext-dev model card',
    commercialUse: true,
  },
  {
    providerId: 'nvidia',
    modelId: 'meta/llama-3.1-8b-instruct',
    capabilities: ['LLM', 'reasoning'],
    modalities: ['text'],
    supportsReferenceImages: false,
    supportsEditing: false,
    costClass: 'credit',
    qualityScore: 72,
    speedScore: 80,
    license: 'NVIDIA API Terms of Use',
    commercialUse: true,
  },
  {
    providerId: 'nvidia',
    modelId: 'nvidia/llama-3.1-nemotron-70b-instruct',
    capabilities: ['LLM', 'reasoning', 'coding'],
    modalities: ['text'],
    supportsReferenceImages: false,
    supportsEditing: false,
    costClass: 'credit',
    qualityScore: 90,
    speedScore: 50,
    license: 'NVIDIA API Terms of Use',
    commercialUse: true,
  },
];
