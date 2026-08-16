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
  /** Coarse commercial-use classification for this provider's own terms of service (distinct
   *  from any individual model's license — see LicenseRouter). Undeclared (undefined) means
   *  "not evaluated at provider granularity" and must not be treated as UNKNOWN=blocking by
   *  COMMERCIAL_SAFE-mode provider filtering, since most providers here only have this really
   *  determinable at the per-model level (see ModelMetadata.commercialUse instead). */
  commercialUse?: 'allowed' | 'restricted' | 'unknown';
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
  /** From ModelEntry.commercialUse (packages/schemas/src/models.ts) — real per-model catalog
   *  data, threaded through by reconcileModelCatalog() in bootstrap.ts. Undeclared means the
   *  entry predates this field or came from a non-catalog source. */
  commercialUse?: 'allowed' | 'restricted' | 'unknown';
  estimatedSpeed?: 'fast' | 'medium' | 'slow';
  estimatedQuality?: 'low' | 'medium' | 'high';
  minVramMb?: number;
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
  /** NVIDIA_ONLY mode: only the 'nvidia' provider/models are eligible. */
  nvidiaOnly?: boolean;
  /** OFFLINE mode: no network-dependent (hosted) providers — functionally implies localOnly,
   *  kept as a separate flag so callers can distinguish "user asked for local" from "user asked
   *  to guarantee no network calls" in logs/reasons even though today they filter identically. */
  offline?: boolean;
  /** COMMERCIAL_SAFE mode: only providers/models that pass LicenseRouter.isCommercialSafe(). */
  commercialSafeOnly?: boolean;
  /** LOW_VRAM mode: excludes models whose declared minVramMb exceeds this budget. Models with
   *  no declared minVramMb are never excluded on this basis alone — absence of data is not
   *  evidence the model is too large, so we don't guess. Undefined disables VRAM filtering. */
  maxVramMb?: number;
  /** LOWEST_COST mode: prefer cheaper costClass after health/capability filters. */
  lowestCost?: boolean;
}
