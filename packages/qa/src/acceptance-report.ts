import type { QAReport } from './validator.js';
import type { QAGateResult } from './validator.js';
import { parseSmokeTestOutput, smokeTestPassed } from './smoke-output.js';

export interface AcceptanceReport {
  slug: string;
  projectPath: string;
  staticPassed: boolean;
  importPassed: boolean | null;
  runtimePassed: boolean | null;
  completionScore: number;
  productionReady: boolean;
  victoryPathReady: boolean;
  accepted: boolean;
  blockers: string[];
  gates: Array<{ gate: string; passed: boolean; message: string }>;
  runtimeChecks?: { passed: number; total: number; failed: string[] };
}

export interface BuildAcceptanceReportInput {
  slug: string;
  projectPath: string;
  staticReport: QAReport;
  importGate?: QAGateResult;
  runtimeGate?: QAGateResult;
  runtimeExitCode?: number;
  completion: {
    productionReady: boolean;
    victoryPathReady: boolean;
    completionScore: number;
    blockers: string[];
  };
}

export function buildAcceptanceReport(input: BuildAcceptanceReportInput): AcceptanceReport {
  const importPassed = input.importGate ? input.importGate.passed : null;
  const runtimePassed = input.runtimeGate ? input.runtimeGate.passed : null;

  const gates = [
    ...input.staticReport.results.map((r) => ({
      gate: r.gate,
      passed: r.passed,
      message: r.message,
    })),
    ...(input.importGate
      ? [{ gate: input.importGate.gate, passed: input.importGate.passed, message: input.importGate.message }]
      : []),
    ...(input.runtimeGate
      ? [{ gate: input.runtimeGate.gate, passed: input.runtimeGate.passed, message: input.runtimeGate.message }]
      : []),
  ];

  const blockers = [...input.completion.blockers];
  if (!input.staticReport.passed) blockers.push('Static QA gates failed');
  if (importPassed === false) blockers.push('Godot import failed');
  if (runtimePassed === false) blockers.push('Runtime smoke test failed');

  let runtimeChecks: AcceptanceReport['runtimeChecks'];
  if (input.runtimeGate?.details && typeof input.runtimeGate.details === 'object') {
    const output = String((input.runtimeGate.details as { output?: string }).output ?? '');
    if (output) {
      const parsed = parseSmokeTestOutput(output);
      runtimeChecks = {
        passed: parsed.passedCount,
        total: parsed.checks.length,
        failed: parsed.failed,
      };
    }
  }

  const accepted =
    input.staticReport.passed &&
    (importPassed ?? true) &&
    (runtimePassed ?? true) &&
    input.completion.victoryPathReady;

  return {
    slug: input.slug,
    projectPath: input.projectPath,
    staticPassed: input.staticReport.passed,
    importPassed,
    runtimePassed,
    completionScore: input.completion.completionScore,
    productionReady: input.completion.productionReady,
    victoryPathReady: input.completion.victoryPathReady,
    accepted,
    blockers,
    gates,
    runtimeChecks,
  };
}

export function formatAcceptanceReport(report: AcceptanceReport): string {
  const lines: string[] = [
    `Acceptance report: ${report.slug}`,
    `Path: ${report.projectPath}`,
    '',
    `Accepted: ${report.accepted ? 'YES' : 'NO'}`,
    `Production ready: ${report.productionReady ? 'yes' : 'no'}`,
    `Victory path: ${report.victoryPathReady ? 'ready' : 'incomplete'}`,
    `Completion score: ${report.completionScore}%`,
    '',
    'Gates:',
  ];

  for (const gate of report.gates) {
    lines.push(`  [${gate.passed ? '✓' : '✗'}] ${gate.gate}: ${gate.message}`);
  }

  if (report.runtimeChecks) {
    lines.push('');
    lines.push(
      `Runtime checks: ${report.runtimeChecks.passed}/${report.runtimeChecks.total} passed`,
    );
    if (report.runtimeChecks.failed.length > 0) {
      lines.push(`  Failed: ${report.runtimeChecks.failed.join(', ')}`);
    }
  }

  if (report.blockers.length > 0) {
    lines.push('');
    lines.push('Blockers:');
    for (const b of report.blockers) lines.push(`  - ${b}`);
  }

  return lines.join('\n');
}

export { smokeTestPassed, parseSmokeTestOutput };
