import type { QAGateResult } from './validator.js';
import { gateState } from './validator.js';

/** Distinct validation outcomes — do not collapse into a generic "success". */
export type ValidationLevel =
  | 'GENERATED'
  | 'STATIC_VALIDATED'
  | 'IMPORT_VALIDATED'
  | 'RUNTIME_VALIDATED'
  | 'NEEDS_RUNTIME_VALIDATION'
  | 'FAILED';

export interface ValidationLevelInput {
  staticPassed: boolean;
  importGate?: QAGateResult;
  runtimeGate?: QAGateResult;
  godotAvailable: boolean;
  skipRuntimeValidation?: boolean;
}

export function deriveValidationLevel(input: ValidationLevelInput): ValidationLevel {
  if (!input.staticPassed) return 'FAILED';

  const importState = input.importGate ? gateState(input.importGate) : undefined;
  const runtimeState = input.runtimeGate ? gateState(input.runtimeGate) : undefined;

  if (runtimeState === 'FAIL') return 'FAILED';
  if (importState === 'FAIL') return 'FAILED';

  if (runtimeState === 'PASS' || runtimeState === 'SOFT_FAIL') return 'RUNTIME_VALIDATED';

  if (input.skipRuntimeValidation) {
    if (importState === 'PASS') return 'IMPORT_VALIDATED';
    return 'STATIC_VALIDATED';
  }

  if (!input.godotAvailable) {
    return 'NEEDS_RUNTIME_VALIDATION';
  }

  if (importState === 'PASS' && (runtimeState === 'SKIPPED' || runtimeState === undefined)) {
    return 'IMPORT_VALIDATED';
  }

  if (importState === 'SKIPPED' || importState === undefined) {
    return 'STATIC_VALIDATED';
  }

  return input.staticPassed ? 'STATIC_VALIDATED' : 'FAILED';
}
