import type { GenerationMode } from '@metroforge/shared';
import type {
  ImageGenerator,
  ImageProviderHealthReport,
  ImageProviderHealthStatus,
} from './types/image-gen.js';
import { healthReportIsSelectable, resolveImageProviderHealth } from './types/image-gen.js';

export interface ImageProviderRegistration {
  provider: ImageGenerator;
  /** True for anything that runs on the local machine with no network dependency
   *  (ComfyUI/Diffusers today). A future hosted image provider would register `false`. */
  local: boolean;
  priority: number;
}

export interface ImageRoutingContext {
  mode?: GenerationMode;
  /** When LOW_RESOURCE, prefer remote/hosted providers (local VRAM is insufficient). */
  hardwareProfile?: 'LOW_RESOURCE' | 'BALANCED' | 'HIGH_QUALITY' | string;
}

export interface ImageSelectionResult {
  generator: ImageGenerator | null;
  warnings: string[];
  /** Providers probed before the selected one (or all, when falling back to procedural). */
  fallbackDepth: number;
  fallbackReason?: string;
  selectedProvider?: string;
  healthByProvider: Record<string, ImageProviderHealthReport>;
}

/** Routing Inspector–compatible explanation for IMAGE_GENERATION (image providers, not text LLMs). */
export interface ImageRoutingExplanation {
  capability: string;
  requirements: string[];
  selected?: { modelId: string; provider: string; score: number; workflow?: string };
  candidates: Array<{ modelId: string; provider: string; score: number; reasons: string[] }>;
  rejected: Array<{ modelId: string; provider: string; reasons: string[] }>;
  fallbacks: Array<{ modelId: string; provider: string }>;
  license?: string;
  hardware?: { profile: string; ramMb: number; vramMb?: number; note?: string };
  /** True when no image provider was healthy and procedural placeholder would be used. */
  degradedFallback?: boolean;
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
   *  provider. Remote providers are never filtered by local VRAM. On LOW_RESOURCE hardware,
   *  remote/hosted candidates sort ahead of local runtimes so ~1GB iGPU machines prefer NVIDIA. */
  getCandidates(context: ImageRoutingContext = {}): ImageProviderRegistration[] {
    const localOnly = context.mode === 'LOCAL_ONLY';
    const preferRemote = context.hardwareProfile === 'LOW_RESOURCE';
    return this.registrations
      .filter((r) => !localOnly || r.local)
      .sort((a, b) => {
        if (preferRemote && a.local !== b.local) {
          return a.local ? 1 : -1;
        }
        return b.priority - a.priority;
      });
  }

  /** Health-checks candidates in priority order, returning the first reachable one.
   *  Returns `generator: null` (with warnings explaining why) if none are reachable —
   *  the caller is expected to fall back to procedural generation, which always works. */
  async selectHealthy(context: ImageRoutingContext = {}): Promise<ImageSelectionResult> {
    const warnings: string[] = [];
    const healthByProvider: Record<string, ImageProviderHealthReport> = {};
    let fallbackDepth = 0;
    const candidates = this.getCandidates(context);

    for (const candidate of candidates) {
      const report = await resolveImageProviderHealth(candidate.provider);
      healthByProvider[candidate.provider.id] = report;
      if (healthReportIsSelectable(report)) {
        return {
          generator: candidate.provider,
          warnings,
          fallbackDepth,
          fallbackReason: fallbackDepth > 0 ? warnings.join('; ') : undefined,
          selectedProvider: candidate.provider.id,
          healthByProvider,
        };
      }
      warnings.push(`${candidate.provider.id}: ${report.reason} [${report.status}]`);
      fallbackDepth += 1;
    }

    return {
      generator: null,
      warnings,
      fallbackDepth,
      fallbackReason:
        warnings.length > 0
          ? `All image providers failed — procedural placeholder will be used (${warnings.join('; ')})`
          : 'No image providers registered — procedural placeholder will be used',
      healthByProvider,
    };
  }
}

/**
 * Explain image-provider routing for Routing Inspector. Catalog IMAGE models are reconciled
 * separately in the desktop handler; this covers live ImageProviderRegistry candidates with
 * accept/reject reasons (capability, locality, provider health). Hardware VRAM is N/A for remote.
 */
export async function explainImageProviderRouting(
  registry: ImageProviderRegistry,
  context: ImageRoutingContext & {
    hardware?: { profile: string; ramMb: number; vramMb?: number };
  } = {},
): Promise<ImageRoutingExplanation> {
  const routingContext: ImageRoutingContext = {
    mode: context.mode,
    hardwareProfile: context.hardware?.profile ?? context.hardwareProfile,
  };
  const candidatesList = registry.getCandidates(routingContext);
  const candidates: ImageRoutingExplanation['candidates'] = [];
  const rejected: ImageRoutingExplanation['rejected'] = [];

  for (const reg of candidatesList) {
    const report = await resolveImageProviderHealth(reg.provider);
    const preferRemote = context.mode !== 'LOCAL_ONLY' && context.hardware?.profile === 'LOW_RESOURCE';
    const reasons = [
      `capability: IMAGE_GENERATION`,
      reg.local ? 'local runtime' : 'remote/hosted (local VRAM N/A)',
      `priority ${reg.priority}`,
      preferRemote && !reg.local ? 'LOW_RESOURCE prefers remote' : preferRemote && reg.local ? 'LOW_RESOURCE demotes local VRAM runtimes' : 'hardware locality OK',
      `health: ${report.status} — ${report.reason}`,
    ];
    if (healthReportIsSelectable(report)) {
      const remoteBoost = preferRemote && !reg.local ? 20 : 0;
      candidates.push({
        modelId: reg.provider.id,
        provider: reg.provider.id,
        score: reg.priority + (report.status === 'HEALTHY' ? 10 : 0) + remoteBoost,
        reasons,
      });
    } else {
      rejected.push({
        modelId: reg.provider.id,
        provider: reg.provider.id,
        reasons,
      });
    }
  }

  // Mode exclusions (registered but filtered out)
  if (context.mode === 'LOCAL_ONLY') {
    for (const reg of registry.getCandidates({})) {
      if (!reg.local) {
        rejected.push({
          modelId: reg.provider.id,
          provider: reg.provider.id,
          reasons: ['not a local provider (LOCAL_ONLY mode)', 'local VRAM N/A for remote'],
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];

  return {
    capability: 'IMAGE_GENERATION',
    requirements: [
      'capability: IMAGE_GENERATION',
      'image provider registered',
      'provider health HEALTHY or DEGRADED',
      'hardware VRAM applies only to local image runtimes',
    ],
    selected: top
      ? { modelId: top.modelId, provider: top.provider, score: top.score, workflow: 'image-provider' }
      : undefined,
    candidates,
    rejected,
    fallbacks: candidates.slice(1, 4).map((c) => ({ modelId: c.modelId, provider: c.provider })),
    hardware: context.hardware
      ? {
          ...context.hardware,
          note: 'Local VRAM filters apply only to local image models; remote/NVIDIA are never rejected for low local VRAM',
        }
      : undefined,
    degradedFallback: !top,
  };
}

export function statusToLegacyHealth(status: ImageProviderHealthStatus): string {
  switch (status) {
    case 'HEALTHY':
      return 'healthy';
    case 'DEGRADED':
      return 'degraded';
    case 'AUTH_FAILED':
    case 'RATE_LIMITED':
    case 'MISCONFIGURED':
    case 'UNAVAILABLE':
    case 'NETWORK_ERROR':
    case 'MODEL_UNAVAILABLE':
      return 'unavailable';
    default:
      return 'unknown';
  }
}
