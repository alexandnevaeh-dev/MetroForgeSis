import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isWindowsStorePythonStub, resolvePythonExecutable } from './python.js';

describe('python resolver', () => {
  it('prefers a physical data-drive runtime over the legacy junction path', () => {
    const root = mkdtempSync(join(tmpdir(), 'mf-python-runtime-'));
    try {
      for (const name of ['diffusers', 'diffusers-native']) {
        const scripts = join(root, 'Python', name, 'Scripts');
        mkdirSync(scripts, { recursive: true });
        writeFileSync(join(scripts, 'python.exe'), 'fixture');
      }
      expect(resolvePythonExecutable(undefined, { METROFORGE_DATA_DIR: root }, 'win32'))
        .toBe(join(root, 'Python', 'diffusers-native', 'Scripts', 'python.exe'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('detects Windows Store App Execution Alias stubs', () => {
    expect(
      isWindowsStorePythonStub(
        'C:\\Users\\alexa\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe',
      ),
    ).toBe(true);
    expect(isWindowsStorePythonStub('E:\\MetroForgeData\\Python\\diffusers\\Scripts\\python.exe')).toBe(
      false,
    );
  });

  it('prefers DIFFUSERS_PYTHON over platform default', () => {
    const resolved = resolvePythonExecutable(undefined, {
      DIFFUSERS_PYTHON: 'E:\\fake\\but\\configured\\python.exe',
    } as NodeJS.ProcessEnv);
    // Absolute missing paths are skipped — falls through to platform default.
    expect(resolved === 'python' || resolved === 'python3' || resolved.endsWith('python.exe')).toBe(
      true,
    );
  });

  it('honors an explicit override first', () => {
    expect(
      resolvePythonExecutable('C:\\tools\\python.exe', {
        DIFFUSERS_PYTHON: 'E:\\other\\python.exe',
      } as NodeJS.ProcessEnv),
    ).toBe('C:\\tools\\python.exe');
  });
});
