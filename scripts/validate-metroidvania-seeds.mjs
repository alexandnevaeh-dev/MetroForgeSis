import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveGodotExecutableCanonical } from '../packages/tools/dist/godot-resolver.js';
import { terminateProcessTree } from '../packages/shared/dist/platform.js';

const ROOT = process.cwd();
const CLI = path.join(ROOT, 'apps', 'cli', 'dist', 'index.js');
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const RELIABILITY_DIR = path.join(ARTIFACTS_DIR, 'reliability');
const DEFAULT_SEEDS = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009];
const PROMPT = 'A deterministic side-view metroidvania with room-to-room traversal, enemy encounters, boss defeat, save and respawn, final victory.';

export function parsePassFail(output = '') {
  const text = String(output ?? '');
  const lines = text.split(/\r?\n/);
  const passMatches = [...text.matchAll(/PASS(?::|\s|\b)/g)].length;
  const failMatches = [...text.matchAll(/FAIL(?::|\s|\b)/g)].length;
  const results = lines.map((line) => line.trim()).filter(Boolean);
  const explicitPass = results.filter((line) => /(^|\s)PASS(:|\s|$)/.test(line)).length;
  const explicitFail = results.filter((line) => /(^|\s)FAIL(:|\s|$)/.test(line)).length;
  const hasVictory = /victory|gameComplete|boss_defeated|victoryState|VICTORY/i.test(text);
  const hasResultsBegin = /RESULTS_BEGIN|PLAYTEST_RESULTS_END|RESULTS_END|validation_result/i.test(text);
  return { passMatches, failMatches, explicitPass, explicitFail, hasVictory, hasResultsBegin };
}

export function classifySeedResult({
  generationExitCode,
  projectExists,
  validationPassed,
  validationLevel,
  smokePassed,
  playtestPassed,
  progressionProofPassed,
  progressionBossReachable,
  progressionVictoryAchievable,
  output,
}) {
  if (generationExitCode !== 0) return { pass: false, category: 'E1' };
  if (!projectExists) return { pass: false, category: 'E1' };
  if (!validationPassed) return { pass: false, category: 'E2' };
  if (!smokePassed) return { pass: false, category: 'E2' };
  if (!playtestPassed) return { pass: false, category: 'E3' };
  if (progressionProofPassed === false) return { pass: false, category: 'E4' };
  if (!progressionBossReachable || !progressionVictoryAchievable) return { pass: false, category: 'E4' };
  if (output && /database is locked|SQLITE_BUSY|database locked|busy timeout/i.test(output)) return { pass: false, category: 'E0' };
  if (validationLevel && /^RUNTIME_VALIDATED$/i.test(validationLevel)) return { pass: true, category: 'PASS' };
  return { pass: true, category: 'PASS' };
}

function detectMetroforgeProcesses() {
  if (process.platform !== 'win32') {
    const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
    if (result.status !== 0) return [];
    return String(result.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
      .filter((match) => match && /MetroForge|GeneratedGames|validate-metroidvania|apps\/cli\/dist\/index\.js|Godot/i.test(match[2]))
      .map((match) => Number.parseInt(match[1], 10))
      .filter((pid) => Number.isFinite(pid) && pid !== process.pid && pid !== process.ppid);
  }
  const command = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node.exe|godot.*' -and ($_.CommandLine -match 'MetroForge|GeneratedGames|validate-metroidvania|apps\\cli\\dist\\index.js|Godot_v4.7.1-stable_win64_console') } | Select-Object -ExpandProperty ProcessId",
  ];

  const result = spawnSync('powershell', command, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return [];
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((value) => Number.isFinite(value));
}

function terminateDetectedProcesses(ids) {
  const uniqueIds = [...new Set(ids)];
  for (const id of uniqueIds) {
    try {
      terminateProcessTree(id);
    } catch {
      // Ignore process identity edge cases; the script is meant to be conservative.
    }
  }
}

function cleanupStaleMetroforgeProcesses() {
  const ids = detectMetroforgeProcesses();
  if (ids.length === 0) return { killed: 0, ids: [] };
  terminateDetectedProcesses(ids);
  return { killed: ids.length, ids };
}

function findGodotExecutable() {
  const resolved = resolveGodotExecutableCanonical();
  return resolved.version && /^4\./.test(resolved.version) ? resolved.path : null;
}

function parseValidationReport(reportPath) {
  if (!existsSync(reportPath)) return { exists: false, passed: false, validationLevel: null, results: [] };

  try {
    const json = JSON.parse(readFileSync(reportPath, 'utf8'));
    const results = Array.isArray(json.results) ? json.results : [];
    return {
      exists: true,
      passed: Boolean(json.passed),
      validationLevel: json.validationLevel ?? null,
      results,
    };
  } catch (error) {
    return { exists: true, passed: false, validationLevel: null, results: [], error: String(error) };
  }
}

function parseProgressionProof(projectPath) {
  const proofPath = path.join(projectPath, 'progression_proof.json');
  if (!existsSync(proofPath)) return { exists: false, passed: false, routes: [], abilities: [], bossRoom: null };
  try {
    const json = JSON.parse(readFileSync(proofPath, 'utf8'));
    const abilities = Array.isArray(json.abilities) ? json.abilities : [];
    const routes = Array.isArray(json.trace) ? json.trace : [];
    return {
      exists: true,
      passed: Boolean(json.passed),
      routes,
      abilities,
      bossRoom: json.bossRoom ?? json.finalBossRoom ?? null,
      bossReachable: Boolean(json.bossReachable),
      victoryAchievable: Boolean(json.victoryAchievable),
    };
  } catch (error) {
    return { exists: true, passed: false, routes: [], abilities: [], bossRoom: null, error: String(error) };
  }
}

function parseTelemetry(projectPath) {
  const telemetryPath = path.join(projectPath, 'playtest_telemetry.json');
  if (!existsSync(telemetryPath)) return { exists: false, gameComplete: false, victoryState: false };
  try {
    const json = JSON.parse(readFileSync(telemetryPath, 'utf8'));
    return {
      exists: true,
      gameComplete: Boolean(json.gameComplete ?? json.game_complete ?? json.victoryState ?? false),
      victoryState: Boolean(json.victoryState ?? json.victory_state ?? false),
      roomsVisited: json.roomsVisited ?? json.rooms_visited ?? [],
      abilitiesAfterRun: json.abilitiesAfterRun ?? json.abilities_after_run ?? [],
    };
  } catch (error) {
    return { exists: true, gameComplete: false, victoryState: false, error: String(error) };
  }
}

function runSeed(seed, godotPath) {
  const slug = `reliability-seed-${seed}`;
  const projectPath = path.join(ROOT, 'GeneratedGames', slug);
  const startedAt = new Date().toISOString();
  const before = Date.now();

  rmSync(projectPath, { recursive: true, force: true });

  const generation = spawnSync(
    process.execPath,
    [
      CLI,
      'create',
      '--prompt', PROMPT,
      '--profile', 'TINY_TEST',
      '--mode', 'LOCAL_ONLY',
      '--visual-mode', 'procedural-only',
      '--seed', String(seed),
      '--slug', slug,
      '--archetype', 'SIDE_VIEW_METROIDVANIA',
      '--skip-export',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 300000,
    },
  );

  const generationExitCode = generation.status ?? 1;
  const generationStdout = generation.stdout || '';
  const generationStderr = generation.stderr || '';
  const projectExists = existsSync(path.join(projectPath, 'project.godot'));
  const validationReport = parseValidationReport(path.join(projectPath, 'validation_report.json'));
  const progression = parseProgressionProof(projectPath);
  const telemetry = parseTelemetry(projectPath);

  let smokeResult = {
    executed: false,
    exitCode: null,
    output: '',
    passed: false,
    passFail: { passMatches: 0, failMatches: 0, explicitPass: 0, explicitFail: 0, hasVictory: false },
  };

  if (projectExists && godotPath) {
    const smoke = spawnSync(
      godotPath,
      ['--headless', '--path', projectPath, 'res://scenes/test/RuntimeSmokeTest.tscn', '--quit-after', '600'],
      { encoding: 'utf8', windowsHide: true, timeout: 180000 },
    );
    const smokeOutput = `${smoke.stdout || ''}\n${smoke.stderr || ''}`;
    const smokePass = parsePassFail(smokeOutput);
    smokeResult = {
      executed: true,
      exitCode: smoke.status ?? 1,
      output: smokeOutput,
      passFail: smokePass,
      passed: smoke.status === 0 && smokePass.explicitPass > 0 && smokePass.explicitFail === 0,
    };
  }

  let playtestResult = {
    executed: false,
    exitCode: null,
    output: '',
    passed: false,
    passFail: { passMatches: 0, failMatches: 0, explicitPass: 0, explicitFail: 0, hasVictory: false },
  };

  if (projectExists && godotPath) {
    const playtest = spawnSync(
      godotPath,
      ['--headless', '--path', projectPath, 'res://scenes/test/PlaytestRunner.tscn', '--quit-after', '12000'],
      { encoding: 'utf8', windowsHide: true, timeout: 240000 },
    );
    const playtestOutput = `${playtest.stdout || ''}\n${playtest.stderr || ''}`;
    const passInfo = parsePassFail(playtestOutput);
    playtestResult = {
      executed: true,
      exitCode: playtest.status ?? 1,
      output: playtestOutput,
      passFail: passInfo,
      passed:
        playtest.status === 0 &&
        passInfo.explicitPass > 0 &&
        passInfo.explicitFail === 0 &&
        (passInfo.hasVictory || telemetry.victoryState || /PLAYTEST_RESULTS_END|gameComplete|victoryState/i.test(playtestOutput)),
    };
  }

  const result = classifySeedResult({
    generationExitCode,
    projectExists,
    validationPassed: validationReport.passed,
    validationLevel: validationReport.validationLevel,
    smokePassed: smokeResult.passed,
    playtestPassed: playtestResult.passed,
    progressionProofPassed: progression.passed,
    progressionBossReachable: progression.bossReachable ?? progression.bossRoom !== null,
    progressionVictoryAchievable: progression.victoryAchievable ?? true,
    output: `${generationStdout}\n${generationStderr}\n${smokeResult.output}\n${playtestResult.output}`,
  });

  return {
    seed,
    slug,
    projectPath,
    startedAt,
    completedAt: new Date().toISOString(),
    generation: {
      exitCode: generationExitCode,
      durationMs: Date.now() - before,
      stdout: generationStdout,
      stderr: generationStderr,
      timedOut: generation.error && /timed out|ETIMEDOUT/i.test(String(generation.error)),
    },
    validation: {
      exists: validationReport.exists,
      passed: validationReport.passed,
      validationLevel: validationReport.validationLevel,
      results: validationReport.results,
    },
    progression,
    telemetry,
    smoke: smokeResult,
    playtest: playtestResult,
    classification: result,
    pass: result.pass,
    category: result.category,
  };
}

export function buildSummaryTable(results) {
  return results.map((record) => ({
    seed: record.seed,
    slug: record.slug,
    pass: record.pass ? 'PASS' : 'FAIL',
    category: record.category,
    generation: record.generation.exitCode,
    validation: record.validation.passed ? 'PASS' : 'FAIL',
    smoke: record.smoke.executed ? (record.smoke.passed ? 'PASS' : 'FAIL') : 'N/A',
    playtest: record.playtest.executed ? (record.playtest.passed ? 'PASS' : 'FAIL') : 'N/A',
    progression: record.progression.passed ? 'PASS' : 'FAIL',
  }));
}

function runMatrix(seeds = DEFAULT_SEEDS, godotPath = findGodotExecutable()) {
  const cleanResults = [];
  for (const seed of seeds) {
    const result = runSeed(seed, godotPath);
    cleanResults.push(result);
  }

  const outputFile = path.join(RELIABILITY_DIR, `metroidvania-${Math.min(...seeds)}-${Math.max(...seeds)}.json`);
  mkdirSync(path.dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, JSON.stringify({ generatedAt: new Date().toISOString(), godotPath, seeds, results: cleanResults }, null, 2));

  console.table(buildSummaryTable(cleanResults));
  return cleanResults;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const seedArgs = process.argv.slice(2);
  const seeds = seedArgs.length > 0 ? seedArgs.map((value) => Number(value)).filter((value) => Number.isInteger(value)) : DEFAULT_SEEDS;
  cleanupStaleMetroforgeProcesses();
  const godotPath = findGodotExecutable();
  const allResults = runMatrix(seeds, godotPath);
  const failed = allResults.filter((record) => !record.pass);
  if (failed.length > 0) {
    console.error(`\n${failed.length} seed(s) failed.`);
    process.exitCode = 1;
  }
}
