import { describe, it, expect } from 'vitest';
import { parseSmokeTestOutput, smokeTestPassed } from './smoke-output.js';

describe('parseSmokeTestOutput', () => {
  it('parses PASS/FAIL/SOFT_FAIL lines and completion marker', () => {
    const output = `
PASS: player_spawn_valid
SOFT_FAIL: optional_check
FAIL: broken_gate
SMOKE_TEST_RESULTS_END
`;
    const parsed = parseSmokeTestOutput(output);
    expect(parsed.checks).toHaveLength(3);
    expect(parsed.passedCount).toBe(1);
    expect(parsed.failed).toEqual(['broken_gate']);
    expect(parsed.softFailed).toEqual(['optional_check']);
    expect(parsed.ranToCompletion).toBe(true);
    expect(smokeTestPassed(parsed)).toBe(false);
  });

  it('treats soft-fail-only runs as passed', () => {
    const output = 'PASS: a\nSOFT_FAIL: b\nSMOKE_TEST_RESULTS_END';
    const parsed = parseSmokeTestOutput(output);
    expect(smokeTestPassed(parsed)).toBe(true);
  });
});
