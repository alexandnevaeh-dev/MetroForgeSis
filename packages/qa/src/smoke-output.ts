export interface SmokeCheckResult {
  status: 'PASS' | 'FAIL' | 'SOFT_FAIL';
  name: string;
}

export interface ParsedSmokeOutput {
  checks: SmokeCheckResult[];
  ranToCompletion: boolean;
  passedCount: number;
  failed: string[];
  softFailed: string[];
  output: string;
}

/** Parse stdout from RuntimeSmokeTest.gd (PASS/FAIL/SOFT_FAIL lines + results marker). */
export function parseSmokeTestOutput(output: string): ParsedSmokeOutput {
  const checks = Array.from(output.matchAll(/^(PASS|FAIL|SOFT_FAIL): (.+)$/gm)).map((m) => ({
    status: m[1] as SmokeCheckResult['status'],
    name: m[2]!,
  }));
  const failed = checks.filter((c) => c.status === 'FAIL').map((c) => c.name);
  const softFailed = checks.filter((c) => c.status === 'SOFT_FAIL').map((c) => c.name);
  const passedCount = checks.filter((c) => c.status === 'PASS').length;
  const ranToCompletion = output.includes('SMOKE_TEST_RESULTS_END');

  return {
    checks,
    ranToCompletion,
    passedCount,
    failed,
    softFailed,
    output,
  };
}

export function smokeTestPassed(parsed: ParsedSmokeOutput, exitCode = 0): boolean {
  if (!parsed.ranToCompletion) return false;
  if (parsed.failed.length > 0 || exitCode !== 0) return false;
  return true;
}
