import type { ModelCapability, GenerationFailureReason } from '@metroforge/schemas';
import type { GenerationMode } from '@metroforge/shared';
import { CapabilityRouter, FallbackManager } from './registry.js';
import type { AICapability } from './types.js';
import { buildTextRoutingContext } from './mode-routing.js';

export interface GenerationRequest {
  capability: ModelCapability;
  /** Human-readable task label for logging/routing context (e.g. "game_dna"). Falls back
   *  to `capability` itself when omitted. */
  task?: string;
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

/**
 * Maps the richer catalog-level `ModelCapability` enum (used by asset/model metadata) down
 * to the smaller `AICapability` bucket `CapabilityRouter` actually routes text requests on.
 * Several `ModelCapability` values legitimately collapse to the same bucket — e.g.
 * REASONING/WORLD_DESIGN/QA_REASONING are all fundamentally "ask a text-generation model,"
 * just with different intended use at the call site, not different provider requirements.
 * Capabilities with no entry here (image/audio/vision/etc.) are not yet routed through this
 * facade — `AssetPipeline` still calls its providers directly (see
 * docs/METROFORGE_CURRENT_BUILD.md §8 for why, and docs/PROVIDERS.md for current status).
 */
// Exported so bootstrap.ts can apply the exact same rich-catalog -> AICapability mapping when
// reconciling config/models.catalog.json into the live ModelRegistry — one mapping table, not
// a second copy that could drift.
export const CAPABILITY_TO_AI_CAPABILITY: Partial<Record<ModelCapability, AICapability>> = {
  TEXT_GENERATION: 'text_generation',
  REASONING: 'text_generation',
  NARRATIVE: 'narrative',
  JSON_GENERATION: 'json_generation',
  WORLD_DESIGN: 'text_generation',
  QA_REASONING: 'text_generation',
  CODE_GENERATION: 'code_generation',
  GDSCRIPT: 'code_generation',
  TYPESCRIPT: 'code_generation',
  PYTHON: 'code_generation',
  SHADER_CODE: 'code_generation',
  CODE_REPAIR: 'code_generation',
  CLASSIFICATION: 'text_generation',
  TAGGING: 'text_generation',
  METADATA: 'text_generation',
  ROUTING: 'text_generation',
};

/**
 * The single canonical, model-agnostic entry point for capability-based generation.
 * Application code should request a CAPABILITY here rather than importing and calling a
 * specific provider directly (see docs/METROFORGE_CURRENT_BUILD.md §31 for the history of
 * why this matters — this class previously existed in parallel with `CapabilityRouter` and
 * `FallbackManager`, fully built but never actually called by the generation pipeline).
 *
 * Deliberately a thin facade, not a reimplementation: candidate ranking and retry/fallback
 * behavior are delegated entirely to the already-proven `CapabilityRouter`/`FallbackManager`
 * pair (the same instances `bootstrapProviders()` already constructs from the live
 * `ProviderRegistry`), not reconstructed from `ModelCatalogService` data as the previous
 * version did. That distinction is what was actually broken before: catalog entries for
 * hosted providers default to `enabled: false` and nothing flips that flag based on live API
 * key presence, so a catalog-driven ranker could never route to Gemini/Groq/NVIDIA/etc. even
 * with a real key configured — only `CapabilityRouter`, which reads the live, correctly
 * key-gated `ProviderRegistry`, ever could.
 */
export class GenerationRouter {
  constructor(
    private readonly router: CapabilityRouter,
    private readonly fallback: FallbackManager,
  ) {}

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const aiCapability = CAPABILITY_TO_AI_CAPABILITY[request.capability];
    if (!aiCapability) {
      throw this.fail(
        'CAPABILITY_MISMATCH',
        `Capability ${request.capability} is not yet routed through GenerationRouter (no text-provider mapping — see CAPABILITY_TO_AI_CAPABILITY)`,
      );
    }

    const mode = request.mode ?? 'LOCAL_ONLY';
    const routingContext = buildTextRoutingContext(
      mode,
      {
        task: request.task ?? request.capability,
        capability: aiCapability,
      },
      request.qualityTarget ? { qualityTarget: request.qualityTarget } : undefined,
    );

    if (this.router.getCandidates(routingContext).length === 0) {
      throw this.fail(
        'CAPABILITY_MISMATCH',
        `No enabled provider supports ${aiCapability} under mode ${mode}`,
      );
    }

    const start = Date.now();
    try {
      const response = await this.fallback.withFallback(routingContext, (provider) =>
        provider.generateText({
          prompt: request.prompt,
          systemPrompt: request.systemPrompt,
          jsonMode: request.jsonMode ?? request.capability === 'JSON_GENERATION',
        }),
      );
      return {
        result: response.text,
        modelId: response.model,
        provider: response.provider,
        capability: request.capability,
        durationMs: Date.now() - start,
        // FallbackManager does not currently report which candidate attempt succeeded, and
        // no caller reads this field today — left honestly false rather than guessed, and
        // worth extending FallbackManager for (not duplicating here) if a caller ever needs it.
        fallbackUsed: false,
      };
    } catch (err) {
      throw this.fail('GENERATION_FAILED', err instanceof Error ? err.message : String(err));
    }
  }

  private fail(reason: GenerationFailureReason, message: string): Error {
    const err = new Error(message);
    (err as Error & { reason: GenerationFailureReason }).reason = reason;
    return err;
  }
}

export function createGenerationRouter(
  router: CapabilityRouter,
  fallback: FallbackManager,
): GenerationRouter {
  return new GenerationRouter(router, fallback);
}
