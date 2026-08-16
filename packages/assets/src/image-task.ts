import type { ImageTaskKind } from '@metroforge/schemas';
import { NVIDIA_MODEL_CATALOG } from './foundry/nvidia-catalog.js';

export const NVIDIA_FLUX_DEV = 'black-forest-labs/flux.1-dev';
export const NVIDIA_FLUX_SCHNELL = 'black-forest-labs/flux.1-schnell';
export const NVIDIA_FLUX_KONTEXT = 'black-forest-labs/flux.1-kontext-dev';

/**
 * Capability router: do not send every visual task to flux.1-dev.
 * Kontext is the only cataloged model that supports reference/editing.
 */
export function nvidiaModelForImageTask(kind: ImageTaskKind): string {
  switch (kind) {
    case 'REFERENCE_VARIATION':
    case 'IMAGE_EDIT':
      return NVIDIA_FLUX_KONTEXT;
    case 'CONCEPT_IMAGE':
    case 'SPRITE_SOURCE':
      return NVIDIA_FLUX_DEV;
    case 'TILESET_SOURCE':
    case 'BACKGROUND_SOURCE':
      return NVIDIA_FLUX_DEV;
    case 'VFX_SOURCE':
      return NVIDIA_FLUX_SCHNELL;
    default:
      return NVIDIA_FLUX_DEV;
  }
}

export function nvidiaSupportsReference(modelId: string): boolean {
  const row = NVIDIA_MODEL_CATALOG.find((m) => m.modelId === modelId);
  return row?.supportsReferenceImages === true;
}
