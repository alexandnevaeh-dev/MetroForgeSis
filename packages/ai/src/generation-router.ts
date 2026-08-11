import type { ModelCapability, ModelEntry, GenerationFailureReason } from '@metroforge/schemas';
import type { GenerationMode } from '@metroforge/shared';
import { ModelCatalogService, rankModelsForCapability, type RankedModel } from './model-catalog.js';
import { HardwareProfiler } from './hardware-profiler.js';
import { ProviderRegistry, CapabilityRouter, ModelRegistry, FallbackManager } from './registry.js';
import type { TextGenerationProvider } from './types.js';

export interface GenerationRequest {
  capability: ModelCapability;
  projectId?: string;
  jobId?: string;
  prompt: string;
  systemPrompt?: string;
  constraints?: Record<string, unknown>;
  mode?: GenerationMode;
  qualityTarget?: 'fast' | 'balanced' | 'quality';
  jsonMode?: boolean;
}

export interface GenerationResponse {
  result: string;
  modelId: string;
  provider: string;
  capability: ModelCapability;
  durationMs: number;
  fallbackUsed: boolean;
}

const TEXT_CAPABILITIES: ModelCapability[] = [
  'TEXT_GENERATION',
  'REASONING',
  'NARRATIVE',
  'JSON_GENERATION',
  'WORLD_DESIGN',
  'QA_REASONING',
  'CODE_GENERATION',
  'GDSCRIPT',
  'TYPESCRIPT',
  'PYTHON',
  'SHADER_CODE',
  'CODE_REPAIR',
  'CLASSIFICATION',
  'TAGGING',
  'METADATA',
  'ROUTING',
];

export class GenerationRouter {
  private readonly catalog: ModelCatalogService;
  private readonly hardware: HardwareProfiler;
  private readonly providers: ProviderRegistry;

  constructor(dataDir?: string, providers?: ProviderRegistry) {
    this.catalog = new ModelCatalogService(dataDir);
    this.hardware = new HardwareProfiler();
    this.providers = providers ?? new ProviderRegistry();
  }

  /** Model-agnostic entry point — request CAPABILITY, not model name */
  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const hw = this.hardware.profile();
    const mode = request.mode ?? 'LOCAL_ONLY';
    const ranked = rankModelsForCapability(this.catalog.list(), request.capability, hw, {
      freeOnly: mode === 'FREE_ONLY' || mode === 'HYBRID_FREE',
      localOnly: mode === 'LOCAL_ONLY',
      preferInstalled: true,
    });

    if (ranked.length === 0) {
      throw this.fail('CAPABILITY_MISMATCH', `No models for capability ${request.capability}`);
    }

    const errors: Error[] = [];

    for (const candidate of ranked.slice(0, 5)) {
      try {
        return await this.executeWithModel(candidate, request);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    throw this.fail(
      'GENERATION_FAILED',
      errors.map((e) => e.message).join('; ') || 'All model candidates failed',
    );
  }

  rankCandidates(capability: ModelCapability, mode: GenerationMode = 'LOCAL_ONLY'): RankedModel[] {
    const hw = this.hardware.profile();
    return rankModelsForCapability(this.catalog.list(), capability, hw, {
      freeOnly: mode === 'FREE_ONLY' || mode === 'HYBRID_FREE',
      localOnly: mode === 'LOCAL_ONLY',
      preferInstalled: true,
    });
  }

  getCatalog(): ModelCatalogService {
    return this.catalog;
  }

  private async executeWithModel(
    ranked: RankedModel,
    request: GenerationRequest,
  ): Promise<GenerationResponse> {
    const { model } = ranked;
    const start = Date.now();

    if (TEXT_CAPABILITIES.includes(request.capability)) {
      const provider = this.resolveTextProvider(model);
      if (!provider) {
        throw this.fail('PROVIDER_OFFLINE', `No provider for model ${model.id}`);
      }

      const response = await provider.generateText({
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        jsonMode: request.jsonMode ?? request.capability === 'JSON_GENERATION',
      });

      return {
        result: response.text,
        modelId: model.id,
        provider: response.provider,
        capability: request.capability,
        durationMs: Date.now() - start,
        fallbackUsed: ranked.score < 50,
      };
    }

    if (request.capability === 'PROCEDURAL_SFX' || request.capability === 'SFX_GENERATION') {
      return {
        result: 'procedural',
        modelId: model.id,
        provider: model.provider,
        capability: request.capability,
        durationMs: Date.now() - start,
        fallbackUsed: false,
      };
    }

    throw this.fail('CAPABILITY_MISMATCH', `Capability ${request.capability} handler not yet wired`);
  }

  private resolveTextProvider(model: ModelEntry): TextGenerationProvider | null {
    if (model.provider === 'ollama') return this.providers.get('ollama') ?? null;
    return this.providers.get(model.provider) ?? null;
  }

  private fail(reason: GenerationFailureReason, message: string): Error {
    const err = new Error(message);
    (err as Error & { reason: GenerationFailureReason }).reason = reason;
    return err;
  }
}

export function createGenerationRouter(
  dataDir?: string,
  providers?: ProviderRegistry,
): GenerationRouter {
  return new GenerationRouter(dataDir, providers);
}

/** @deprecated Use GenerationRouter directly — kept for provider bootstrap wiring */
export function createFallbackManager(providers: ProviderRegistry): FallbackManager {
  return new FallbackManager(new CapabilityRouter(providers, new ModelRegistry()));
}
