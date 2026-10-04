import type { AICapability, ProviderHealth, TextGenerationProvider, TextGenerationRequest, TextGenerationResponse } from '../types.js';

export interface CompatibleChatConfig {
  id: string;
  name: string;
  baseUrl: string;
  model?: string;
  apiKey?: string;
  local?: boolean;
  enabled?: boolean;
  priority?: number;
  license: string;
}

/** Explicit providers sharing the documented chat-completions protocol. */
export class CompatibleChatProvider implements TextGenerationProvider {
  readonly id: string;
  readonly name: string;
  readonly local: boolean;
  readonly license: string;
  readonly costClass: 'free' | 'medium';
  readonly priority: number;
  enabled: boolean;
  health: ProviderHealth = 'unavailable';
  capabilities: AICapability[] = ['text_generation', 'code_generation', 'json_generation', 'narrative'];
  private models: string[] = [];
  private baseUrl: string;

  constructor(private config: CompatibleChatConfig) {
    this.id = config.id; this.name = config.name; this.local = config.local === true;
    this.license = config.license; this.costClass = this.local ? 'free' : 'medium';
    this.priority = config.priority ?? (this.local ? 95 : 60);
    const url = new URL(config.baseUrl);
    if (url.username || url.password || url.search || url.hash ||
        (this.local ? !['localhost','127.0.0.1','[::1]'].includes(url.hostname) : url.protocol !== 'https:') ||
        !['http:','https:'].includes(url.protocol)) throw new Error('Use a valid provider URL without credentials; local servers must use loopback.');
    this.baseUrl = url.href.replace(/\/+$/, '');
    this.enabled = config.enabled !== false && (this.local || Boolean(config.apiKey));
  }

  private headers(): Record<string,string> {
    return { 'Content-Type': 'application/json', ...(this.config.apiKey ? { Authorization: 'Bearer '+this.config.apiKey } : {}) };
  }
  async initialize(): Promise<void> { this.health = this.enabled ? await this.checkHealth() : 'unavailable'; }
  async listModels(): Promise<string[]> {
    if (!this.enabled) return [];
    const response = await fetch(this.baseUrl+'/models', { headers: this.headers(), redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(this.name+' model discovery failed (HTTP '+response.status+').');
    const data = await response.json() as { data?: { id?: unknown; type?: string }[] };
    this.models = (data.data ?? []).filter(m => m.type !== 'embedding' && typeof m.id === 'string' && !/embed|rerank/i.test(m.id))
      .map(m => m.id as string);
    return this.models;
  }
  async checkHealth(): Promise<ProviderHealth> {
    try {
      const models = await this.listModels();
      return models.length > 0 && (!this.config.model || models.includes(this.config.model)) ? 'healthy' : 'degraded';
    } catch { return 'unavailable'; }
  }
  async generateText(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    if (!this.enabled) throw new Error(this.name+' is disabled or needs an API key.');
    request.signal?.throwIfAborted();
    const model = this.config.model || this.models[0] || (await this.listModels())[0];
    if (!model) throw new Error('Load a chat model in '+this.name+' before generating.');
    const started = Date.now();
    const response = await fetch(this.baseUrl+'/chat/completions', {
      method: 'POST', headers: this.headers(), redirect: 'error',
      signal: request.signal ? AbortSignal.any([request.signal,AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
      body: JSON.stringify({
        model, messages: [...(request.systemPrompt ? [{ role:'system',content:request.systemPrompt }] : []), { role:'user',content:request.prompt }],
        stream:false, temperature:request.temperature ?? .7, max_tokens:request.maxTokens ?? 4096,
        ...(request.jsonMode ? { response_format:{type:'json_object'} } : {}),
      }),
    });
    if (!response.ok) throw new Error(this.name+' generation failed (HTTP '+response.status+'). Check your key, model and quota.');
    const data = await response.json() as { choices?: {message?: {content?: unknown}}[]; usage?: {total_tokens?: number} };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error(this.name+' returned no text.');
    return { text:content,model,provider:this.id,durationMs:Date.now()-started,tokensUsed:data.usage?.total_tokens };
  }
}
