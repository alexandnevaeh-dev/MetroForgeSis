import { describe, expect, it } from 'vitest';
import {
  parsePlaytestOutput,
  parsePlaytestTelemetry,
  playtestPassed,
  summarizePlaytestBalance,
} from './playtest-output.js';

describe('parsePlaytestOutput', () => {
  it('parses PASS/FAIL markers from PlaytestRunner stdout', () => {
    const output = [
      'PLAYTEST_RESULTS_BEGIN',
      'PASS: playtest_route_file_present',
      'FAIL: playtest_reached_victory_flow',
      'PLAYTEST_RESULTS_END',
    ].join('\n');

    const parsed = parsePlaytestOutput(output);
    expect(parsed.ranToCompletion).toBe(true);
    expect(parsed.passedCount).toBe(1);
    expect(parsed.failed).toEqual(['playtest_reached_victory_flow']);
    expect(parsed.telemetry).toBeNull();
    expect(playtestPassed(parsed, 1)).toBe(false);
  });

  it('parses telemetry JSON between markers', () => {
    const telemetry = {
      personaId: 'victory_rusher',
      elapsedMs: 4200,
      transitionsPlanned: 3,
      transitionsCompleted: 3,
      pickupsCollected: 1,
      attacksPerformed: 8,
      abilitiesAfterRun: ['dash'],
      roomsVisited: ['room_000', 'room_001'],
      victoryBossId: 'boss_final',
      bossFightMs: 900,
      avgTransitionMs: 400,
      inputSimulationUsed: true,
      victoryState: true,
      gameComplete: true,
      balanceHints: [],
    };

    const output = [
      'PLAYTEST_RESULTS_END',
      'PLAYTEST_TELEMETRY_BEGIN',
      JSON.stringify(telemetry),
      'PLAYTEST_TELEMETRY_END',
    ].join('\n');

    const parsed = parsePlaytestTelemetry(output);
    expect(parsed?.personaId).toBe('victory_rusher');
    expect(parsed?.transitionsCompleted).toBe(3);
    expect(summarizePlaytestBalance({ ...telemetry, attacksPerformed: 45 })).toContain(
      'high_attack_count',
    );
  });
});
