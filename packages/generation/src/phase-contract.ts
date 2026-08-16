import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface PhaseArtifactCheck {
  ok: boolean;
  missing: string[];
}

/**
 * A phase must not report PASSED/COMPLETE merely because its function returned.
 * COMPLETE means declared output artifacts exist on disk.
 */
export function assertPhaseArtifacts(outputPath: string, artifacts: string[]): PhaseArtifactCheck {
  const missing = artifacts.filter((rel) => !existsSync(join(outputPath, rel)));
  return { ok: missing.length === 0, missing };
}

export function phaseCompleteStatus(
  check: PhaseArtifactCheck,
  extraOk = true,
): 'PASSED' | 'FAILED' {
  return check.ok && extraOk ? 'PASSED' : 'FAILED';
}
