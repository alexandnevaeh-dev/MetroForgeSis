/** Verify and upload the bounded history-preservation fix through an independent index. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const canonical = resolve('.');
const report = join(canonical, 'reports/game-tests/20261003-quantum-collision-publication');
const review = JSON.parse(readFileSync(join(report, 'latest.json'), 'utf8'));
assert.equal(review.parent, '10b16a035825e476839fa44ea030e7adf37fa868');
assert.match(review.tree, /^E:[/\\]/i);
const root = review.tree;
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const ui = JSON.parse(readFileSync(join(root, 'reports/game-tests/20261002-quantum-create-ui/latest.json'), 'utf8'));
const unit = JSON.parse(readFileSync(join(root, 'reports/collision-unit-tests.json'), 'utf8'));
assert.equal(ui.passed, true); assert.equal(ui.checks.length, 24); assert.ok(ui.checks.every(check => check.passed));
assert.equal(unit.success, true); assert.equal(unit.numPassedTests, 31); assert.equal(unit.numFailedTests, 0);
assert.equal(ui.runtime.seed, 0); assert.equal(ui.runtime.waypoints, 161); assert.equal(ui.runtime.hp, 76); assert.equal(ui.runtime.extracted, true);
assert.ok(ui.collisionPreservation.files >= 119); assert.deepEqual(ui.collisionPreservation.changed, []);
for (const [file, sha] of Object.entries(review.hashes)) assert.equal(digest(join(root, file)), sha);
for (const [file, sha] of Object.entries(ui.sourceHashes)) assert.equal(digest(join(root, file)), sha, 'Changed after real-app testing: ' + file);
const runtime = JSON.parse(readFileSync(join(ui.generatedProject, 'reports/quantum-generation/gameplay/playground-result.json'), 'utf8'));
assert.equal(runtime.art.floorFailures, 0); assert.equal(runtime.art.propFailures, 0);
// Reuse only the unchanged backend source proof; do not call it a fresh backend run.
const inherited = JSON.parse(readFileSync(join(root, 'docs/verification/quantum-generation-20261002/backend-proof.json'), 'utf8'));
for (const source of inherited.sources) assert.equal(digest(join(root, source.path)), source.sha256);
assert.ok(inherited.checks.length === 31 && inherited.checks.every(check => check.passed));
const template = JSON.parse(readFileSync(join(root, 'templates/godot-quantum-divergence/quantum-template.json'), 'utf8'));
for (const [file, sha] of Object.entries(template.hashes)) assert.equal(digest(join(root, 'templates/godot-quantum-divergence', file)), sha);
const evidence = 'docs/verification/quantum-collision-20261003';
mkdirSync(join(root, evidence), { recursive: true });
const files = [...review.files];
function copy(source, name) { cpSync(source, join(root, evidence, name)); files.push(evidence + '/' + name); }
copy(join(ui.output, 'proof.json'), 'app-proof.json');
copy(join(root, 'reports/collision-unit-tests.json'), 'regression-tests.json');
for (const name of ['03-result.png', '04-collision-preserved.png', '05-narrow.png']) copy(join(ui.output, name), name);
const notes = `# Quantum collision preservation\n\nA duplicate name previously preserved game configuration but appended an intake failure to the original game's history. Persistence now waits for a real job ID, discards unowned pre-job failures and retains early legacy events and events emitted before Quantum atomic assembly. The live app still reports the rejected request.\n\nThis exact isolated follow-up to ${review.parent} compiled, passed desktop renderer/main typechecks and native bundling, passed 31 focused regressions, and passed all 24 hidden real Electron workflow checks. It used normal preload IPC, no mocked generator and no OS input. The new seed-zero game completed 161 native waypoints and extracted with 76 HP. The duplicate-name attempt changed zero of ${ui.collisionPreservation.files} generated files, including history. Screenshots wait for layout transitions and two actual paint frames; capture dimensions and hidden-window state are recorded.\n\nThe earlier 31-check backend proof is inherited from the parent: all recorded backend source hashes and runtime-template hashes were rechecked unchanged. It was not rerun for this desktop-only fix. The canonical working tree has a separate passing proof; that proof was not substituted for this isolated version.\n\nFinal visual approval, AI content, expanded biomes, programming, audio, full-world saves and standalone export remain unfinished. The full desktop static audit retains its prior shared-control findings. The original canonical index and unrelated source edits were preserved.\n`;
writeFileSync(join(root, evidence, 'README.md'), notes); files.push(evidence + '/README.md');
const doc = 'docs/development/QUANTUM_GENERATION.md';
let text = readFileSync(join(root, doc), 'utf8');
text = text.replace('Uploaded mine/cast candidates are separate from the current unpublished generation changes; GitHub upload must reconcile the pre-existing local pipeline edits before claiming the newly validated backend has been published.', 'The reconciled generation batch was confirmed on GitHub as commit 10b16a035825e476839fa44ea030e7adf37fa868 on 2026-10-03. Unrelated legacy pipeline edits remain in the canonical working tree for dedicated reconciliation.');
text = text.replace('Publication is prepared for upload; the local receipt and remote commit comparison determine whether upload actually occurred.', 'Publication was uploaded and its GitHub branch ref verified on 2026-10-03 at commit 10b16a035825e476839fa44ea030e7adf37fa868.');
writeFileSync(join(root, doc), text + '\n## Duplicate-name history preservation\n\nA rejected pre-job request now leaves completed game history unchanged while retaining early events for real jobs. The exact isolated follow-up passed 31 focused regressions and 24 real-app checks, including preservation of every generated file after rejection and native 161-waypoint living extraction. See [the follow-up proof](../verification/quantum-collision-20261003/README.md). Backend source and template hashes remain identical to the preceding publication.\n'); files.push(doc);
const patterns = [/gh[pousr]_[A-Za-z0-9]{35,}/, /github_pat_[A-Za-z0-9_]{70,}/, /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/, /nvapi-[A-Za-z0-9_-]{45,}/, /AIza[0-9A-Za-z_-]{35}/, /gsk_[A-Za-z0-9]{40,}/, /hf_[A-Za-z0-9]{30,}/, /AKIA[A-Z0-9]{16}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /copilot\.microsoft\.com\/(?:conversations\/join|chats)\//];
assert.equal(new Set(files).size, files.length);
const sources = files.map(file => {
  assert.ok(review.files.includes(file) || file.startsWith(evidence + '/') || file === doc);
  assert.ok(!file.includes('..') && !file.startsWith('/') && /\.(?:ts|mjs|json|md|png)$/.test(file));
  const path = join(root, file); const bytes = readFileSync(path);
  assert.ok(statSync(path).size <= 1024 * 1024 && !patterns.some(pattern => pattern.test(bytes.toString('utf8'))), 'Unsafe publication file: ' + file);
  return { path: file, sha256: digest(path), bytes: bytes.length };
});
const index = join(canonical, '.git/index');
assert.equal(digest(index), review.originalIndexSha256);
const env = { ...process.env, GIT_DIR: review.store, GIT_WORK_TREE: root, GIT_INDEX_FILE: join(report, 'followup-' + Date.now() + '.index'), GH_CONFIG_DIR: 'E:/MetroForgeData/AppData/GitHubCLI' };
const git = (args, input, binary = false) => execFileSync('git', args, { env, input, encoding: binary ? null : 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
const branch = 'refs/heads/codex/metroforge-epic-20261001';
assert.equal(git(['rev-parse', branch]).trim(), review.parent);
assert.equal(git(['ls-remote', '--heads', 'origin', branch]).trim().split(/\s+/)[0], review.parent);
git(['read-tree', review.parent]);
for (const source of sources) {
  assert.equal(digest(join(root, source.path)), source.sha256);
  const blob = git(['hash-object', '--no-filters', '-w', '--stdin'], readFileSync(join(root, source.path))).trim();
  git(['update-index', '--add', '--cacheinfo', '100644', blob, source.path]);
  assert.equal(createHash('sha256').update(git(['show', ':' + source.path], undefined, true)).digest('hex'), source.sha256);
}
const changed = git(['diff', '--cached', '--name-status', review.parent]).trim().split('\n').filter(Boolean);
assert.ok(changed.length && changed.every(line => !line.startsWith('D\t') && files.includes(line.split('\t').at(-1))));
const tree = git(['write-tree']).trim();
const commit = git(['commit-tree', tree, '-p', review.parent], 'Preserve completed game history on rejected creation\n\nWait for generation job ownership before writing early events. Keep legacy and pre-assembly Quantum progress; drop pre-job intake failures from completed projects. Strengthen the real-app collision check to every generated file and wait for painted frames before captures. Validate the exact isolated version with 31 focused regressions and 24 real Electron checks, including native living extraction.\n').trim();
assert.equal(digest(index), review.originalIndexSha256);
const receipt = { status: 'prepared', parent: review.parent, commit, tree, sourceTree: root, files: sources, changed, originalIndexSha256: review.originalIndexSha256, workingIndexPreserved: true, tests: { unit: 31, realDesktop: 24, unchangedGameFiles: ui.collisionPreservation.files, changedGameFiles: 0, waypoints: 161, seed: 0, hp: 76, backendInherited: 31 }, productionReady: false };
writeFileSync(join(report, 'upload.json'), JSON.stringify(receipt, null, 2));
if (process.argv.includes('--publish')) {
  git(['push', 'origin', commit + ':' + branch]);
  assert.equal(git(['ls-remote', '--heads', 'origin', branch]).trim().split(/\s+/)[0], commit);
  git(['update-ref', branch, commit, review.parent]);
  assert.equal(digest(index), review.originalIndexSha256);
  receipt.status = 'uploaded'; receipt.url = 'https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
  writeFileSync(join(report, 'upload.json'), JSON.stringify(receipt, null, 2));
}
console.log(JSON.stringify({ status: receipt.status, commit, files: changed.length, tests: receipt.tests, workingIndexPreserved: true, url: receipt.url }));
