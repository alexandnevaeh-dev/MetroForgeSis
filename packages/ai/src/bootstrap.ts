import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GenerationMode } from '@metroforge/shared';
import { isProviderUserEnabled } from '@metroforge/shared';
import {
  ProviderRegistry,
  ModelRegistry,
  CapabilityRouter,
  FallbackManager,
} from './registry.js';
import { ModelCatalogService } from './model-catalog.js';
import { createGenerationRouter, type GenerationRouter } from './generation-router.js';
import { reconcileModelCatalog } from './catalog-reconciliation.js';
import { modeRegistersHostedProviders } from './mode-routing.js';
import { OllamaProvider } from './providers/ollama.js';
import { GeminiProvider } from './providers/gemini.js';
import { GroqProvider } from './providers/groq.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { HuggingFaceProvider } from './providers/huggingface.js';
import { NvidiaProvider } from './providers/nvidia.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const PROVIDERS_CONFIG = join(REPO_ROOT, 'config', 'providers.default.json');

interface ProviderDefaultsEntry {
  id: string;
  enabled: boolean;
  priority: number;
  license: string;
}

function loadProviderDefaults(): Record<string, ProviderDefaultsEntry> {
  if (!existsSync(PROVIDERS_CONFIG)) return {};
  const raw = JSON.parse(readFileSync(PROVIDERS_CONFIG, 'utf-8')) as {
    providers: ProviderDefaultsEntry[];
  };
  return Object.fromEntries(raw.providers.map((p) => [p.id, p]));
}

export interface ProviderBootstrapConfig {
  mode: GenerationMode;
  ollamaBaseUrl: string;
  ollamaDefaultModel?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  openrouterApiKey?: string;
  huggingfaceApiKey?: string;
  nvidiaApiKey?: string;
  nvidiaApiBaseUrl?: string;
  /** Per-provider user toggles from app settings (missing ⇒ enabled). */
  providerEnabled?: Record<string, boolean>;
}

export interface ProviderBootstrapResult {
  registry: ProviderRegistry;
  models: ModelRegistry;
  catalog: ModelCatalogService;
  router: CapabilityRouter;
  fallback: FallbackManager;
  generationRouter: GenerationRouter;
}

export async function bootstrapProviders(
  config: ProviderBootstrapConfig,
): Promise<ProviderBootstrapResult> {
  const registry = new ProviderRegistry();
  const models = new ModelRegistry();
  const providerDefaults = loadProviderDefaults();
  const userEnabled = (id: string) => isProviderUserEnabled(config.providerEnabled, id);

  const ollama = new OllamaProvider({
    baseUrl: config.ollamaBaseUrl,
    defaultModel: config.ollamaDefaultModel ?? 'qwen3-coder-next',
    enabled: (providerDefaults.ollama?.enabled ?? true) && userEnabled('ollama'),
    priority: providerDefaults.ollama?.priority,
  });
  await ollama.initialize();
  registry.register(ollama);

  if (modeRegistersHostedProviders(config.mode)) {
    const hosted = [
      new GeminiProvider({
        apiKey: config.geminiApiKey,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        defaultModel: 'gemini-2.0-flash',
        enabled: !!config.geminiApiKey && userEnabled('gemini'),
        priority: providerDefaults.gemini?.priority,
      }),
      new GroqProvider({
        apiKey: config.groqApiKey,
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
        enabled: !!config.groqApiKey && userEnabled('groq'),
        priority: providerDefaults.groq?.priority,
      }),
      new OpenRouterProvider({
        apiKey: config.openrouterApiKey,
        baseUrl: 'https://openrouter.ai/api/v1',
        defaultModel: 'google/gemma-2-9b-it:free',
        enabled: !!config.openrouterApiKey && userEnabled('openrouter'),
        priority: providerDefaults.openrouter?.priority,
      }),
      new HuggingFaceProvider({
        apiKey: config.huggingfaceApiKey,
        baseUrl: 'https://api-inference.huggingface.co/models',
        defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
        enabled: !!config.huggingfaceApiKey && userEnabled('huggingface'),
        priority: providerDefaults.huggingface?.priority,
      }),
      new NvidiaProvider({
        apiKey: config.nvidiaApiKey,
        baseUrl: config.nvidiaApiBaseUrl || 'https://integrate.api.nvidia.com/v1',
        defaultModel: 'meta/llama-3.1-8b-instruct',
        enabled: !!config.nvidiaApiKey && userEnabled('nvidia'),
        priority: providerDefaults.nvidia?.priority,
      }),
    ];

    const toRegister =
      config.mode === 'NVIDIA_ONLY'
        ? hosted.filter((provider) => provider.id === 'nvidia')
        : hosted;

    for (const provider of toRegister) {
      await provider.initialize();
      // Register even when user-disabled so list-providers can show enabled:false.
      registry.register(provider);
    }
  }

  const catalog = new ModelCatalogService();
  models.load(reconcileModelCatalog(catalog, new Set(registry.listEnabled().map((p) => p.id))));

  const router = new CapabilityRouter(registry, models);
  const fallback = new FallbackManager(router);
  const generationRouter = createGenerationRouter(router, fallback);

  return { registry, models, catalog, router, fallback, generationRouter };
}

export function listProviderStatus(registry: ProviderRegistry) {
  return registry.list().map((p) => ({
    id: p.id,
    name: p.name,
    local: p.local,
    enabled: p.enabled,
    costClass: p.costClass,
    health: p.health,
    priority: p.priority,
    capabilities: p.capabilities,
    license: p.license,
  }));
}
