import type { ModelMetadata, ProviderHealth, RoutingContext, TextGenerationProvider } from './types.js';
import { LicenseRouter, type LicenseSubject } from './license-router.js';

/** Ranks candidates healthy-first. Live route eligibility excludes OFFLINE / unavailable
 *  providers so they cannot win (FallbackManager then only retries providers that passed
 *  health gating). DEGRADED remains eligible but ranks below HEALTHY. Disabled providers
 *  are already dropped by listEnabled(). */
const HEALTH_TIER: Record<ProviderHealth, number> = { healthy: 2, degraded: 1, unavailable: 0 };
const COST_TIER: Record<'free' | 'low' | 'medium' | 'high', number> = {
  free: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/** True when a provider may be selected as the live route winner / FallbackManager candidate. */
export function isProviderLiveRouteEligible(health: ProviderHealth, enabled = true): boolean {
  if (!enabled) return false;
  return health === 'healthy' || health === 'degraded';
}

export class ProviderRegistry {
  private providers = new Map<string, TextGenerationProvider>();

  register(provider: TextGenerationProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): TextGenerationProvider | undefined {
    return this.providers.get(id);
  }

  list(): TextGenerationProvider[] {
    return Array.from(this.providers.values());
  }

  listEnabled(): TextGenerationProvider[] {
    return this.list().filter((p) => p.enabled);
  }
}

export class ModelRegistry {
  private models: ModelMetadata[] = [];

  load(models: ModelMetadata[]): void {
    this.models = models;
  }

  list(): ModelMetadata[] {
    return this.models;
  }

  findByCapability(capability: string): ModelMetadata[] {
    return this.models
      .filter((m) => m.enabled && m.capabilities.includes(capability as ModelMetadata['capabilities'][number]))
      .sort((a, b) => b.priority - a.priority);
  }
}

/** speed/quality -> numeric score used to break ties within a priority tier by qualityTarget.
 *  Deliberately a small tiebreaker, not a primary sort key — author-curated `priority` still
 *  dominates candidate ordering; this only nudges among otherwise-equal-priority candidates. */
const SPEED_SCORE: Record<'fast' | 'medium' | 'slow', number> = { fast: 3, medium: 2, slow: 1 };
const QUALITY_SCORE: Record<'low' | 'medium' | 'high', number> = { low: 1, medium: 2, high: 3 };

function qualityTargetScore(
  speed: 'fast' | 'medium' | 'slow' | undefined,
  quality: 'low' | 'medium' | 'high' | undefined,
  target: 'fast' | 'balanced' | 'quality',
): number {
  const s = SPEED_SCORE[speed ?? 'medium'];
  const q = QUALITY_SCORE[quality ?? 'medium'];
  if (target === 'fast') return s * 2 + q;
  if (target === 'quality') return q * 2 + s;
  return s + q;
}

/** A provider/model's undeclared `commercialUse` (undefined) is distinct from a catalog entry
 *  explicitly marked 'unknown': undefined means "not evaluated at this granularity," so
 *  COMMERCIAL_SAFE filtering skips (does not reject) it here, deferring to whichever other
 *  granularity did record a real value. An explicit 'unknown' IS rejected via LicenseRouter's
 *  hard rule, same as everywhere else in the codebase. */
function passesCommercialSafe(licenseRouter: LicenseRouter, subject: Partial<LicenseSubject>): boolean {
  if (subject.commercialUse === undefined) return true;
  return licenseRouter.isCommercialSafe(subject as LicenseSubject);
}

export class CapabilityRouter {
  private readonly licenseRouter = new LicenseRouter();

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly models: ModelRegistry,
  ) {}

  route(context: RoutingContext): TextGenerationProvider | null {
    return this.getCandidates(context)[0] ?? null;
  }

  getCandidates(context: RoutingContext): TextGenerationProvider[] {
    return this.providers
      .listEnabled()
      .filter((p) => {
        if (!isProviderLiveRouteEligible(p.health, p.enabled)) return false;
        if ((context.localOnly || context.offline) && !p.local) return false;
        if (context.freeOnly && p.costClass !== 'free') return false;
        if (context.nvidiaOnly && p.id !== 'nvidia') return false;
        if (context.commercialSafeOnly && !passesCommercialSafe(this.licenseRouter, p)) return false;
        return p.capabilities.includes(context.capability);
      })
      .sort((a, b) => {
        if (context.lowestCost) {
          const costDiff = COST_TIER[a.costClass] - COST_TIER[b.costClass];
          if (costDiff !== 0) return costDiff;
        }
        const healthDiff = HEALTH_TIER[b.health] - HEALTH_TIER[a.health];
        return healthDiff !== 0 ? healthDiff : b.priority - a.priority;
      });
  }

  getModelCandidates(context: RoutingContext): ModelMetadata[] {
    let models = this.models.findByCapability(context.capability);
    if (context.localOnly || context.offline) models = models.filter((m) => m.local);
    if (context.freeOnly) models = models.filter((m) => m.costClass === 'free');
    if (context.nvidiaOnly) models = models.filter((m) => m.provider === 'nvidia');
    if (context.commercialSafeOnly) {
      models = models.filter((m) => passesCommercialSafe(this.licenseRouter, m));
    }
    // Local VRAM budget applies only to local runtimes — hosted/remote models are not blocked by GPU room.
    if (context.maxVramMb !== undefined) {
      models = models.filter(
        (m) => !m.local || m.minVramMb === undefined || m.minVramMb <= context.maxVramMb!,
      );
    }
    return [...models].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (
        qualityTargetScore(b.estimatedSpeed, b.estimatedQuality, context.qualityTarget) -
        qualityTargetScore(a.estimatedSpeed, a.estimatedQuality, context.qualityTarget)
      );
    });
  }
}

export class FallbackManager {
  constructor(private readonly router: CapabilityRouter) {}

  async withFallback<T>(
    context: RoutingContext,
    fn: (provider: TextGenerationProvider) => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    const providers = this.router.getCandidates(context);

    let lastError: Error | null = null;
    for (let i = 0; i < Math.min(maxAttempts, providers.length); i++) {
      const provider = providers[i]!;
      try {
        return await fn(provider);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError ?? new Error('No providers available');
  }
}
