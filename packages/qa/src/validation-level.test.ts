import { describe, expect, it } from 'vitest';
import { deriveValidationLevel } from './validation-level.js';

describe('deriveValidationLevel', () => {
  it('returns FAILED when static gates fail', () => {
    expect(
      deriveValidationLevel({
        staticPassed: false,
        godotAvailable: true,
      }),
    ).toBe('FAILED');
  });

  it('returns NEEDS_RUNTIME_VALIDATION when Godot is unavailable', () => {
    expect(
      deriveValidationLevel({
        staticPassed: true,
        godotAvailable: false,
        importGate: { gate: 'godot_imports', passed: true, state: 'SKIPPED', message: 'no godot' },
      }),
    ).toBe('NEEDS_RUNTIME_VALIDATION');
  });

  it('returns RUNTIME_VALIDATED when runtime gate passes', () => {
    expect(
      deriveValidationLevel({
        staticPassed: true,
        godotAvailable: true,
        importGate: { gate: 'godot_imports', passed: true, state: 'PASS', message: 'ok' },
        runtimeGate: { gate: 'godot_runtime', passed: true, state: 'PASS', message: '96/96' },
      }),
    ).toBe('RUNTIME_VALIDATED');
  });

  it('returns IMPORT_VALIDATED when runtime skipped by flag', () => {
    expect(
      deriveValidationLevel({
        staticPassed: true,
        godotAvailable: true,
        skipRuntimeValidation: true,
        importGate: { gate: 'godot_imports', passed: true, state: 'PASS', message: 'ok' },
        runtimeGate: { gate: 'godot_runtime', passed: true, state: 'SKIPPED', message: 'skipped' },
      }),
    ).toBe('IMPORT_VALIDATED');
  });

  it('returns RUNTIME_VALIDATED when runtime gate soft-fails (seed had nothing to test)', () => {
    expect(
      deriveValidationLevel({
        staticPassed: true,
        godotAvailable: true,
        importGate: { gate: 'godot_imports', passed: true, state: 'PASS', message: 'ok' },
        runtimeGate: { gate: 'godot_runtime', passed: true, state: 'SOFT_FAIL', message: '91/96' },
      }),
    ).toBe('RUNTIME_VALIDATED');
  });

  it('returns FAILED when runtime gate fails hard', () => {
    expect(
      deriveValidationLevel({
        staticPassed: true,
        godotAvailable: true,
        importGate: { gate: 'godot_imports', passed: true, state: 'PASS', message: 'ok' },
        runtimeGate: { gate: 'godot_runtime', passed: false, state: 'FAIL', message: 'broken' },
      }),
    ).toBe('FAILED');
  });
});
