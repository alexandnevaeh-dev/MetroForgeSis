export const QUANTUM_ARCHETYPE = 'QUANTUM_SIMULATION_ROGUELITE';

export function latestCreationPhases<T extends { phase: string }>(phases: T[]): T[] {
  return [...new Map(phases.map(phase => [phase.phase, phase])).values()];
}

/** Keep a seed of zero and reject fractions/blank input instead of silently replacing it. */
export function parseCreationSeed(value: string, quantum: boolean): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  const minimum = quantum ? 0 : -2147483648;
  return Number.isInteger(number) && number >= minimum && number <= 2147483647 ? number : null;
}

export interface CreationResult {
  success: boolean;
  cancelled?: boolean;
  validationPassed?: boolean;
  validationLevel?: string;
  outputPath?: string;
  errors?: string[];
  warnings?: string[];
}

export function creationResultStatus(result: CreationResult | null): {
  label: string;
  tone: 'muted' | 'success' | 'warning' | 'danger' | 'info';
} {
  if (!result) return {label:'Idle',tone:'muted'};
  if (result.cancelled) return {label:'Cancelled',tone:'warning'};
  if (!result.success) return {label:'Failed',tone:'danger'};
  if (result.validationPassed === true) return {label:'Tests passed',tone:'success'};
  if (result.validationPassed === false) return {label:result.errors?.length ? 'Tests failed' : 'Tests pending',tone:'warning'};
  return {label:'Created',tone:'info'};
}
