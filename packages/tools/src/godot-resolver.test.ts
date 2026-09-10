import { afterEach, describe, expect, it, vi } from 'vitest';
import * as childProcess from 'node:child_process';

vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
}));
import { chmodSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  defaultGodotKnownPaths,
  resolveGodotExecutableCanonical,
  readProjectGodotOverride,
} from './godot-resolver.js';

describe('resolveGodotExecutableCanonical precedence', () => {
  afterEach(() => vi.restoreAllMocks());
  it('prefers preference over env and path', () => {
    const dir = join(tmpdir(), `mf-godot-pref-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const pref = join(dir, 'pref-godot.exe');
    const env = join(dir, 'env-godot.exe');
    writeFileSync(pref, '');
    writeFileSync(env, '');
    const result = resolveGodotExecutableCanonical({
      preference: pref,
      envPath: env,
      probeVersion: false,
      extraKnownPaths: [],
    });
    expect(result.path).toBe(pref);
    expect(result.source).toBe('preference');
    expect(result.sourceLabel).toBe('App preference');
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses project override after preference', () => {
    const dir = join(tmpdir(), `mf-godot-proj-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const override = join(dir, 'project-godot.exe');
    const env = join(dir, 'env-godot.exe');
    writeFileSync(override, '');
    writeFileSync(env, '');
    const result = resolveGodotExecutableCanonical({
      preference: null,
      projectOverride: override,
      envPath: env,
      probeVersion: false,
      extraKnownPaths: [],
    });
    expect(result.path).toBe(override);
    expect(result.source).toBe('project_override');
    rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to env then known paths', () => {
    const dir = join(tmpdir(), `mf-godot-env-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const env = join(dir, 'env-godot.exe');
    const known = join(dir, 'known-godot.exe');
    writeFileSync(env, '');
    writeFileSync(known, '');
    if (process.platform !== 'win32') chmodSync(known, 0o755);
    const byEnv = resolveGodotExecutableCanonical({
      preference: null,
      envPath: env,
      probeVersion: false,
      extraKnownPaths: [known],
    });
    expect(byEnv.source).toBe('env');
    expect(byEnv.path).toBe(env);

    const byKnown = resolveGodotExecutableCanonical({
      preference: null,
      envPath: null,
      probeVersion: false,
      extraKnownPaths: [known],
    });
    expect(byKnown.source).toBe('known_path');
    expect(byKnown.path).toBe(known);
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns none when nothing resolves', () => {
    const result = resolveGodotExecutableCanonical({
      preference: null,
      envPath: null,
      probeVersion: false,
      extraKnownPaths: [join(tmpdir(), `missing-godot-${Date.now()}.exe`)],
    });
    // May still find PATH godot on developer machines — only assert known_path miss when path empty
    if (!result.path) {
      expect(result.source).toBe('none');
      expect(result.sourceLabel).toBe('Not found');
    }
  });

  it('finds a Godot executable in the MetroForge managed runtime cache without a hardcoded version', () => {
    if (process.platform !== 'win32') return;
    const dir = join(tmpdir(), `mf-godot-managed-${Date.now()}`);
    const godotDir = join(dir, 'MetroForge', 'Godot');
    mkdirSync(godotDir, { recursive: true });
    const versioned = join(godotDir, 'Godot_v4.9.1-stable_win64.exe');
    const consoleVariant = join(godotDir, 'Godot_v4.9.1-stable_win64_console.exe');
    writeFileSync(versioned, '');
    writeFileSync(consoleVariant, '');
    const prevLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = dir;
    try {
      const result = resolveGodotExecutableCanonical({
        preference: null,
        envPath: null,
        probeVersion: false,
        extraKnownPaths: [],
      });
      expect(result.source).toBe('known_path');
      expect(result.path).toBe(versioned);
    } finally {
      process.env.LOCALAPPDATA = prevLocalAppData;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads project.json godotExecutable override', () => {
    const dir = join(tmpdir(), `mf-godot-meta-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'project.json'), JSON.stringify({ godotExecutable: '/opt/custom/godot' }));
    expect(readProjectGodotOverride(dir)).toBe('/opt/custom/godot');
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves a configured macOS .app bundle to its native executable', () => {
    const dir = join(tmpdir(), `mf-godot-app-${Date.now()}`);
    const app = join(dir, 'Godot.app');
    const executable = join(app, 'Contents', 'MacOS', 'Godot');
    mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true });
    writeFileSync(executable, 'version-probe fixture');
    const probe = vi.spyOn(childProcess, 'execFileSync').mockReturnValue('4.7.2.stable\n');
    chmodSync(executable, 0o755);
    const result = resolveGodotExecutableCanonical({
      preference: app,
      platform: 'darwin',
      probeVersion: true,
      environment: { PATH: process.env.PATH },
    });
    expect(result.path).toBe(executable);
    expect(result.version).toBe('4.7.2.stable');
    expect(probe).toHaveBeenCalledWith(executable, ['--version'], expect.objectContaining({ timeout: 8000 }));
    rmSync(dir, { recursive: true, force: true });
  });

  it('supports GODOT4_PATH and GODOT_PATH compatibility overrides', () => {
    const dir = join(tmpdir(), `mf-godot-env-compat-${Date.now()}`);
    const executable = join(dir, 'godot');
    mkdirSync(dir, { recursive: true });
    writeFileSync(executable, '');
    chmodSync(executable, 0o755);
    for (const name of ['GODOT4_PATH', 'GODOT_PATH'] as const) {
      const result = resolveGodotExecutableCanonical({
        platform: 'darwin',
        probeVersion: false,
        environment: { [name]: executable, PATH: '' },
      });
      expect(result.path).toBe(executable);
      expect(result.source).toBe('env');
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('discovers Godot from PATH without invoking a shell', () => {
    if (process.platform === 'win32') return;
    const dir = join(tmpdir(), `mf-godot-path-${Date.now()}`);
    const executable = join(dir, 'godot');
    mkdirSync(dir, { recursive: true });
    writeFileSync(executable, 'version-probe fixture');
    const probe = vi.spyOn(childProcess, 'execFileSync').mockReturnValueOnce(executable + '\n').mockReturnValue('4.7.2.stable\n');
    chmodSync(executable, 0o755);
    const result = resolveGodotExecutableCanonical({
      platform: process.platform,
      environment: { ...process.env, PATH: dir },
      homeDir: join(dir, 'missing-home'),
    });
    expect(result.path).toBe(executable);
    expect(result.source).toBe('path');
    expect(probe).toHaveBeenCalledWith(executable, ['--version'], expect.objectContaining({ env: expect.objectContaining({ PATH: dir }) }));
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps Windows known locations available from the same resolver', () => {
    const known = defaultGodotKnownPaths('win32', 'C:\\Users\\player', {
      LOCALAPPDATA: 'C:\\Users\\player\\AppData\\Local',
      ProgramFiles: 'C:\\Program Files',
    });
    expect(known).toContain('C:\\Godot\\Godot.exe');
    expect(known.some((candidate) => candidate.endsWith('Godot.exe'))).toBe(true);
  });
});
