export type AICapability =
  | 'text_generation'
  | 'code_generation'
  | 'json_generation'
  | 'narrative'
  | 'image_generation'
  | 'audio_generation'
  | 'embedding';

export type ProviderHealth = 'healthy' | 'degraded' | 'unavailable';

export interface TextGenerationRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface TextGenerationResponse {
  text: string;
  model: string;
  provider: string;
  durationMs: number;
  tokensUsed?: number;
}

export interface AIProvider {
  id: string;
  name: string;
  local: boolean;
  enabled: boolean;
  costClass: 'free' | 'low' | 'medium' | 'high';
  license: string;
  capabilities: AICapability[];
  health: ProviderHealth;
  priority: number;
  initialize(): Promise<void>;
  checkHealth(): Promise<ProviderHealth>;
}

export interface TextGenerationProvider extends AIProvider {
  generateText(request: TextGenerationRequest): Promise<TextGenerationResponse>;
  listModels(): Promise<string[]>;
}

export interface ModelMetadata {
  id: string;
  provider: string;
  capabilities: AICapability[];
  local: boolean;
  enabled: boolean;
  costClass: 'free' | 'low' | 'medium' | 'high';
  license: string;
  contextWindow: number | null;
  supportsTools: boolean;
  supportsVision: boolean;
  priority: number;
}

export interface RoutingContext {
  task: string;
  capability: AICapability;
  freeOnly: boolean;
  localOnly: boolean;
  qualityTarget: 'fast' | 'balanced' | 'quality';
}
