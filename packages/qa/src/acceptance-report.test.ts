import { describe, it, expect } from 'vitest';
import { buildAcceptanceReport, formatAcceptanceReport } from './acceptance-report.js';

describe('buildAcceptanceReport', () => {
  it('marks accepted when static, import, runtime, and victory path pass', () => {
    const report = buildAcceptanceReport({
      slug: 'demo',
      projectPath: '/tmp/demo',
      staticReport: {
        passed: true,
        results: [{ gate: 'required_files', passed: true, message: 'ok' }],
        validationResults: [],
      },
      importGate: { gate: 'godot_imports', passed: true, message: 'import ok' },
      runtimeGate: {
        gate: 'godot_runtime',
        passed: true,
        message: '96/96',
        details: { output: 'PASS: a\nSMOKE_TEST_RESULTS_END' },
      },
      completion: {
        productionReady: true,
        victoryPathReady: true,
        completionScore: 100,
        blockers: [],
      },
    });

    expect(report.accepted).toBe(true);
    expect(formatAcceptanceReport(report)).toContain('Accepted: YES');
  });

  it('rejects when victory path incomplete', () => {
    const report = buildAcceptanceReport({
      slug: 'demo',
      projectPath: '/tmp/demo',
      staticReport: { passed: true, results: [], validationResults: [] },
      completion: {
        productionReady: false,
        victoryPathReady: false,
        completionScore: 40,
        blockers: ['Final quest has no BossKill objective'],
      },
    });
    expect(report.accepted).toBe(false);
  });
});
