// Expensive, Godot-dependent verification for the Metroidvania world-design validation suite
// (packages/procedural/src/world-design.ts). Deliberately separate from the fast, always-run
// vitest suite (packages/procedural/src/world-design.test.ts) — this script drives one real
// end-to-end generation through GenerationPipeline (not the CLI subprocess the other smoke
// scripts use, since FULL_WORLD_TEST_CONFIG's `worldOverride` is intentionally not exposed as a
// CLI flag — see GenerateOptions.worldOverride's own doc comment for why) at
// FULL_WORLD_TEST_CONFIG scale (4 zones, 40 rooms, profile SMALL for light asset/enemy/boss
// budgets), then runs the real Godot headless import + runtime smoke test against it, so the
// world_design_metroidvania QA gate and a genuine gameplay run are both exercised against an
// actual assembled project — not just the pure-graph checks the vitest suite already covers.
//
// Usage: pnpm smoke:world-design (after `pnpm build`).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { GenerationPipeline } from '../packages/generation/dist/index.js';
import { QAValidator } from '../packages/qa/dist/index.js';
import { resolveGodotExecutableCanonical } from '../packages/tools/dist/index.js';
import { FULL_WORLD_TEST_CONFIG, FULL_WORLD_TEST_SEEDS } from '../packages/procedural/dist/index.js';

dotenv.config({ path: join(process.cwd(), '.env') });

const root = process.cwd();
const seed = Number(process.env.METROFORGE_SMOKE_WORLD_DESIGN_SEED ?? FULL_WORLD_TEST_SEEDS[0]);
const baseSlug = process.env.METROFORGE_SMOKE_SLUG ?? 'metroforge-smoke-world-design';
const slug = existsSync(join(root, 'GeneratedGames', baseSlug))
  ? `${baseSlug}-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`
  : baseSlug;
const projectPath = join(root, 'GeneratedGames', slug);
const runtimeUserDataDir = join(root, 'GeneratedGames', `.smoke-world-design-user-data-${process.pid}`);
const reportPath = join(projectPath, 'world-design-smoke-report.json');
const startedAt = Date.now();

function findGodot() {
  const resolved = resolveGodotExecutableCanonical();
  return resolved.path && resolved.version && /^4\./.test(resolved.version)
    ? { path: resolved.path, version: resolved.version }
    : null;
}

function readJson(path, fallback = {}) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeReport(report) {
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

console.log(`Generating a full Metroidvania world (seed ${seed}, ${FULL_WORLD_TEST_CONFIG.biomeCount} zones, ${FULL_WORLD_TEST_CONFIG.roomCount} rooms) via GenerationPipeline...`);

const pipeline = new GenerationPipeline();
const result = await pipeline.run({
  prompt: 'A four-zone Metroidvania world-design smoke test: ashen foundry, flooded utility deck, overgrown reactor core, shattered archive.',
  profile: FULL_WORLD_TEST_CONFIG.profile,
  mode: 'LOCAL_ONLY',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  seed,
  slug,
  skipExport: true,
  worldOverride: { roomCount: FULL_WORLD_TEST_CONFIG.roomCount, biomeCount: FULL_WORLD_TEST_CONFIG.biomeCount },
});

if (!result.success) {
  writeReport({ generationStatus: 'FAILED', errors: result.errors, warnings: result.warnings });
  console.error('Generation failed:', result.errors.join('; '));
  process.exit(1);
}

const worldDesignReportPath = join(projectPath, 'world_design_report.txt');
const worldDesignReport = existsSync(worldDesignReportPath) ? readFileSync(worldDesignReportPath, 'utf8') : null;
const validationReport = readJson(join(projectPath, 'validation_report.json'));
const worldDesignGate = validationReport.results?.find((r) => r.gate === 'world_design_metroidvania');

const report = {
  command: 'pnpm smoke:world-design',
  seed,
  projectPath,
  timestamp: new Date().toISOString(),
  generationStatus: 'PASS',
  worldDesignGate: worldDesignGate ?? null,
  worldDesignReportPresent: worldDesignReport !== null,
  godotImport: { status: 'NOT_RUN' },
  godotRuntime: { status: 'NOT_RUN' },
  criticalPathCheck: { status: 'NOT_RUN' },
  durationMs: null,
};

console.log(`world_design_metroidvania gate: ${worldDesignGate ? (worldDesignGate.passed ? 'PASS' : 'FAIL') : 'MISSING'} — ${worldDesignGate?.message ?? ''}`);
if (worldDesignGate && !worldDesignGate.passed) {
  for (const issue of worldDesignGate.details?.issues ?? []) {
    console.log(`  - [${issue.code}] ${issue.message}`);
  }
}

const godot = findGodot();
if (!godot) {
  report.godotImport = { status: 'SKIPPED', reason: 'Godot 4 executable not found' };
  report.durationMs = Date.now() - startedAt;
  writeReport(report);
  console.log('Godot not available — structural/procedural checks above are the only evidence from this run.');
  process.exitCode = worldDesignGate?.passed ? 2 : 1;
} else {
  mkdirSync(runtimeUserDataDir, { recursive: true });
  const validator = new QAValidator();
  const importGate = validator.validateGodotHeadless(godot.path, projectPath, { userDataDir: runtimeUserDataDir });
  report.godotImport = { status: importGate.passed ? 'PASS' : 'FAIL', message: importGate.message };

  if (importGate.passed) {
    const runtimeGate = validator.validateGodotRuntime(godot.path, projectPath, { userDataDir: runtimeUserDataDir });
    report.godotRuntime = { status: runtimeGate.passed ? 'PASS' : 'FAIL', message: runtimeGate.message, state: runtimeGate.state };

    // Critical-path spot check: this world's declared progression (packages/procedural's
    // planVictoryRoute, already exercised by godot_playtest above) includes acquiring an ability
    // and using the breakable-wall / shortcut connection this module adds to return to zone 0 —
    // godot_playtest's own PASS/FAIL already covers "reached the boss following the intended
    // sequence" (see RuntimeSmokeTest.gd/PlaytestRunner.gd); this section exists to record that
    // fact plainly in this script's own report rather than only inside the Godot log.
    const runtimeOutput = String(runtimeGate.details?.output ?? '');
    const playtestReached = /playtest_reached_victory_flow.*PASS|PASS.*playtest_reached_victory_flow/i.test(runtimeOutput) || runtimeGate.details?.checks?.some((c) => c.name === 'playtest_reached_victory_flow' && c.status === 'PASS');
    report.criticalPathCheck = {
      status: playtestReached ? 'PASS' : 'UNKNOWN',
      note: 'godot_playtest (RuntimeSmokeTest.gd/PlaytestRunner.gd) already walks the full ability-gated critical path to the victory room; this field mirrors that result rather than re-simulating it.',
    };

    console.log(`Godot import: ${report.godotImport.status}`);
    console.log(`Godot runtime: ${report.godotRuntime.status}`);
    console.log(`Critical-path (via godot_playtest): ${report.criticalPathCheck.status}`);
    report.durationMs = Date.now() - startedAt;
    writeReport(report);
    process.exitCode = worldDesignGate?.passed && importGate.passed && runtimeGate.passed ? 0 : 1;
  } else {
    console.log('Godot import: FAIL —', importGate.message);
    report.durationMs = Date.now() - startedAt;
    writeReport(report);
    process.exitCode = 1;
  }
  try {
    rmSync(runtimeUserDataDir, { recursive: true, force: true });
  } catch {
    /* evidence is already written */
  }
}

console.log(`Report written to ${reportPath}`);
