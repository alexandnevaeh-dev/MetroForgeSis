import type {
  AICapability,
  ProviderHealth,
  TextGenerationProvider,
  TextGenerationRequest,
  TextGenerationResponse,
} from '../types.js';

export interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
  enabled?: boolean;
  priority?: number;
}

const DEFAULT_MODELS = [
  'qwen3-coder-next',
  'qwen3-coder:30b',
  'qwen3:8b',
  'qwen2.5-coder:7b',
  'llama3.2',
];

export class OllamaProvider implements TextGenerationProvider {
  id = 'ollama';
  name = 'Ollama';
  local = true;
  enabled: boolean;
  costClass = 'free' as const;
  license = 'Model-dependent (see Ollama model cards)';
  capabilities: AICapability[] = [
    'text_generation',
    'code_generation',
    'json_generation',
    'narrative',
  ];
  health: ProviderHealth = 'unavailable';
  priority = 100;

  private availableModels: string[] = [];

  constructor(private readonly config: OllamaConfig) {
    this.enabled = config.enabled ?? true;
    this.priority = config.priority ?? this.priority;
  }

  async initialize(): Promise<void> {
    this.health = await this.checkHealth();
    if (this.health !== 'unavailable') {
      this.availableModels = await this.listModels();
    }
  }

  async checkHealth(): Promise<ProviderHealth> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? 'healthy' : 'degraded';
    } catch {
      return 'unavailable';
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: { name: string }[] };
      return (data.models ?? []).map((m) => m.name);
    } catch {
      return [];
    }
  }

  selectModel(): string {
    if (this.availableModels.includes(this.config.defaultModel)) {
      return this.config.defaultModel;
    }
    for (const candidate of DEFAULT_MODELS) {
      const match = this.availableModels.find(
        (m) => m === candidate || m.startsWith(`${candidate}:`),
      );
      if (match) return match;
    }
    return this.availableModels[0] ?? this.config.defaultModel;
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    const model = this.selectModel();
    const start = Date.now();

    const body = {
      model,
      prompt: request.systemPrompt ? `${request.systemPrompt}\n\n${request.prompt}` : request.prompt,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens ?? 4096,
      },
      format: request.jsonMode ? 'json' : undefined,
    };

    const res = await fetch(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { response: string; eval_count?: number };
    return {
      text: data.response,
      model,
      provider: this.id,
      durationMs: Date.now() - start,
      tokensUsed: data.eval_count,
    };
  }
}
