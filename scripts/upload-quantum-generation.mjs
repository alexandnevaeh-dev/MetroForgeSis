/** Publish only a byte-verified, independently tested Quantum snapshot through a separate index. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const canonical = resolve('.');
assert.match(canonical, /^E:[/\\]/i);
const report = join(canonical, 'reports/game-tests/20261002-quantum-publication');
const review = JSON.parse(readFileSync(join(report, 'latest.json'), 'utf8'));
assert.equal(review.status, 'validated');
assert.equal(review.parent, 'd0e155edfedbc25e00ad1386363fdfaa32134944');
const treeRoot = resolve(review.tree);
assert.match(treeRoot, /^E:[/\\]/i);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = path => sha(readFileSync(path));
const backend = JSON.parse(readFileSync(join(treeRoot, 'reports/game-tests/20261001-quantum-divergence/generation-latest.json'), 'utf8'));
const ui = JSON.parse(readFileSync(join(treeRoot, 'reports/game-tests/20261002-quantum-create-ui/latest.json'), 'utf8'));
const unit = JSON.parse(readFileSync(join(treeRoot, 'reports/publication-unit-tests.json'), 'utf8'));
assert.equal(backend.checks.length, 31); assert.ok(backend.checks.every(check => check.passed));
assert.equal(ui.passed, true); assert.equal(ui.checks.length, 24); assert.ok(ui.checks.every(check => check.passed));
assert.equal(unit.success, true); assert.equal(unit.numPassedTests, 29); assert.equal(unit.numFailedTests, 0);
assert.equal(ui.runtime.seed, 0); assert.equal(ui.runtime.waypoints, 161); assert.equal(ui.runtime.hp, 76); assert.equal(ui.runtime.extracted, true);
for (const source of backend.sources) assert.equal(digest(join(treeRoot, source.path)), source.sha256, 'Backend source changed after testing: ' + source.path);
for (const [path, hash] of Object.entries(ui.sourceHashes)) assert.equal(digest(join(treeRoot, path)), hash, 'App source/build changed after testing: ' + path);
const nativeDirectory = join(backend.project.outputPath, 'reports/quantum-generation/gameplay');
const native = JSON.parse(readFileSync(join(nativeDirectory, 'playground-result.json'), 'utf8'));
assert.equal(native.world.visited_waypoints, 161); assert.equal(native.player_hp, 76); assert.equal(native.progression.extracted, true);
assert.equal(native.art.floorFailures, 0); assert.equal(native.art.propFailures, 0);
assert.equal(readdirSync(nativeDirectory).filter(path => path.endsWith('.png')).length, 24);
if (backend.recording) {
  assert.equal(backend.recording.decoded, true); assert.equal(digest(backend.recording.path), backend.recording.sha256);
}
const templatePrefix = 'templates/godot-quantum-divergence/';
const template = JSON.parse(readFileSync(join(treeRoot, templatePrefix, 'quantum-template.json'), 'utf8'));
assert.equal(template.candidateOnly, true); assert.equal(template.productionApproved, false);
for (const [path, hash] of Object.entries(template.hashes)) assert.equal(digest(join(treeRoot, templatePrefix, path)), hash, 'Template changed after testing');
const patterns = [/gh[pousr]_[A-Za-z0-9]{35,}/, /github_pat_[A-Za-z0-9_]{70,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/, /nvapi-[A-Za-z0-9_-]{45,}/, /AIza[0-9A-Za-z_-]{35}/,
  /gsk_[A-Za-z0-9]{40,}/, /hf_[A-Za-z0-9]{30,}/, /AKIA[A-Z0-9]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /copilot\.microsoft\.com\/(?:conversations\/join|chats)\//];
const files = review.files;
assert.equal(new Set(files).size, files.length);
const sources = files.map(path => {
  assert.ok(!path.includes('..') && !path.startsWith('/') && !/^(?:reports|GeneratedGames|\.metroforge|node_modules|models)\//i.test(path));
  assert.ok(!/(?:^|\/)(?:\.env(?!\.example$)|\.git|\.godot|Library|Temp|Logs)(?:\/|$)/i.test(path));
  assert.ok(/\.(?:ts|tsx|mjs|gd|tscn|godot|json|md|png|css)$|(?:^|\/)\.gitattributes$/.test(path), 'Unexpected publication type: ' + path);
  const bytes = readFileSync(join(treeRoot, path));
  assert.ok(statSync(join(treeRoot, path)).size <= 1024 * 1024, 'Oversize reviewed file: ' + path);
  assert.ok(!patterns.some(pattern => pattern.test(bytes.toString('utf8'))), 'Sensitive content rejected: ' + path);
  return { path, sha256: sha(bytes), bytes: bytes.length };
});
const originalIndex = join(canonical, '.git/index');
const before = existsSync(originalIndex) ? digest(originalIndex) : null;
const store = 'E:/MetroForgeData/GitHubUpload/20261003/quantum-publish-objectdb';
const branch = 'refs/heads/codex/metroforge-epic-20261001';
const env = { ...process.env, GIT_DIR: store, GIT_WORK_TREE: treeRoot,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: join(canonical, '.git/objects'),
  GIT_INDEX_FILE: join(report, 'quantum-generation-upload-' + Date.now() + '.index'),
  GH_CONFIG_DIR: 'E:/MetroForgeData/AppData/GitHubCLI' };
const git = (args, input, binary = false) => execFileSync('git', args, { env, input, encoding: binary ? null : 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
assert.equal(git(['rev-parse', branch]).trim(), review.parent, 'Local publication branch changed');
assert.equal(git(['ls-remote', '--heads', 'origin', branch]).trim().split(/\s+/)[0], review.parent, 'GitHub changed: reconcile first');
git(['read-tree', review.parent]);
// Direct blob admission preserves tested bytes, including hash-bound template text.
for (const source of sources) {
  const bytes = readFileSync(join(treeRoot, source.path));
  assert.equal(sha(bytes), source.sha256);
  const blob = git(['hash-object', '--no-filters', '-w', '--stdin'], bytes).trim();
  git(['update-index', '--add', '--cacheinfo', '100644', blob, source.path]);
  assert.equal(sha(git(['show', ':' + source.path], undefined, true)), source.sha256, 'Admitted bytes changed');
}
const changed = git(['diff', '--cached', '--name-status', review.parent]).trim().split('\n').filter(Boolean);
assert.ok(changed.length && changed.every(line => !line.startsWith('D\t') && files.includes(line.split('\t').at(-1))));
const tree = git(['write-tree']).trim();
const commit = git(['commit-tree', tree, '-p', review.parent],
  'Add verified Quantum local game generation and desktop creation\n\nDispatch a dedicated third genre before generic room or AI generation. Verify the original matching-art runtime template, preserve entered titles and zero seeds, build actual native material terrain and report real region topology. Expose the isolated Godot preview in New Game, buffer progress until atomic assembly, prevent duplicate submissions and distinguish created files from passing gameplay tests. Validate this exact reconciled snapshot with 31 backend checks, 29 focused regressions and 24 real hidden Electron workflow checks using normal IPC and native gameplay. Preserve both older genre paths and the original working index. AI content, expanded biomes, full-world saves, audio, final visual approval and standalone export remain unfinished.\n').trim();
assert.equal(existsSync(originalIndex) ? digest(originalIndex) : null, before, 'Working index changed');
const receipt = { status: 'prepared', commit, parent: review.parent, tree, files: sources, changed,
  tests: { backend: 31, unit: 29, realDesktop: 24, waypoints: 161, seed: 0, hp: 76 },
  originalIndexSha256: before, workingIndexPreserved: true, sourceTree: treeRoot, productionReady: false };
writeFileSync(join(report, 'upload.json'), JSON.stringify(receipt, null, 2));
if (process.argv.includes('--publish')) {
  // Push the exact new child without rewriting any existing remote commit.
  git(['push', 'origin', commit + ':' + branch]);
  assert.equal(git(['ls-remote', '--heads', 'origin', branch]).trim().split(/\s+/)[0], commit);
  git(['update-ref', branch, commit, review.parent]);
  assert.equal(existsSync(originalIndex) ? digest(originalIndex) : null, before);
  receipt.status = 'uploaded';
  receipt.url = 'https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
  writeFileSync(join(report, 'upload.json'), JSON.stringify(receipt, null, 2));
}
console.log(JSON.stringify({ status: receipt.status, commit, changedFiles: changed.length, workingIndexPreserved: true, url: receipt.url }));
