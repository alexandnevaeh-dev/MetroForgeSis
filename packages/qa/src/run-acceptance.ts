import { QAValidator } from './validator.js';
import type { QAReport, QAGateResult } from './validator.js';
import { buildAcceptanceReport, type AcceptanceReport } from './acceptance-report.js';

export interface RunProjectAcceptanceOptions {
  projectPath: string;
  slug: string;
  godotPath?: string | null;
  skipRuntime?: boolean;
  completion: {
    productionReady: boolean;
    victoryPathReady: boolean;
    completionScore: number;
    blockers: string[];
  };
  staticReport?: QAReport;
}

export async function runProjectAcceptance(
  options: RunProjectAcceptanceOptions,
): Promise<AcceptanceReport> {
  const validator = new QAValidator();
  const staticReport =
    options.staticReport ?? validator.validateProject(options.projectPath, options.slug);

  let importGate: QAGateResult | undefined;
  let runtimeGate: QAGateResult | undefined;

  if (options.godotPath) {
    importGate = validator.validateGodotHeadless(options.godotPath, options.projectPath);
    if (!options.skipRuntime) {
      runtimeGate = validator.validateGodotRuntime(options.godotPath, options.projectPath);
    }
  }

  return buildAcceptanceReport({
    slug: options.slug,
    projectPath: options.projectPath,
    staticReport,
    importGate,
    runtimeGate,
    completion: options.completion,
  });
}
