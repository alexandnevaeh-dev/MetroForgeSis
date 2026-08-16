/** Toggleable provider ids for Settings (text + image). */
export const TOGGLEABLE_PROVIDER_IDS = [
  'ollama',
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
  'gemini',
  'groq',
  'openrouter',
  'huggingface',
  'nvidia',
] as const satisfies readonly ToggleableProviderId[];

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
