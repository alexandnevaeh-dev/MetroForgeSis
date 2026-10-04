/** Toggleable provider ids for Settings (text + image). */
export const TOGGLEABLE_PROVIDER_IDS = [
  'ollama',
  'lmstudio',
  'together',
  'cerebras',
  'mistral',
  'gemini',
  'groq',
  'openrouter',
  'huggingface',
  'nvidia',
  'comfyui',
  'nvidia-image',
  'diffusers',
  'automatic1111',
  'huggingface-image',
  'kenney',
  'opengameart',
  'stability',
  'deepai',
  'replicate',
] as const;

export type ToggleableProviderId = (typeof TOGGLEABLE_PROVIDER_IDS)[number];

export const TEXT_PROVIDER_TOGGLE_IDS = [
  'ollama',
  'lmstudio',
  'together',
  'cerebras',
  'mistral',
  'gemini',
  'groq',
  'openrouter',
  'huggingface',
  'nvidia',
] as const satisfies readonly ToggleableProviderId[];

/** Non-secret server/model preferences. Keys belong in the encrypted credential store. */
export const TEXT_CONNECTION_FIELDS = [
  { key:'app.ollama.baseUrl', label:'Ollama server URL', fallback:'http://127.0.0.1:11434', env:'OLLAMA_BASE_URL', localUrl:true },
  { key:'app.ollama.model', label:'Ollama chat model', fallback:'qwen3-coder-next', env:'OLLAMA_DEFAULT_MODEL', localUrl:false },
  { key:'app.lmstudio.baseUrl', label:'LM Studio server URL', fallback:'http://127.0.0.1:1234/v1', env:'LMSTUDIO_BASE_URL', localUrl:true },
  { key:'app.lmstudio.model', label:'LM Studio chat model (blank uses the server model)', fallback:'', env:'LMSTUDIO_DEFAULT_MODEL', localUrl:false },
  { key:'app.together.model', label:'Together AI chat model', fallback:'openai/gpt-oss-120b', env:'TOGETHER_DEFAULT_MODEL', localUrl:false },
  { key:'app.cerebras.model', label:'Cerebras chat model', fallback:'gpt-oss-120b', env:'CEREBRAS_DEFAULT_MODEL', localUrl:false },
  { key:'app.mistral.model', label:'Mistral chat model', fallback:'mistral-small-latest', env:'MISTRAL_DEFAULT_MODEL', localUrl:false },
] as const;

export function validateTextConnectionSetting(key: string, value: string): void {
  const field = TEXT_CONNECTION_FIELDS.find(field => field.key === key);
  if (!field) return;
  if (value.length > 512 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Enter a server URL or model name of up to 512 characters.');
  if (field.localUrl && value.trim()) {
    let url: URL;
    try { url = new URL(value.trim()); } catch { throw new Error('Enter a complete local server URL.'); }
    if (!['http:','https:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash)
      throw new Error('Local server URLs must use localhost, 127.0.0.1 or [::1], without credentials or query parameters.');
  }
}

export function textConnectionValue(key: string, prefs?: Record<string,string>, env: Record<string,string|undefined> = {}): string {
  const field = TEXT_CONNECTION_FIELDS.find(field => field.key === key);
  return prefs?.[key]?.trim() || (field && env[field.env]?.trim()) || field?.fallback || '';
}

export const IMAGE_PROVIDER_TOGGLE_IDS = [
  'comfyui',
  'nvidia-image',
  'diffusers',
  'automatic1111',
  'huggingface-image',
  'kenney',
  'opengameart',
  'stability',
  'deepai',
  'replicate',
] as const satisfies readonly ToggleableProviderId[];

const PROVIDER_ENABLED_KEY_RE = /^app\.provider\.([a-z0-9-]+)\.enabled$/;

/** Settings DB key for a provider enable flag. */
export function providerEnabledSettingKey(providerId: string): string {
  return `app.provider.${providerId}.enabled`;
}

export function isProviderEnabledSettingKey(key: string): boolean {
  const match = PROVIDER_ENABLED_KEY_RE.exec(key);
  if (!match) return false;
  return (TOGGLEABLE_PROVIDER_IDS as readonly string[]).includes(match[1]!);
}

export function parseProviderEnabledSettingKey(key: string): string | null {
  const match = PROVIDER_ENABLED_KEY_RE.exec(key);
  return match?.[1] ?? null;
}

/**
 * Parse app preference rows into a providerId → enabled map.
 * Missing keys mean "default enabled" (opt-out); only explicit `false` disables.
 */
export function parseProviderEnabledMap(
  prefs: Record<string, string> | undefined | null,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!prefs) return out;
  for (const [key, value] of Object.entries(prefs)) {
    const id = parseProviderEnabledSettingKey(key);
    if (!id) continue;
    const normalized = String(value).trim().toLowerCase();
    out[id] = normalized !== 'false' && normalized !== '0' && normalized !== 'off' && normalized !== 'no';
  }
  return out;
}

/** User toggle allows the provider unless an explicit false is stored. */
export function isProviderUserEnabled(
  enabledMap: Record<string, boolean> | undefined | null,
  providerId: string,
): boolean {
  if (!enabledMap || !(providerId in enabledMap)) return true;
  return enabledMap[providerId] !== false;
}
