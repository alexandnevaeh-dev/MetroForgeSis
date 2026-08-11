import { BaseHttpTextProvider, type HttpProviderConfig } from './base-http.js';
import type { TextGenerationRequest } from '../types.js';

export class GroqProvider extends BaseHttpTextProvider {
  id = 'groq';
  name = 'Groq';
  license = 'Groq Terms of Service';

  constructor(config: HttpProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api.groq.com/openai/v1',
      defaultModel: config.defaultModel || 'llama-3.3-70b-versatile',
      priority: config.priority ?? 75,
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
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 4096,
          response_format: request.jsonMode ? { type: 'json_object' } : undefined,
        }),
      } satisfies RequestInit,
    };
  }
}
