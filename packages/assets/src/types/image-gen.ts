import type { ImageGenerationProfile } from './vision.js';

export interface ImageGenRequest {
  profile: ImageGenerationProfile;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
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
