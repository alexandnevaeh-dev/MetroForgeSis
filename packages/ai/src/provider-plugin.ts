import type { AICapability, ProviderHealth } from './types.js';

/** Stable plugin SDK for adding new AI providers without application changes */
export interface ProviderPlugin {
  id: string;
  name: string;
  version: string;
  initialize(config: Record<string, unknown>): Promise<void>;
  health(): Promise<ProviderHealth>;
  listModels(): Promise<string[]>;
  supports(capability: string): boolean;
  generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse>;
  cancel?(requestId: string): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface ProviderGenerateRequest {
  capability: string;
  modelId?: string;
  prompt: string;
  systemPrompt?: string;
  parameters?: Record<string, unknown>;
}

export interface ProviderGenerateResponse {
  output: string | Buffer;
  modelId: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export class ProviderPluginRegistry {
  private plugins = new Map<string, ProviderPlugin>();

  register(plugin: ProviderPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  get(id: string): ProviderPlugin | undefined {
    return this.plugins.get(id);
  }

  list(): ProviderPlugin[] {
    return Array.from(this.plugins.values());
  }

  findByCapability(capability: string): ProviderPlugin[] {
    return this.list().filter((p) => p.supports(capability));
  }
}

/** Asset-generation provider interfaces (image, audio, vision, etc.) */
export interface ImageGenerationProvider {
  id: string;
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
}

export interface ImageGenerationRequest {
  profile: ImageGenerationProfile;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  referenceImage?: Buffer;
}

export type ImageGenerationProfile =
  | 'CONCEPT_ART'
  | 'CHARACTER'
  | 'ENEMY'
  | 'BOSS'
  | 'NPC'
  | 'PORTRAIT'
  | 'ITEM'
  | 'WEAPON'
  | 'ICON'
  | 'ENVIRONMENT'
  | 'BACKGROUND'
  | 'TILE_SOURCE'
  | 'VFX_TEXTURE'
  | 'UI_ART'
  | 'MARKETING_ART';

export interface ImageGenerationResponse {
  image: Buffer;
  modelId: string;
  provider: string;
  seed: number;
  fallbackGenerated: boolean;
}

export interface VisionAnalysisProvider {
  id: string;
  analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResponse>;
}

export interface VisionAnalysisRequest {
  image: Buffer;
  task: 'consistency' | 'validation' | 'tagging' | 'critique';
  context?: string;
}

export interface VisionAnalysisResponse {
  passed: boolean;
  score: number;
  issues: string[];
  tags: string[];
  description: string;
}

export interface AudioGenerationProvider {
  id: string;
  generateAudio(request: AudioGenerationRequest): Promise<AudioGenerationResponse>;
}

export interface AudioGenerationRequest {
  type: 'sfx' | 'music' | 'ambience';
  prompt: string;
  durationSeconds: number;
  seed?: number;
}

export interface AudioGenerationResponse {
  audio: Buffer;
  modelId: string;
  provider: string;
  format: 'wav' | 'ogg';
}

export interface BackgroundRemovalProvider {
  id: string;
  removeBackground(image: Buffer): Promise<Buffer>;
}

export interface SegmentationProvider {
  id: string;
  segment(image: Buffer): Promise<{ mask: Buffer; regions: unknown[] }>;
}

export interface EmbeddingProvider {
  id: string;
  embed(texts: string[]): Promise<number[][]>;
}

/** Map legacy AICapability to new ModelCapability where needed */
export const LEGACY_CAPABILITY_MAP: Partial<Record<AICapability, string>> = {
  text_generation: 'TEXT_GENERATION',
  code_generation: 'CODE_GENERATION',
  json_generation: 'JSON_GENERATION',
  narrative: 'NARRATIVE',
  image_generation: 'IMAGE_GENERATION',
  audio_generation: 'SFX_GENERATION',
  embedding: 'EMBEDDING',
};
