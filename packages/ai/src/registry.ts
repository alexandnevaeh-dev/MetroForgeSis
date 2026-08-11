import type { ModelMetadata, RoutingContext, TextGenerationProvider } from './types.js';

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

export class CapabilityRouter {
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
        if (context.localOnly && !p.local) return false;
        if (context.freeOnly && p.costClass !== 'free') return false;
        return p.capabilities.includes(context.capability);
      })
      .sort((a, b) => b.priority - a.priority);
  }

  getModelCandidates(context: RoutingContext): ModelMetadata[] {
    let models = this.models.findByCapability(context.capability);
    if (context.localOnly) models = models.filter((m) => m.local);
    if (context.freeOnly) models = models.filter((m) => m.costClass === 'free');
    return models;
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
