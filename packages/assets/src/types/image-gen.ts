import type { ImageGenerationProfile } from './vision.js';

export type ImageConditioningMode = 'controlnet_canny' | 'ip_adapter' | 'img2img';

/** Optional reference/control image conditioning for img2img-style generation. */
export interface ImageConditioning {
  mode: ImageConditioningMode;
  /** Reference or control source image (PNG). */
  image: Buffer;
  /** Conditioning strength / denoise (0–1). Defaults vary by mode. */
  strength?: number;
}

export interface ImageGenRequest {
  profile: ImageGenerationProfile;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  signal?: AbortSignal;
  conditioning?: ImageConditioning;
}

export interface ImageGenResult {
  image: Buffer;
  provider: string;
  modelId: string;
  seed: number;
  fallbackGenerated: boolean;
}

export interface ImageGenerator {
  id: string;
  checkHealth(): Promise<boolean>;
  generateImage(request: ImageGenRequest): Promise<ImageGenResult>;
}
