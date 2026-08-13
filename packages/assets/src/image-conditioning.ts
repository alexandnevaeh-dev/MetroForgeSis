import type { ImageConditioning, ImageConditioningMode } from './types/image-gen.js';

const DEFAULT_STRENGTH: Record<ImageConditioningMode, number> = {
  ip_adapter: 0.55,
  controlnet_canny: 0.65,
  img2img: 0.72,
};

export function defaultConditioningStrength(mode: ImageConditioningMode): number {
  return DEFAULT_STRENGTH[mode];
}

export function resolveConditioningStrength(conditioning: ImageConditioning): number {
  const strength = conditioning.strength ?? defaultConditioningStrength(conditioning.mode);
  return Math.min(1, Math.max(0.05, strength));
}

export function conditioningPayload(conditioning: ImageConditioning): {
  conditioning_mode: ImageConditioningMode;
  init_image_base64: string;
  conditioning_strength: number;
} {
  return {
    conditioning_mode: conditioning.mode,
    init_image_base64: conditioning.image.toString('base64'),
    conditioning_strength: resolveConditioningStrength(conditioning),
  };
}
