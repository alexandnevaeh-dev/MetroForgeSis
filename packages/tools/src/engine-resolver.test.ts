import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { missingEditorError, resolveUnityEditor, unityVersionSupported, unrealVersionSupported } from './engine-resolver.js';

describe('Unity Hub custom installations', () => {
  it('detects editors outside standard roots and skips stale registrations', () => {
    const root = mkdtempSync(join(tmpdir(), 'mf-unity-hub-'));
    try {
      const editor = join(root, 'custom-drive', 'Editor', 'Unity.exe');
      mkdirSync(join(root, 'custom-drive', 'Editor'), { recursive: true });
      writeFileSync(editor, 'fixture');
      const config = join(root, 'editors-v2.json');
      writeFileSync(config, JSON.stringify({ data: [
        null,
        { version: '6000.3.99f1', location: [root] },
        { version: '6000.3.9f1', location: [join(root, 'removed', 'Unity.exe')] },
        { version: '6000.3.0f1', location: [editor] },
      ] }));
      expect(resolveUnityEditor({ platform: 'win32', homeDir: root, hubConfigPath: config })).toMatchObject({
        path: editor, version: '6000.3.0f1', source: 'hub',
      });
      writeFileSync(config, '{broken');
      expect(() => resolveUnityEditor({ platform: 'win32', homeDir: root, hubConfigPath: config })).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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
