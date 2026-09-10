import type { ImageTaskKind } from '@metroforge/schemas';
import {
  nvidiaModelById,
  nvidiaSelectModelForImageTask,
} from './foundry/nvidia-catalog.js';

/** @deprecated Prefer catalog lookup; kept for existing imports. */
export const NVIDIA_FLUX_DEV = 'black-forest-labs/flux.1-dev';
/** @deprecated Prefer catalog lookup; kept for existing imports. */
export const NVIDIA_FLUX_SCHNELL = 'black-forest-labs/flux.1-schnell';
/** @deprecated Prefer catalog lookup; kept for existing imports. */
export const NVIDIA_FLUX_KONTEXT = 'black-forest-labs/flux.1-kontext-dev';

/**
 * Capability router: model choice comes from NVIDIA_MODEL_CATALOG metadata
 * (imageTaskKinds / supportsEditing), not hardcoded model if/else branches.
 */
export function nvidiaModelForImageTask(kind: ImageTaskKind): string {
  return nvidiaSelectModelForImageTask(kind).modelId;
}

export function nvidiaSupportsReference(modelId: string): boolean {
  return nvidiaModelById(modelId)?.supportsReferenceImages === true;
}

export function nvidiaSupportsEditing(modelId: string): boolean {
  return nvidiaModelById(modelId)?.supportsEditing === true;
}
