import { describe, expect, it } from 'vitest';
import { missingEditorError, unityVersionSupported, unrealVersionSupported } from './engine-resolver.js';

describe('engine resolver messages', () => {
  it('supports Unity 6.3 and Unreal 5.5–5.8', () => {
    expect(unityVersionSupported('6000.3.0f1')).toBe(true);
    expect(unityVersionSupported('2022.3.50f1')).toBe(false);
    expect(unrealVersionSupported('5.8')).toBe(true);
    expect(unrealVersionSupported('5.4')).toBe(false);
  });

  it('explains missing editors without implying the project was playtested', () => {
    expect(
      missingEditorError('unity', { path: null, version: null, message: 'Not detected' }),
    ).toContain('UNITY_EDITOR_NOT_AVAILABLE');
    expect(
      missingEditorError('unreal', { path: null, version: null, message: 'Not detected' }),
    ).toContain('UNREAL_EDITOR_NOT_AVAILABLE');
  });
});
