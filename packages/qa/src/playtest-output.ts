export interface PlaytestCheckResult {
  status: 'PASS' | 'FAIL';
  name: string;
}

export interface PlaytestTelemetry {
  personaId: string;
  elapsedMs: number;
  transitionsPlanned: number;
  transitionsCompleted: number;
  pickupsCollected: number;
  attacksPerformed: number;
  abilitiesAfterRun: string[];
  roomsVisited: string[];
  victoryBossId: string;
  bossFightMs: number;
  avgTransitionMs: number;
  inputSimulationUsed: boolean;
  victoryState: boolean;
  gameComplete: boolean;
  balanceHints: string[];
  // Optional — only the top-down PlaytestAgent.gd currently emits these (see
  // docs/debug/TOPDOWN_PLAYTEST_REPAIR.md, Phase 13). Present on both success AND failure runs,
  // so a failed playtest is diagnosable instead of producing no telemetry at all.
  archetype?: string;
  routeLength?: number;
  completedSteps?: number;
  failedStepIndex?: number;
  transitionsAttempted?: number;
  itemsCollected?: number;
  gatesOpened?: number;
  enemyEncounters?: number;
  bossAttempts?: number;
  bossDefeated?: boolean;
  victoryReached?: boolean;
  durationMs?: number;
  timeoutsExceeded?: number;
  unstickAttempts?: number;
  failureReason?: string;
  stepDiagnostics?: Array<Record<string, unknown>>;
}

export interface ParsedPlaytestOutput {
  checks: PlaytestCheckResult[];
  ranToCompletion: boolean;
  passedCount: number;
  failed: string[];
  output: string;
  telemetry: PlaytestTelemetry | null;
}

/** Parse stdout from PlaytestRunner.gd (PASS/FAIL lines + results + telemetry markers). */
export function parsePlaytestOutput(output: string): ParsedPlaytestOutput {
  const checks = Array.from(output.matchAll(/^(PASS|FAIL): (.+)$/gm)).map((m) => ({
    status: m[1] as PlaytestCheckResult['status'],
    name: m[2]!,
  }));
  const failed = checks.filter((c) => c.status === 'FAIL').map((c) => c.name);
  const passedCount = checks.filter((c) => c.status === 'PASS').length;
  const ranToCompletion = output.includes('PLAYTEST_RESULTS_END');
  const telemetry = parsePlaytestTelemetry(output);

  return {
    checks,
    ranToCompletion,
    passedCount,
    failed,
    output,
    telemetry,
  };
}

export function parsePlaytestTelemetry(output: string): PlaytestTelemetry | null {
  const begin = output.indexOf('PLAYTEST_TELEMETRY_BEGIN');
  const end = output.indexOf('PLAYTEST_TELEMETRY_END');
  if (begin === -1 || end === -1 || end <= begin) return null;

  const jsonBlock = output
    .slice(begin + 'PLAYTEST_TELEMETRY_BEGIN'.length, end)
    .trim();
  if (!jsonBlock) return null;

  try {
    const parsed = JSON.parse(jsonBlock) as PlaytestTelemetry;
    if (typeof parsed.personaId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Lightweight balance/readability hints from a completed playtest run. */
export function summarizePlaytestBalance(telemetry: PlaytestTelemetry): string[] {
  const notes: string[] = [...(telemetry.balanceHints ?? [])];

  if (telemetry.transitionsPlanned > 0) {
    const completionRate =
      telemetry.transitionsCompleted / telemetry.transitionsPlanned;
    if (completionRate < 1) {
      notes.push(
        `route_completion_${Math.round(completionRate * 100)}pct`,
      );
    }
  }

  if (telemetry.bossFightMs > 10_000) {
    notes.push('boss_fight_over_10s');
  }

  if (telemetry.attacksPerformed > 40) {
    notes.push('high_attack_count');
  }

  return [...new Set(notes)];
}

export function playtestPassed(parsed: ParsedPlaytestOutput, exitCode = 0): boolean {
  if (!parsed.ranToCompletion) return false;
  if (parsed.failed.length > 0 || exitCode !== 0) return false;
  return true;
}
