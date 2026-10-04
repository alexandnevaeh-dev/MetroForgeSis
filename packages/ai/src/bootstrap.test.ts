import { describe, it, expect } from 'vitest';
import { bootstrapProviders } from './bootstrap.js';

// Real bootstrapProviders() call — no Ollama server needs to be running for these assertions;
// OllamaProvider.checkHealth() gracefully degrades to 'unavailable' on a failed fetch rather
// than throwing (see providers/ollama.ts), so the model registry still loads correctly either
// way. What these tests prove is specifically the canonical-catalog reconciliation added this
// pass (packages/ai/src/bootstrap.ts's reconcileModelCatalog()) — previously ModelRegistry
// loaded a separate, smaller config/models.default.json that had zero NVIDIA entries at all,
// so no amount of configuring NVIDIA_API_KEY could ever make an NVIDIA model reachable via
// live routing (see docs/METROFORGE_CURRENT_BUILD.md §9).
describe('bootstrapProviders — canonical model catalog reconciliation', () => {
  it('registers key-free LM Studio with saved loopback settings and respects local-only routes', async () => {
    const { registry, router } = await bootstrapProviders({
      mode: 'LOCAL_ONLY', ollamaBaseUrl: 'http://127.0.0.1:11434', skipHealthChecks: true,
      providerEnabled: { ollama: false },
      connectionSettings: { 'app.lmstudio.baseUrl': 'http://127.0.0.1:1234/v1', 'app.lmstudio.model': 'fixture-chat' },
      togetherApiKey: 'fixture-key',
    });
    expect(registry.get('lmstudio')?.enabled).toBe(true);
    expect(registry.get('lmstudio')?.costClass).toBe('free');
    expect(registry.get('together')).toBeUndefined();
    expect(router.getCandidates({ task: 'plan', capability: 'json_generation', freeOnly: true, localOnly: true, qualityTarget: 'balanced' }).map(p => p.id)).toEqual(['lmstudio']);
  });
  it('routes enabled hosted chat providers while excluding disabled or paid providers from free routes', async () => {
    const { registry, router } = await bootstrapProviders({
      mode: 'BALANCED', ollamaBaseUrl: 'http://127.0.0.1:11434', skipHealthChecks: true,
      providerEnabled: { ollama: false, lmstudio: false, cerebras: false },
      togetherApiKey: 'fixture-key', cerebrasApiKey: 'fixture-key', mistralApiKey: 'fixture-key',
    });
    expect(registry.get('cerebras')?.enabled).toBe(false);
    const context = { task: 'plan', capability: 'json_generation' as const, freeOnly: false, localOnly: false, qualityTarget: 'balanced' as const };
    expect(router.getCandidates(context).map(p => p.id)).toEqual(['together', 'mistral']);
    expect(router.getCandidates({ ...context, freeOnly: true })).toEqual([]);
  });
  it('NVIDIA catalog models are NOT reachable via ModelRegistry when no key is configured', async () => {
    const { models } = await bootstrapProviders({
      mode: 'LOCAL_ONLY',
      ollamaBaseUrl: 'http://localhost:11434',
      skipHealthChecks: true,
    });
    const nvidiaModels = models.list().filter((m) => m.provider === 'nvidia');
    // The catalog entries still parse and map correctly...
    expect(nvidiaModels.length).toBeGreaterThan(0);
    // ...but none are enabled, since the nvidia provider itself was never registered
    // (no mode gate opened it, and no key was supplied even if it had been).
    expect(nvidiaModels.every((m) => !m.enabled)).toBe(true);
    expect(models.findByCapability('json_generation').some((m) => m.provider === 'nvidia')).toBe(
      false,
    );
  });

  it('NVIDIA catalog models become reachable via ModelRegistry once a key is configured', async () => {
    const { models, registry } = await bootstrapProviders({
      mode: 'HYBRID_FREE',
      ollamaBaseUrl: 'http://localhost:11434',
      nvidiaApiKey: 'nvapi-test-fake-key-for-bootstrap-test-only',
      skipHealthChecks: true,
    });

    expect(registry.get('nvidia')?.enabled).toBe(true);

    const nvidiaModels = models.list().filter((m) => m.provider === 'nvidia');
    expect(nvidiaModels.length).toBeGreaterThan(0);
    expect(nvidiaModels.some((m) => m.enabled)).toBe(true);

    // The specific, live-verified NVIDIA model ids from config/models.catalog.json must be
    // present — not just "some nvidia entry," to catch a future catalog edit silently dropping
    // one of them.
    const ids = nvidiaModels.map((m) => m.id);
    expect(ids).toContain('meta/llama-3.1-8b-instruct');
    expect(ids).toContain('nvidia/llama-3.1-nemotron-70b-instruct');

    // And they must actually be selectable through the real capability-routing path a
    // generation request would use, not just present in the raw list.
    const jsonCandidates = models.findByCapability('json_generation');
    expect(jsonCandidates.some((m) => m.provider === 'nvidia')).toBe(true);
  });

  it('Ollama models are always present and marked local regardless of mode', async () => {
    const { models } = await bootstrapProviders({
      mode: 'LOCAL_ONLY',
      ollamaBaseUrl: 'http://localhost:11434',
      skipHealthChecks: true,
    });
    const ollamaModels = models.list().filter((m) => m.provider === 'ollama');
    expect(ollamaModels.length).toBeGreaterThan(0);
    expect(ollamaModels.every((m) => m.local)).toBe(true);
  });

  it('image/audio/vision-only catalog entries are excluded from the text-generation registry', async () => {
    const { models } = await bootstrapProviders({
      mode: 'LOCAL_ONLY',
      ollamaBaseUrl: 'http://localhost:11434',
      skipHealthChecks: true,
    });
    // sdxl-turbo etc. are image-generation models with no text-generation capability mapping —
    // they must not leak into ModelRegistry (which packages/assets' separate
    // ImageProviderRegistry, not this one, is responsible for).
    const ids = models.list().map((m) => m.id);
    expect(ids).not.toContain('sdxl-turbo');
    expect(ids).not.toContain('whisper-base');
  });

  it('keeps the canonical diffusion model family in the catalog for image routing', async () => {
    const { catalog } = await bootstrapProviders({
      mode: 'LOCAL_ONLY',
      ollamaBaseUrl: 'http://localhost:11434',
      skipHealthChecks: true,
    });

    const imageIds = catalog.list().filter((m) => m.modality === 'image').map((m) => m.id);
    expect(imageIds).toContain('sdxl-base-1.0');
    expect(imageIds).toContain('sdxl-lightning');
    expect(imageIds).toContain('sdxl-turbo');
    expect(imageIds).toContain('sd-1.5');
  });
});
