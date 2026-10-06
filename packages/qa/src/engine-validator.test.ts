import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { detectProjectEngine, validateForeignEngineProject } from './engine-validator.js';

describe('foreign engine validation', () => {
  it('does not treat a Unity project as Godot', () => {
    const dir = join(tmpdir(), `mf-qa-unity-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'engine.json'), JSON.stringify({ engine: 'unity', generated: true }));
    expect(detectProjectEngine(dir)).toBe('unity');
    const report = validateForeignEngineProject(dir, 'unity');
    expect(report.passed).toBe(false);
    expect(report.results.find((r) => r.gate === 'required_files')?.passed).toBe(false);
    expect(report.results.find((r) => r.gate === 'unity_compile')?.state).toBe('SKIPPED');
    expect(report.results.find((r) => r.gate === 'unity_playtest')?.state).toBe('SKIPPED');
    rmSync(dir, { recursive: true, force: true });
  });
});
