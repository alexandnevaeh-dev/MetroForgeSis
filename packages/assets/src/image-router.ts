import type { GenerationMode } from '@metroforge/shared';
import type { ImageGenerator } from './types/image-gen.js';

export interface ImageProviderRegistration {
  provider: ImageGenerator;
  /** True for anything that runs on the local machine with no network dependency
   *  (ComfyUI/Diffusers today). A future hosted image provider would register `false`. */
  local: boolean;
  priority: number;
}

export interface ImageRoutingContext {
  mode?: GenerationMode;
}

export interface ImageSelectionResult {
  generator: ImageGenerator | null;
  warnings: string[];
}

/**
 * Capability-based routing for image generation, so `AssetPipeline` requests "give me the
 * best available image provider" instead of hardcoding "try ComfyUI, then try Diffusers."
 * Mirrors `CapabilityRouter`'s text-routing algorithm exactly (filter candidates by mode
 * constraint, sort by priority, health-check in order) — see
 * `packages/ai/src/registry.ts CapabilityRouter.getCandidates()`. Deliberately package-local
 * rather than importing `@metroforge/ai`'s routing primitives: `@metroforge/assets` has never
 * depended on `@metroforge/ai`, and the amount of shared logic (a filter + a sort) doesn't
 * justify a new cross-package coupling — the *rule* is kept identical, not reimplemented
 * differently, which is what actually matters for "one canonical routing policy."
 *
 * The procedural fallback in `AssetPipeline` is NOT registered here — it's not a routable
 * candidate that can fail a health check, it's the unconditional last resort the pipeline
 * already falls back to whenever `selectHealthy()` returns `generator: null`.
 */
export class ImageProviderRegistry {
  private registrations: ImageProviderRegistration[] = [];

  register(registration: ImageProviderRegistration): void {
    this.registrations.push(registration);
  }

  /** Candidates in priority order, filtered by mode. LOCAL_ONLY excludes any non-local
   *  provider — today that's a no-op (ComfyUI/Diffusers are both local), but it's real,
   *  enforced routing policy the moment a hosted image provider is registered. */
  getCandidates(context: ImageRoutingContext = {}): ImageProviderRegistration[] {
    const localOnly = context.mode === 'LOCAL_ONLY';
    return this.registrations
      .filter((r) => !localOnly || r.local)
      .sort((a, b) => b.priority - a.priority);
  }

  /** Health-checks candidates in priority order, returning the first reachable one.
   *  Returns `generator: null` (with warnings explaining why) if none are reachable —
   *  the caller is expected to fall back to procedural generation, which always works. */
  async selectHealthy(context: ImageRoutingContext = {}): Promise<ImageSelectionResult> {
    const warnings: string[] = [];
    for (const candidate of this.getCandidates(context)) {
      if (await candidate.provider.checkHealth()) {
        return { generator: candidate.provider, warnings };
      }
      warnings.push(`${candidate.provider.id} unavailable`);
    }
    return { generator: null, warnings };
  }
}
