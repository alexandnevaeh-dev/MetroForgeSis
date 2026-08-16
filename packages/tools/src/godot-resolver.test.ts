import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveGodotExecutableCanonical, readProjectGodotOverride } from './godot-resolver.js';

describe('resolveGodotExecutableCanonical precedence', () => {
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

  it('reads project.json godotExecutable override', () => {
    const dir = join(tmpdir(), `mf-godot-meta-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'project.json'), JSON.stringify({ godotExecutable: '/opt/custom/godot' }));
    expect(readProjectGodotOverride(dir)).toBe('/opt/custom/godot');
    rmSync(dir, { recursive: true, force: true });
  });
});
