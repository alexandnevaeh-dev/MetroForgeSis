import { BaseHttpTextProvider, type HttpProviderConfig } from './base-http.js';
import type { TextGenerationRequest } from '../types.js';

export class HuggingFaceProvider extends BaseHttpTextProvider {
  id = 'huggingface';
  name = 'Hugging Face';
  license = 'Model-dependent (Hugging Face model cards)';

  constructor(config: HttpProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api-inference.huggingface.co/models',
      defaultModel: config.defaultModel || 'Qwen/Qwen2.5-7B-Instruct',
      priority: config.priority ?? 50,
    });
  }

  async listModels(): Promise<string[]> {
    return [this.config.defaultModel];
  }

  protected buildRequest(model: string, request: TextGenerationRequest) {
    const inputs = request.systemPrompt
      ? `<|system|>\n${request.systemPrompt}\n<|user|>\n${request.prompt}\n<|assistant|>\n`
      : request.prompt;

    return {
      url: `${this.config.baseUrl}/${model}`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          inputs,
          parameters: {
            max_new_tokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0.7,
            return_full_text: false,
          },
        }),
      } satisfies RequestInit,
    };
  }

  protected override parseResponse(data: unknown): string {
    if (Array.isArray(data)) {
      const item = data[0] as { generated_text?: string };
      if (item.generated_text) return item.generated_text;
    }
    return super.parseResponse(data);
  }
}
