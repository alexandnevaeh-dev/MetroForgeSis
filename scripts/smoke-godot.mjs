import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import dotenv from 'dotenv';
import { QAValidator } from '../packages/qa/dist/index.js';
import { resolveGodotExecutableCanonical } from '../packages/tools/dist/index.js';

dotenv.config({ path: join(process.cwd(), '.env') });

const root = process.cwd();
const baseSlug = process.env.METROFORGE_SMOKE_SLUG ?? 'metroforge-smoke-metroidvania';
const slug = existsSync(join(root, 'GeneratedGames', baseSlug))
  ? `${baseSlug}-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`
  : baseSlug;
const projectPath = join(root, 'GeneratedGames', slug);
const cli = join(root, 'apps', 'cli', 'dist', 'index.js');
const runtimeUserDataDir = join(root, 'GeneratedGames', `.smoke-user-data-${process.pid}`);
const reportPath = join(projectPath, 'metroforge-validation.json');
const startedAt = Date.now();

function findGodot() {
  const resolved = resolveGodotExecutableCanonical();
  return resolved.path && resolved.version && /^4\./.test(resolved.version)
    ? { path: resolved.path, version: resolved.version }
    : null;
}

function classifyDiagnostics(output) {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const diagnostics = [];
  for (const line of lines) {
    let severity = null;
    let classification = null;
    if (/Parse Error|SCRIPT ERROR|Failed to load|Unhandled/i.test(line)) {
      severity = 'FATAL';
      classification = 'fatal_runtime_error';
    } else if (/Parameter "t" is null|texture_2d_get/i.test(line)) {
      severity = 'EXPECTED_TEST_EVENT';
      classification = 'headless_texture_unavailable';
    } else if (/this_sfx_id_does_not_exist_and_should_just_warn/i.test(line)) {
      severity = 'EXPECTED_TEST_EVENT';
      classification = 'intentional_missing_sfx_probe';
    } else if (/save file is corrupt or unreadable/i.test(line)) {
      severity = 'EXPECTED_TEST_EVENT';
      classification = 'intentional_corrupt_save_recovery_probe';
    } else if (/ObjectDB instances were leaked|resources still in use/i.test(line)) {
      severity = 'WARNING';
      classification = 'godot_shutdown_leak_diagnostic';
    } else if (/^ERROR:/i.test(line)) {
      severity = 'ERROR';
      classification = 'unknown_godot_error';
    } else if (/^WARNING:/i.test(line)) {
      severity = 'WARNING';
      classification = 'godot_warning';
    }
    if (severity) diagnostics.push({ severity, classification, message: line.slice(0, 1000) });
  }
  return diagnostics;
}

function readJson(path, fallback = {}) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

function writeReport(report) {
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

if (!existsSync(cli)) {
  console.error('CLI build is missing. Run pnpm build first.');
  process.exit(1);
}

mkdirSync(runtimeUserDataDir, { recursive: true });
const generated = spawnSync(process.execPath, [
  cli, 'create',
  '--prompt', 'A deterministic MetroForge smoke-test metroidvania with one room, one enemy, one ability gate, and one completion objective.',
  '--profile', 'TINY_TEST', '--mode', 'LOCAL_ONLY', '--seed', '424242', '--slug', slug, '--skip-export',
], { cwd: root, stdio: 'inherit', windowsHide: true });

if (generated.status !== 0) {
  writeReport({ generationStatus: 'FAILED', certificationLevel: 'FAILED', errors: ['Smoke generation failed'], exitCode: generated.status });
  process.exit(generated.status ?? 1);
}

const godot = findGodot();
const validator = new QAValidator();
const base = readJson(join(projectPath, 'validation_report.json'));
const report = {
  metroforgeVersion: '0.1.0',
  timestamp: new Date().toISOString(),
  seed: 424242,
  projectId: slug,
  command: 'pnpm smoke:godot',
  provenance: {
    gitCommit: (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return null; } })(),
    dirtyWorktree: (() => { try { return execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0; } catch { return null; } })(),
    node: process.version,
    pnpm: (() => { try { return execFileSync('pnpm', ['--version'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return null; } })(),
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
  },
  generationStatus: 'PASS',
  assemblyStatus: existsSync(join(projectPath, 'project.godot')) ? 'PASS' : 'FAIL',
  structuralValidation: base.passed === true ? 'PASS' : 'FAIL',
  importValidation: { status: 'NOT_RUN' },
  runtimeValidation: { status: 'NOT_RUN' },
  gameplayReady: { status: 'NOT_RUN' },
  runtimeChecks: { status: 'NOT_RUN', passed: 0, total: 0, failed: [] },
  screenshotCapture: { status: 'NOT_RUN', validity: 'NOT_RUN' },
  visualValidation: 'NOT_RUN',
  diagnostics: [],
  shutdown: { status: 'NOT_RUN', exitCode: null },
  fallbackStatus: { providerFallbacks: ['LOCAL_ONLY / deterministic fallback may be used'], assetFallbacks: [] },
  certificationLevel: 'NEEDS_RUNTIME_VALIDATION',
  durationMs: null,
};

if (!godot) {
  report.diagnostics.push({ severity: 'WARNING', classification: 'godot_not_available', message: 'Godot 4 executable not found' });
  report.durationMs = Date.now() - startedAt;
  writeReport(report);
  console.log('Godot Validation: NOT RUN');
  console.log('Runtime Validation: NOT RUN');
  console.log('Export Certification: UNVERIFIED');
  console.log('Certification: NEEDS_RUNTIME_VALIDATION');
  process.exitCode = 2;
} else {
  report.provenance.godot = godot.version;
  const importGate = validator.validateGodotHeadless(godot.path, projectPath, { userDataDir: runtimeUserDataDir });
  report.importValidation = { status: importGate.passed ? 'PASS' : 'FAIL', message: importGate.message, details: importGate.details };

  if (importGate.passed) {
    const runtimeGate = validator.validateGodotRuntime(godot.path, projectPath, { userDataDir: runtimeUserDataDir });
    const runtimeOutput = String(runtimeGate.details?.output ?? '');
    const runtimeReady = runtimeGate.details?.runtimeReady === true;
    report.runtimeValidation = { status: runtimeGate.passed ? 'PASS' : 'FAIL', message: runtimeGate.message, state: runtimeGate.state };
    report.gameplayReady = { status: runtimeReady ? 'PASS' : 'FAIL', marker: runtimeGate.details?.runtimeReadyMarker ?? null };
    report.runtimeChecks = {
      status: runtimeGate.passed ? 'PASS' : 'FAIL',
      passed: Number(runtimeGate.details?.checks?.filter((check) => check.status === 'PASS').length ?? 0),
      total: Number(runtimeGate.details?.checks?.length ?? 0),
      failed: runtimeGate.details?.checks?.filter((check) => check.status === 'FAIL').map((check) => check.name) ?? [],
    };
    report.diagnostics = classifyDiagnostics(runtimeOutput);
    const screenshotGate = validator.validateGameplayScreenshot(projectPath, {
      required: false,
      godotPath: godot.path,
      headlessOutput: runtimeOutput,
      userDataDir: runtimeUserDataDir,
    });
    const capture = screenshotGate.details?.capture ?? readJson(join(projectPath, 'qa', 'capture_telemetry.json'));
    const captureValid = Boolean(capture?.attempts?.some((attempt) => attempt.decodeOk && !attempt.blank));
    report.screenshotCapture = {
      status: captureValid ? 'PASS' : 'FAIL',
      validity: captureValid ? 'PASS' : 'FAIL',
      gate: screenshotGate.message,
      telemetry: capture,
    };
    report.visualValidation = screenshotGate.passed ? 'PASS' : 'DEGRADED';
    report.shutdown = { status: runtimeGate.passed ? 'PASS' : 'FAIL', exitCode: 0 };
    const fatalUnknown = report.diagnostics.some((item) => item.severity === 'FATAL' || item.classification === 'unknown_godot_error');
    const runtimePassed = runtimeGate.passed && runtimeReady && captureValid && !fatalUnknown;
    report.certificationLevel = runtimePassed ? 'RUNTIME_VALIDATED' : 'FAILED';
    report.durationMs = Date.now() - startedAt;
    writeReport(report);
    console.log(`Godot Validation: ${report.importValidation.status}`);
    console.log(`Gameplay Ready: ${report.gameplayReady.status}`);
    console.log(`Runtime Validation: ${report.runtimeValidation.status}`);
    console.log(`Screenshot Capture: ${report.screenshotCapture.validity}`);
    console.log(`Shutdown: ${report.shutdown.status}`);
    console.log(`Certification: ${report.certificationLevel}`);
    if (!runtimePassed) process.exitCode = 1;
  } else {
    report.certificationLevel = 'FAILED';
    report.durationMs = Date.now() - startedAt;
    writeReport(report);
    console.log('Godot Validation: FAIL');
    console.log('Runtime Validation: NOT RUN');
    console.log('Certification: FAILED');
    process.exitCode = 1;
  }
}

try { rmSync(runtimeUserDataDir, { recursive: true, force: true }); } catch { /* evidence is already written */ }
