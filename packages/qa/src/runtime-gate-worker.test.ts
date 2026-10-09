import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runRuntimeGateAsync } from './runtime-gate-worker.js';

describe('native validation workers', () => {
  it('keeps the caller responsive and preserves a failed native gate', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'metroforge-worker-test-'));
    const module = join(directory, 'validator.mjs');
    writeFileSync(module, `export class QAValidator {
      validateGodotPlaytest() {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        return { gate: 'godot_playtest', passed: false, state: 'FAIL', message: 'boss_not_defeated' };
      }
    }`);
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 10);
    try {
      const gate = await runRuntimeGateAsync('validateGodotPlaytest', [], module);
      expect(ticks).toBeGreaterThan(5);
      expect(gate).toEqual({ gate: 'godot_playtest', passed: false, state: 'FAIL', message: 'boss_not_defeated' });
    } finally {
      clearInterval(timer);
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('rejects worker startup errors instead of reporting a passing gate', async () => {
    await expect(runRuntimeGateAsync('validateGodotRuntime', [], join(tmpdir(), 'missing-qa-validator.mjs')))
      .rejects.toThrow();
  });
});
