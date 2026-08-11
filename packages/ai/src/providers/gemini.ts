import { BaseHttpTextProvider, type HttpProviderConfig } from './base-http.js';
import type { TextGenerationRequest } from '../types.js';

export class GeminiProvider extends BaseHttpTextProvider {
  id = 'gemini';
  name = 'Google Gemini';
  license = 'Google Terms of Service';

  constructor(config: HttpProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
      defaultModel: config.defaultModel || 'gemini-2.0-flash',
      priority: config.priority ?? 80,
    });
  }

  async listModels(): Promise<string[]> {
    if (!this.apiKey) return [];
    const res = await fetch(`${this.config.baseUrl}/models?key=${this.apiKey}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [this.config.defaultModel];
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name.replace('models/', ''));
  }

  protected buildRequest(model: string, request: TextGenerationRequest) {
    const prompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    return {
      url: `${this.config.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxTokens ?? 4096,
            responseMimeType: request.jsonMode ? 'application/json' : 'text/plain',
          },
        }),
      } satisfies RequestInit,
    };
  }

  protected override parseResponse(data: unknown): string {
    const d = data as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;
    return super.parseResponse(data);
  }
}
