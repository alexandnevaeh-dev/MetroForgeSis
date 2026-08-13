import type { AssetCritiqueRequest } from './vlm-critic.js';
import type { VisionAnalysisResponse } from './types/vision.js';
import { VLMCritic } from './vlm-critic.js';
import { NvidiaVisionCritic } from './providers/nvidia-vision-critic.js';
import { deterministicCritique } from './vision-critic-shared.js';

export interface VisionCritic {
  backendId(): string;
  isAvailable(): Promise<boolean>;
  critique(request: AssetCritiqueRequest): Promise<VisionAnalysisResponse>;
}

export interface VisionCriticFactoryConfig {
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  nvidiaApiKey?: string;
  nvidiaApiBaseUrl?: string;
  nvidiaVisionModel?: string;
}

class CompositeVisionCritic implements VisionCritic {
  constructor(private readonly backends: VisionCritic[]) {}

  backendId(): string {
    return this.backends.map((b) => b.backendId()).join('+') || 'none';
  }

  async isAvailable(): Promise<boolean> {
    for (const backend of this.backends) {
      if (await backend.isAvailable()) return true;
    }
    return false;
  }

  async critique(request: AssetCritiqueRequest): Promise<VisionAnalysisResponse> {
    for (const backend of this.backends) {
      if (!(await backend.isAvailable())) continue;
      return backend.critique(request);
    }
    return deterministicCritique(request);
  }
}

/** Prefer local Ollama vision, then hosted NVIDIA NIM vision. */
export function createVisionCritic(config: VisionCriticFactoryConfig): VisionCritic {
  const backends: VisionCritic[] = [];

  if (config.ollamaBaseUrl) {
    backends.push(
      new VLMCritic({
        ollamaBaseUrl: config.ollamaBaseUrl,
        model: config.ollamaModel,
      }),
    );
  }

  if (config.nvidiaApiKey ?? process.env.NVIDIA_API_KEY) {
    backends.push(
      new NvidiaVisionCritic({
        apiKey: config.nvidiaApiKey,
        baseUrl: config.nvidiaApiBaseUrl,
        modelId: config.nvidiaVisionModel,
      }),
    );
  }

  if (backends.length === 0) {
    return {
      backendId: () => 'deterministic',
      isAvailable: async () => false,
      critique: async (request) => deterministicCritique(request),
    };
  }

  return new CompositeVisionCritic(backends);
}
