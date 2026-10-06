import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { assertEngineOutputIsolation, EngineOutputCollisionError } from './isolation.js';

describe('engine output isolation', () => {
  it('refuses to write Unity into a Godot project folder', () => {
    const dir = join(tmpdir(), `mf-engine-iso-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'project.godot'), '; godot\n');
    expect(() => assertEngineOutputIsolation(dir, 'unity')).toThrow(EngineOutputCollisionError);
    rmSync(dir, { recursive: true, force: true });
  });

  it('allows assembling into an empty directory', () => {
    const dir = join(tmpdir(), `mf-engine-empty-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    expect(() => assertEngineOutputIsolation(dir, 'unreal')).not.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });
});
