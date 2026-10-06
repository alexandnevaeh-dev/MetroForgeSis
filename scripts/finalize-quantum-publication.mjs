import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const canonical = resolve('.');
const pointer = join(canonical, 'reports/game-tests/20261002-quantum-publication/latest.json');
const review = JSON.parse(readFileSync(pointer, 'utf8'));
assert.equal(review.status, 'ready-for-build');
assert.match(resolve(review.tree), /^E:[/\\]/i);
const tree = review.tree;
const load = path => JSON.parse(readFileSync(join(tree, path), 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const backend = load('reports/game-tests/20261001-quantum-divergence/generation-latest.json');
const ui = load('reports/game-tests/20261002-quantum-create-ui/latest.json');
const unit = load('reports/publication-unit-tests.json');
const audit = load('reports/publication-strict-audit.json');
const build = load('apps/desktop/dist/build-info.json');
review.excludedPriorEdits.push('Legacy failed-runtime proof classification corrections');
assert.equal(backend.checks.length, 31); assert.ok(backend.checks.every(check => check.passed));
assert.equal(ui.passed, true); assert.equal(ui.checks.length, 24); assert.ok(ui.checks.every(check => check.passed));
assert.equal(unit.success, true); assert.equal(unit.numPassedTests, 29); assert.equal(unit.numFailedTests, 0);
for (const source of backend.sources) assert.equal(hash(join(tree, source.path)), source.sha256);
for (const [file, expected] of Object.entries(ui.sourceHashes)) assert.equal(hash(join(tree, file)), expected);
const template = 'templates/godot-quantum-divergence/quantum-template.json';
assert.equal(hash(join(tree, template)), backend.templateSha256);
for (const [file, expected] of Object.entries(load(template).hashes)) assert.equal(hash(join(tree, 'templates/godot-quantum-divergence', file)), expected);
assert.ok(!audit.findings.some(finding => /CreateScreen|creation-contract/.test(finding.file)));
assert.ok(realpathSync(join(tree, 'apps/desktop/node_modules/@metroforge/generation')).startsWith(resolve(tree)));
assert.ok(realpathSync(join(tree, 'packages/generation/node_modules/@metroforge/godot')).startsWith(resolve(tree)));
const evidence = 'docs/verification/quantum-generation-20261002';
mkdirSync(join(tree, evidence), { recursive: true });
const added = [];
const copy = (path, name) => {
  cpSync(path, join(tree, evidence, name)); added.push(evidence + '/' + name);
};
copy(join(tree, 'reports/game-tests/20261001-quantum-divergence/generation-latest.json'), 'backend-proof.json');
copy(join(tree, 'reports/game-tests/20261002-quantum-create-ui/latest.json'), 'app-proof.json');
copy(join(tree, 'reports/publication-unit-tests.json'), 'regression-tests.json');
copy(join(tree, 'reports/publication-strict-audit.json'), 'desktop-audit.json');
copy(join(tree, 'apps/desktop/dist/build-info.json'), 'desktop-build.json');
for (const name of ['01-ready.png', '02-generating.png', '03-result.png', '04-collision-preserved.png', '05-narrow.png']) copy(join(ui.output, name), name);
cpSync(join(canonical, 'scripts/upload-quantum-generation.mjs'), join(tree, 'scripts/upload-quantum-generation.mjs'));
added.push('scripts/upload-quantum-generation.mjs');
const provenance = { completedAt: new Date().toISOString(), parent: review.parent,
  sourceScope: 'Published baseline plus independently reconciled Quantum changes; current working source and index preserved',
  backendChecks: 31, realAppChecks: 24, regressionChecks: 29,
  workspaceImports: 'Isolated publication packages; existing E: third-party runtimes',
  generatedGame: { title: 'Quantum UI Expedition', ...ui.runtime },
  earlierCaptureFailures: { runs: ['1790930045532', '1791045476283'], passed: false, reason: 'Timed out during narrow viewport screenshot after 21 passing checks; retained separately, not counted as passing' },
  desktopAudit: audit.summary, fullDesktopCompliance: false, productionReady: false,
  excludedPriorEdits: review.excludedPriorEdits, build };
writeFileSync(join(tree, evidence, 'provenance.json'), JSON.stringify(provenance, null, 2));
added.push(evidence + '/provenance.json');
writeFileSync(join(tree, evidence, 'README.md'), `# Quantum publication verification\n\nThis batch was prepared from published parent ${review.parent}. The original working source and index were preserved. Existing third-party dependencies remained on E:, and every MetroForge workspace import used the isolated publication packages.\n\nThe reconciled source compiled and the desktop native build passed. The exact source/bundle fingerprints are in the backend and app proofs. All 31 backend checks, 29 regression tests and 24 real hidden Electron workflow checks passed. The app used normal preload IPC, created a fresh seed-zero game, traversed all 161 waypoints and extracted alive with 76 HP. No generator mock or OS-level input was used.\n\nTwo earlier runs completed creation/gameplay and 21 checks, then timed out capturing the narrow view. They remain failed runs; their checks were not substituted for this fresh complete run. The test harness now uses Electron capturePage with stayHidden/stayAwake, waits for real frames and finite layout transitions, and records exact capture/viewport dimensions. Production app settings remain unchanged.\n\nSee the five screenshots for ready, busy, successful result, collision preservation and narrow layout. The JSON records include E:-resident machine paths for locating local artifacts; recreate fresh proofs with the verification scripts after cloning on E:. Videos and generated projects remain local and are not included in this source batch.\n\nThe full desktop static audit still reports ${audit.summary.errors} historical/shared-control findings. No creation-screen finding remains. This is not a full application compliance pass. Quantum remains a Godot local Probability Mines candidate: final visual approval, AI content generation, instrument programming, deeper biomes, production audio, durable full-world saves, editor/engine ports and standalone export remain unfinished. Top-down and Metroidvania sets remain separate.\n`);
added.push(evidence + '/README.md');
const doc = join(tree, 'docs/development/QUANTUM_GENERATION.md');
const text = readFileSync(doc, 'utf8');
writeFileSync(doc, text + `\n## Reconciled publication batch\n\nThe exact publication source has its own fresh 31-check backend proof, 29-test regression report and 24-check real desktop workflow proof. See [the publication verification](../verification/quantum-generation-20261002/README.md). Source/bundle hashes and capture files belong to that isolated version; older canonical working-tree proofs are separate. The two earlier screenshot runs remain recorded as failed. Publication is prepared for upload; the local receipt and remote commit comparison determine whether upload actually occurred. Unrelated legacy AI-progress, async QA-worker, failed-runtime classification and early-preview changes remain in the canonical working tree for dedicated reconciliation and validation.\n`);
review.files = [...new Set([...review.files, ...added])].sort();
review.status = 'validated';
review.validation = provenance;
review.publicationHashes = Object.fromEntries(review.files.map(file => [file, hash(join(tree, file))]));
writeFileSync(join(review.output, 'review.json'), JSON.stringify(review, null, 2));
writeFileSync(pointer, JSON.stringify(review, null, 2));
console.log(JSON.stringify({ status: review.status, files: review.files.length, backend: 31, regressions: 29, realApp: 24, fullDesktopCompliance: false }));
