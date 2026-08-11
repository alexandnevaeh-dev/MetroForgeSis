import { BaseHttpTextProvider, type HttpProviderConfig } from './base-http.js';
import type { TextGenerationRequest } from '../types.js';

export class OpenRouterProvider extends BaseHttpTextProvider {
  id = 'openrouter';
  name = 'OpenRouter';
  license = 'OpenRouter Terms of Service';

  constructor(config: HttpProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://openrouter.ai/api/v1',
      defaultModel: config.defaultModel || 'google/gemma-2-9b-it:free',
      priority: config.priority ?? 60,
    });
  }

  async listModels(): Promise<string[]> {
    if (!this.apiKey) return [];
    const res = await fetch(`${this.config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [this.config.defaultModel];
    const data = (await res.json()) as { data?: { id: string }[] };
    return (data.data ?? []).map((m) => m.id);
  }

  protected buildRequest(model: string, request: TextGenerationRequest) {
    const messages: { role: string; content: string }[] = [];
    if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
    messages.push({ role: 'user', content: request.prompt });

    return {
      url: `${this.config.baseUrl}/chat/completions`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://metroforge-ai.local',
          'X-Title': 'MetroForge AI',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 4096,
        }),
      } satisfies RequestInit,
    };
  }
}
