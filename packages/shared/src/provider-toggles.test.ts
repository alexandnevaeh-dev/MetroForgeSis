import { describe, it, expect } from 'vitest';
import {
  isProviderEnabledSettingKey,
  isProviderUserEnabled,
  parseProviderEnabledMap,
  providerEnabledSettingKey,
} from './provider-toggles.js';

describe('provider toggles', () => {
  it('builds and recognizes setting keys', () => {
    expect(providerEnabledSettingKey('nvidia-image')).toBe('app.provider.nvidia-image.enabled');
    expect(isProviderEnabledSettingKey('app.provider.ollama.enabled')).toBe(true);
    expect(isProviderEnabledSettingKey('app.defaultMode')).toBe(false);
    expect(isProviderEnabledSettingKey('app.provider.evil.enabled')).toBe(false);
  });

  it('parses prefs with opt-out defaults', () => {
    const map = parseProviderEnabledMap({
      'app.provider.nvidia.enabled': 'false',
      'app.provider.ollama.enabled': 'true',
      'app.defaultMode': 'LOCAL_ONLY',
    });
    expect(map.nvidia).toBe(false);
    expect(map.ollama).toBe(true);
    expect(isProviderUserEnabled(map, 'nvidia')).toBe(false);
    expect(isProviderUserEnabled(map, 'gemini')).toBe(true);
    expect(isProviderUserEnabled(undefined, 'comfyui')).toBe(true);
  });
});
