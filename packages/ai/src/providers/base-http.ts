import type {
  AICapability,
  ProviderHealth,
  TextGenerationProvider,
  TextGenerationRequest,
  TextGenerationResponse,
} from '../types.js';

export interface HttpProviderConfig {
  apiKey?: string;
  baseUrl: string;
  defaultModel: string;
  enabled?: boolean;
  priority?: number;
}

export abstract class BaseHttpTextProvider implements TextGenerationProvider {
  abstract id: string;
  abstract name: string;
  local = false;
  enabled: boolean;
  costClass = 'free' as const;
  abstract license: string;
  capabilities: AICapability[] = [
    'text_generation',
    'code_generation',
    'json_generation',
    'narrative',
  ];
  health: ProviderHealth = 'unavailable';
  priority: number;
  protected apiKey: string | undefined;

  constructor(protected readonly config: HttpProviderConfig) {
    this.enabled = (config.enabled ?? false) && !!config.apiKey;
    this.apiKey = config.apiKey;
    this.priority = config.priority ?? 50;
  }

  async initialize(): Promise<void> {
    this.health = await this.checkHealth();
  }

  async checkHealth(): Promise<ProviderHealth> {
    if (!this.apiKey) return 'unavailable';
    try {
      const models = await this.listModels();
      return models.length > 0 ? 'healthy' : 'degraded';
    } catch {
      return 'unavailable';
    }
  }

  abstract listModels(): Promise<string[]>;
  protected abstract buildRequest(
    model: string,
    request: TextGenerationRequest,
  ): { url: string; init: RequestInit };

  protected parseResponse(data: unknown): string {
    const d = data as Record<string, unknown>;
    if (typeof d.response === 'string') return d.response;
    const choices = d.choices as { message?: { content?: string } }[] | undefined;
    if (choices?.[0]?.message?.content) return choices[0].message.content;
    const candidates = d.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined;
    if (candidates?.[0]?.content?.parts?.[0]?.text) return candidates[0].content.parts[0].text;
    throw new Error('Unexpected response format');
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    if (!this.apiKey) throw new Error(`${this.name} API key not configured`);
    const model = this.config.defaultModel;
    const start = Date.now();
    const { url, init } = this.buildRequest(model, request);

    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(120000),
    });

    if (res.status === 429) throw new Error(`${this.name}: rate limit exceeded`);
    if (!res.ok) throw new Error(`${this.name} request failed: ${res.status} ${res.statusText}`);

    const data = await res.json();
    return {
      text: this.parseResponse(data),
      model,
      provider: this.id,
      durationMs: Date.now() - start,
    };
  }
}
