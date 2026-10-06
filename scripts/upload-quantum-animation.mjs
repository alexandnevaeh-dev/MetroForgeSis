import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Preserve the user's dirty checkout/index. Commit only this explicit reviewed set.
const repo = resolve('.');
const reports = join(repo, 'reports/game-tests/20261001-quantum-divergence');
const store = 'E:/MetroForgeData/GitHubUpload/20261001/quantum-saves.git';
const branch = 'refs/heads/codex/metroforge-epic-20261001';
const parent = '22847cb75b0e64e7f5e5c2f6f5b3d4e273c0e7bf';
const candidate = 'prototypes/quantum-divergence/assets/diver-candidate-v1';
const files = [
  'docs/development/QUANTUM_ART_PIPELINE.md', 'prototypes/quantum-divergence/README.md',
  'prototypes/quantum-divergence/scripts/MaterialContact.gd',
  'prototypes/quantum-divergence/scripts/PlayerSimulation.gd',
  'prototypes/quantum-divergence/scripts/EnemySimulation.gd',
  'prototypes/quantum-divergence/scripts/SpriteClipPlayer.gd',
  'prototypes/quantum-divergence/scripts/DiverAnimationReview.gd',
  'prototypes/quantum-divergence/tools/DiverRigBaker.gd',
  'prototypes/quantum-divergence/scenes/DiverAnimationReview.tscn',
  'prototypes/quantum-divergence/tests/ContactTests.gd',
  'prototypes/quantum-divergence/tests/SpriteClipTests.gd',
  'prototypes/quantum-divergence/tests/GameplayTests.gd',
  'scripts/package-quantum-diver.py', 'scripts/verify-quantum-animation.mjs',
  'scripts/verify-quantum-playground.mjs', 'scripts/verify-quantum-world.mjs',
  'scripts/verify-quantum-world-victory.mjs', 'scripts/verify-quantum-save.mjs',
  'scripts/verify-quantum-combat.mjs', 'scripts/upload-quantum-animation.mjs',
  ...['attack', 'dash', 'death', 'hit', 'idle', 'jump', 'levitate', 'run', 'walk', 'pose-review'].map(name => candidate + '/' + name + '.png'),
  ...['manifest.json', 'native-bake-receipt.json', 'quantum-diver-source.tscn', 'README.md', '.gitattributes'].map(name => candidate + '/' + name),
  'prototypes/quantum-divergence/assets/review-reference-v3/mine-wall.png',
  'prototypes/quantum-divergence/assets/review-reference-v3/README.md',
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = path => hash(readFileSync(path));
const patterns = [/gh[pousr]_[A-Za-z0-9]{35,}/, /github_pat_[A-Za-z0-9_]{70,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/, /nvapi-[A-Za-z0-9_-]{45,}/, /AIza[0-9A-Za-z_-]{35}/,
  /gsk_[A-Za-z0-9]{40,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /copilot\.microsoft\.com\/(?:conversations\/join|chats)\//];
const sources = files.map(path => {
  const bytes = readFileSync(join(repo, path));
  assert.ok(statSync(join(repo, path)).size <= 1024 * 1024 && !patterns.some(pattern => pattern.test(bytes.toString('utf8'))), 'Source review rejected: ' + path);
  return { path, sha256: hash(bytes) };
});
const proof = JSON.parse(readFileSync(join(reports, 'diver-animation-latest.json'), 'utf8'));
assert.equal(resolve(proof.candidate), resolve(repo, candidate));
assert.deepEqual(proof.suites.map(suite => [suite.passed, suite.failed]), [[22, 0], [18, 0]]);
assert.equal(Object.keys(proof.runtime.checks).length, 10);
for (const value of Object.values(proof.runtime.checks)) assert.equal(value, true);
assert.equal(proof.runtime.groundFailures, 0);
assert.ok(proof.runtime.groundChecks > 300);
assert.equal(proof.productionApproved, false);
assert.equal(proof.completeCast, false);
assert.equal(proof.video.decoded, true);
assert.equal(digest(proof.video.path), proof.video.sha256);
assert.equal(digest(join(repo, candidate, 'manifest.json')), proof.manifestSha256);
assert.equal(digest(proof.background), proof.backgroundSha256);
for (const source of proof.sources) assert.equal(digest(join(repo, source.path)), source.sha256, 'Animation source changed: ' + source.path);
const manifest = JSON.parse(readFileSync(join(repo, candidate, 'manifest.json'), 'utf8'));
for (const [path, sha] of Object.entries(manifest.hashes)) assert.equal(digest(join(repo, candidate, path)), sha);
const mechanics = JSON.parse(readFileSync(join(reports, 'mechanics-latest.json'), 'utf8'));
assert.equal(mechanics.results.reduce((sum, suite) => sum + suite.passed, 0), 206);
for (const suite of mechanics.results) assert.equal(suite.failed, 0);
assert.equal(mechanics.runtime.shots, 3);
assert.equal(mechanics.runtime.recalls, 1);
const world = JSON.parse(readFileSync(join(reports, 'world-latest.json'), 'utf8'));
assert.equal(world.suites.reduce((sum, suite) => sum + suite.passed, 0), 33);
for (const suite of world.suites) assert.equal(suite.failed, 0);
const victory = JSON.parse(readFileSync(join(reports, 'world-victory-latest.json'), 'utf8'));
assert.equal(victory.branches.passed, 6);
assert.equal(victory.branches.failed, 0);
assert.equal(victory.runtime.full_route.reached, 161);
assert.equal(victory.runtime.full_route.waypoints, 161);
assert.equal(victory.runtime.full_route.failure, '');
assert.equal(victory.runtime.world.recall_stations, 8);
assert.ok(victory.runtime.player_hp > 0);
for (const key of ['anchor_upper', 'collapse_rift', 'golem_core', 'golem_defeated', 'secret_found', 'extracted', 'exit_ready']) assert.equal(victory.runtime.progression[key], true);
for (const id of ['200', '301', '302', '303']) assert.ok(victory.runtime.enemy_deaths[id] && victory.runtime.enemy_active_counts[id] > 0);
for (const attack of ['slam', 'burst', 'roar']) assert.ok(victory.runtime.boss_active[attack] > 0);
for (const id of ['echo', 'survey']) assert.deepEqual(victory.runtime.full_route.branches[id], { outbound: true, returned: true });
const saves = JSON.parse(readFileSync(join(reports, 'save-control-latest.json'), 'utf8'));
assert.equal(Object.keys(saves.runtime.save_checks).length, 13);
for (const value of Object.values(saves.runtime.save_checks)) assert.equal(value, true);
for (const report of [world, victory, saves]) for (const source of report.sources) {
  assert.equal(digest(join(repo, 'prototypes/quantum-divergence', source.path)), source.sha256, 'World/save source changed: ' + source.path);
}
const indexPath = join(repo, '.git/index');
const originalIndex = () => existsSync(indexPath) ? digest(indexPath) : null;
const before = originalIndex();
const env = { ...process.env, GIT_DIR: store, GIT_WORK_TREE: repo,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: join(repo, '.git/objects'),
  GIT_INDEX_FILE: join(reports, 'quantum-animation-upload-' + Date.now() + '.index'),
  GH_CONFIG_DIR: 'E:/MetroForgeData/AppData/GitHubCLI' };
const git = (args, input) => execFileSync('git', args, { env, input, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
assert.equal(git(['rev-parse', branch]).trim(), parent, 'Upload branch changed; reconcile before publishing');
assert.equal(git(['ls-remote', '--heads', 'origin', branch]).trim().split(/\s+/)[0], parent, 'Remote changed; do not overwrite');
git(['read-tree', parent]);
git(['add', '--force', '--', ...files]);
const stagedBytes = path => execFileSync('git', ['show', ':' + path], { env, encoding: null, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
// Git's Windows text conversion must not invalidate the packaged source/art receipts.
assert.equal(hash(stagedBytes(candidate + '/manifest.json')), proof.manifestSha256);
for (const [path, sha] of Object.entries(manifest.hashes)) assert.equal(hash(stagedBytes(candidate + '/' + path)), sha, 'Git changed manifest-bound bytes: ' + path);
const bake = JSON.parse(readFileSync(join(repo, candidate, 'native-bake-receipt.json'), 'utf8'));
assert.equal(hash(stagedBytes('prototypes/quantum-divergence/tools/DiverRigBaker.gd')), bake.sourceScriptSha256, 'Git changed the original bake source');
const changes = git(['diff', '--cached', '--name-status', parent]).trim().split('\n').filter(Boolean);
assert.ok(changes.length && changes.every(line => !line.startsWith('D\t') && files.includes(line.split('\t').at(-1))), 'Unexpected snapshot contents');
for (const source of sources) assert.equal(digest(join(repo, source.path)), source.sha256);
const tree = git(['write-tree']).trim();
const commit = git(['commit-tree', tree, '-p', parent],
  'Fix exact actor contact and add original Diver animation review\n\nResolve fractional movement to material faces for player and grounded enemy families, without foot offsets or gap tolerances. Add 22 contact regressions and shared clip playback with 18 cadence/state checks. Package an original fixed-camera articulated Diver with 61 unique poses and retain false production/full-cast flags. Record all nine real states, Photon windups, hit/death and 426 exact grounded contacts with no gaps. Revalidate 206 behavior checks, 33 chunk/world checks, six branch checks, durable compact save/death/restart and a complete 161-waypoint full-world combat tour. Matching cast/environment, weapon aim polish, full-world saves and MetroForge generation integration remain pending.\n').trim();
assert.equal(originalIndex(), before, 'Original index changed');
const result = { status: 'prepared', commit, parent, files: sources, changes, workingIndexPreserved: true,
  tests: { nativeBehavior: 206, chunkWorld: 33, branch: 6, sharedPlayback: 18, nativeAnimation: 10,
    plantedFootChecks: proof.runtime.groundChecks, footFailures: 0, fullWorldWaypoints: 161, fullWorldHP: victory.runtime.player_hp },
  productionApproved: false, completeCast: false };
writeFileSync(join(reports, 'github-quantum-animation-upload.json'), JSON.stringify(result, null, 2));
if (!process.argv.includes('--publish')) {
  console.log(JSON.stringify({ status: result.status, commit, changedFiles: changes.length, workingIndexPreserved: true }));
} else {
  git(['update-ref', branch, commit, parent]);
  git(['push', 'origin', branch + ':' + branch]);
  assert.equal(git(['ls-remote', '--heads', 'origin', branch]).trim().split(/\s+/)[0], commit);
  assert.equal(originalIndex(), before);
  result.status = 'uploaded';
  result.url = 'https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
  writeFileSync(join(reports, 'github-quantum-animation-upload.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, commit, changedFiles: changes.length, workingIndexPreserved: true, url: result.url }));
}
