import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GenerationMode } from '@metroforge/shared';
import { isProviderUserEnabled, textConnectionValue } from '@metroforge/shared/provider-toggles';
import { ProviderRegistry, ModelRegistry, CapabilityRouter, FallbackManager } from './registry.js';
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
import { CompatibleChatProvider } from './providers/compatible-chat.js';

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
  /** Catalog and user model state for this app session. */
  dataDir?: string;
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
  /** Avoid live provider probes in deterministic tests and offline planning. */
  skipHealthChecks?: boolean;
  connectionSettings?: Record<string, string>;
  togetherApiKey?: string;
  cerebrasApiKey?: string;
  mistralApiKey?: string;
  lmstudioApiKey?: string;
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
  const connection = (key: string) =>
    textConnectionValue(key, config.connectionSettings, process.env);

  const ollama = new OllamaProvider({
    baseUrl: config.connectionSettings?.['app.ollama.baseUrl']?.trim() || config.ollamaBaseUrl,
    defaultModel:
      config.connectionSettings?.['app.ollama.model']?.trim() ||
      config.ollamaDefaultModel ||
      connection('app.ollama.model'),
    enabled: (providerDefaults.ollama?.enabled ?? true) && userEnabled('ollama'),
    priority: providerDefaults.ollama?.priority,
  });
  if (config.skipHealthChecks) ollama.health = 'degraded';
  else if (!ollama.enabled) ollama.health = 'unavailable';
  else await ollama.initialize();
  registry.register(ollama);

  const lmstudio = new CompatibleChatProvider({
    id: 'lmstudio',
    name: 'LM Studio',
    local: true,
    baseUrl: connection('app.lmstudio.baseUrl'),
    model: connection('app.lmstudio.model'),
    apiKey: config.lmstudioApiKey ?? process.env.LMSTUDIO_API_KEY,
    enabled: userEnabled('lmstudio'),
    license: 'Model-dependent; review the loaded model license',
  });
  if (config.skipHealthChecks) lmstudio.health = 'degraded';
  else await lmstudio.initialize();
  registry.register(lmstudio);

  if (modeRegistersHostedProviders(config.mode)) {
    const hosted = [
      new CompatibleChatProvider({
        id: 'together',
        name: 'Together AI',
        baseUrl: 'https://api.together.ai/v1',
        model: connection('app.together.model'),
        apiKey: config.togetherApiKey ?? process.env.TOGETHER_API_KEY,
        enabled: userEnabled('together'),
        license: 'Together AI terms and model-dependent license',
      }),
      new CompatibleChatProvider({
        id: 'cerebras',
        name: 'Cerebras',
        baseUrl: 'https://api.cerebras.ai/v1',
        model: connection('app.cerebras.model'),
        apiKey: config.cerebrasApiKey ?? process.env.CEREBRAS_API_KEY,
        enabled: userEnabled('cerebras'),
        license: 'Cerebras terms and model-dependent license',
      }),
      new CompatibleChatProvider({
        id: 'mistral',
        name: 'Mistral AI',
        baseUrl: 'https://api.mistral.ai/v1',
        model: connection('app.mistral.model'),
        apiKey: config.mistralApiKey ?? process.env.MISTRAL_API_KEY,
        enabled: userEnabled('mistral'),
        license: 'Mistral AI terms and model-dependent license',
      }),
      new GeminiProvider({
        apiKey: config.geminiApiKey,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        defaultModel: process.env.GEMINI_DEFAULT_MODEL || 'gemini-flash-latest',
        enabled: !!config.geminiApiKey && userEnabled('gemini'),
        priority: providerDefaults.gemini?.priority,
      }),
      new GroqProvider({
        apiKey: config.groqApiKey,
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: process.env.GROQ_DEFAULT_MODEL || 'openai/gpt-oss-20b',
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
        defaultModel: process.env.NVIDIA_DEFAULT_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b',
        enabled: !!config.nvidiaApiKey && userEnabled('nvidia'),
        priority: providerDefaults.nvidia?.priority,
      }),
    ];

    const toRegister =
      config.mode === 'NVIDIA_ONLY'
        ? hosted.filter((provider) => provider.id === 'nvidia')
        : hosted;

    for (const provider of toRegister) {
      if (config.skipHealthChecks) provider.health = 'degraded';
      else await provider.initialize();
      // Register even when user-disabled so list-providers can show enabled:false.
      registry.register(provider);
    }
  }

  const catalog = new ModelCatalogService(config.dataDir);
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
