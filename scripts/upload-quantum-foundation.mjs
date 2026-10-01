import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Explicit source-only follow-up; never modifies the working checkout's Git index.
const repo = resolve('.');
const report = join(repo, 'reports/game-tests/20261001-quantum-divergence');
const store = 'E:/MetroForgeData/GitHubUpload/20261001/quantum-saves.git';
const branch = 'refs/heads/codex/metroforge-epic-20261001';
const expectedParent = process.argv.find(argument => argument.startsWith('--expected-parent='))?.slice('--expected-parent='.length)
  || '3d4b4bb49efeb028454f9293bdec89177d70e465';
if (!/^[a-f0-9]{40}$/.test(expectedParent)) throw Error('Provide the verified parent commit');
const files = [
  'docs/development/QUANTUM_DIVERGENCE.md',
  'prototypes/quantum-divergence/.gitignore',
  'prototypes/quantum-divergence/project.godot',
  'prototypes/quantum-divergence/README.md',
  'prototypes/quantum-divergence/scripts/MicrocellGrid.gd',
  'prototypes/quantum-divergence/tests/SimulationTests.gd',
  'prototypes/quantum-divergence/scripts/InstrumentSimulation.gd',
  'prototypes/quantum-divergence/scripts/PlayerSimulation.gd',
  'prototypes/quantum-divergence/scripts/Playground.gd',
  'prototypes/quantum-divergence/scenes/Playground.tscn',
  'prototypes/quantum-divergence/tests/GameplayTests.gd',
  'prototypes/quantum-divergence/Run Quantum Playground.cmd',
  'scripts/verify-quantum-playground.mjs',
  'scripts/record-quantum-playground.mjs',
  'scripts/upload-quantum-foundation.mjs',
  'prototypes/quantum-divergence/scripts/MinesProgression.gd',
  'prototypes/quantum-divergence/scripts/ProgressionPlayground.gd',
  'prototypes/quantum-divergence/tests/ProgressionTests.gd',
  'prototypes/quantum-divergence/scenes/ProgressionPlayground.tscn',
  'prototypes/quantum-divergence/Run Probability Progression.cmd',
  'scripts/verify-quantum-progression.mjs',
  'prototypes/quantum-divergence/scripts/EnemySimulation.gd',
  'prototypes/quantum-divergence/scripts/CombatPlayground.gd',
  'prototypes/quantum-divergence/tests/EnemyTests.gd',
  'prototypes/quantum-divergence/scenes/CombatPlayground.tscn',
  'prototypes/quantum-divergence/Run Live Mine Encounters.cmd',
  'scripts/verify-quantum-combat.mjs',
  'prototypes/quantum-divergence/scripts/RunState.gd',
  'prototypes/quantum-divergence/scripts/SaveStore.gd',
  'prototypes/quantum-divergence/scripts/RunSession.gd',
  'prototypes/quantum-divergence/scripts/SavePlayground.gd',
  'prototypes/quantum-divergence/tests/SaveTests.gd',
  'prototypes/quantum-divergence/scenes/SavePlayground.tscn',
  'scripts/verify-quantum-save.mjs',
  'prototypes/quantum-divergence/scripts/ChunkedGrid.gd',
  'prototypes/quantum-divergence/scripts/MineWorld.gd',
  'prototypes/quantum-divergence/scripts/MineNavigator.gd',
  'prototypes/quantum-divergence/scripts/WorldPlayground.gd',
  'prototypes/quantum-divergence/tests/ChunkTests.gd',
  'prototypes/quantum-divergence/tests/WorldTests.gd',
  'prototypes/quantum-divergence/scenes/WorldPlayground.tscn',
  'prototypes/quantum-divergence/Run Probability Mines World.cmd',
  'scripts/verify-quantum-world.mjs',
  'prototypes/quantum-divergence/scripts/WorldRunDriver.gd',
  'prototypes/quantum-divergence/scripts/WorldVictoryPlayground.gd',
  'prototypes/quantum-divergence/tests/BranchTests.gd',
  'prototypes/quantum-divergence/scenes/WorldVictoryPlayground.tscn',
  'scripts/verify-quantum-world-victory.mjs',
];
const patterns = [/gh[pousr]_[A-Za-z0-9]{35,}/, /github_pat_[A-Za-z0-9_]{70,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/, /nvapi-[A-Za-z0-9_-]{45,}/,
  /AIza[0-9A-Za-z_-]{35}/, /gsk_[A-Za-z0-9]{40,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /copilot\.microsoft\.com\/(?:conversations\/join|chats)\//];
const hashes = files.map(path => {
  const bytes = readFileSync(join(repo, path));
  if (statSync(join(repo, path)).size > 1024 * 1024 || patterns.some(pattern => pattern.test(bytes.toString('utf8')))) {
    throw Error('Source review rejected ' + path);
  }
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const originalIndex = join(repo, '.git/index');
const indexHash = () => existsSync(originalIndex) ? createHash('sha256').update(readFileSync(originalIndex)).digest('hex') : null;
const beforeIndex = indexHash();
const env = { ...process.env, GIT_DIR: store, GIT_WORK_TREE: repo,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: join(repo, '.git/objects'),
  GIT_INDEX_FILE: join(report, 'quantum-upload-' + Date.now() + '.index'),
  GH_CONFIG_DIR: 'E:/MetroForgeData/AppData/GitHubCLI' };
const git = (args, input) => execFileSync('git', args, { env, input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (git(['rev-parse', branch]).trim() !== expectedParent) throw Error('Upload branch has changed; reconcile before retrying');
const remoteParent = git(['ls-remote', '--heads', 'origin', branch]).trim().split(/\s+/)[0];
if (remoteParent !== expectedParent) throw Error('Remote branch changed; do not overwrite');
git(['read-tree', expectedParent]);
git(['add', '--force', '--', ...files]);
const changes = git(['diff', '--cached', '--name-status', expectedParent]).trim();
const changedFiles = changes.split('\n').filter(Boolean).map(line => line.split('\t').at(-1));
if (!changedFiles.length || changes.split('\n').some(line => line.startsWith('D\t')) || changedFiles.some(path => !files.includes(path))) throw Error('Unexpected snapshot changes');
const mechanics = JSON.parse(readFileSync(join(report, 'mechanics-latest.json'), 'utf8'));
if (mechanics.results.some(result => result.failed !== 0) || mechanics.runtime.recalls !== 1 || mechanics.runtime.shots !== 3) throw Error('Native verification is incomplete');
const nativePassed = mechanics.results.reduce((total, result) => total + result.passed, 0);
if (!mechanics.results.some(result => result.suite === 'save' && result.passed >= 54 && result.failed === 0)) throw Error('Complete save/session verification is missing');
const progression = JSON.parse(readFileSync(join(report, 'progression-latest.json'), 'utf8'));
if (!progression.runtime.progression.extracted || progression.runtime.shots !== 33 || progression.runtime.impacts !== 2) throw Error('Progression walkthrough is incomplete');
const combat = JSON.parse(readFileSync(join(report, 'combat-latest.json'), 'utf8'));
if (!combat.runtime.progression.extracted || combat.runtime.player_hp <= 0 || Object.keys(combat.runtime.enemy_deaths).length !== 4) throw Error('Live encounter verification is incomplete');
for (const id of ['200', '301', '302', '303']) if (!(combat.runtime.enemy_active_counts[id] > 0)) throw Error('Enemy never reached its active attack');
for (const attack of ['slam', 'burst', 'roar']) if (!(combat.runtime.boss_active[attack] > 0)) throw Error('Golem active attack missing');
const saves = JSON.parse(readFileSync(join(report, 'save-control-latest.json'), 'utf8'));
if (saves.runtime.save_phase !== 'complete' || Object.keys(saves.runtime.save_checks).length !== 13 || Object.values(saves.runtime.save_checks).some(passed => passed !== true)) throw Error('Rendered suspend/death/restart control is incomplete');
const world = JSON.parse(readFileSync(join(report, 'world-latest.json'), 'utf8'));
if (world.suites.some(result => result.failed !== 0) || world.runtime.world.cells !== 1382400 || world.runtime.world.recall_stations < 2 || !world.runtime.progression.anchor_upper) throw Error('Full-size layout/traversal/entry verification is incomplete');
const worldPassed = world.suites.reduce((total,result) => total + result.passed,0);
if (worldPassed < 33 || world.suites.find(result => result.suite === 'world')?.waypoints_reached !== world.suites.find(result => result.suite === 'world')?.waypoints) throw Error('Complete physical main route is missing');
const victory = JSON.parse(readFileSync(join(report, 'world-victory-latest.json'), 'utf8'));
if (victory.branches.failed !== 0 || victory.branches.passed !== 6) throw Error('Optional physical branch traversal is missing');
const fullRun = victory.runtime;
if (fullRun.world.cells !== 1382400 || fullRun.world.recall_stations !== 8 || fullRun.player_hp <= 0 || fullRun.full_route.reached !== fullRun.full_route.waypoints) throw Error('Complete world tour is missing');
for (const key of ['anchor_upper','collapse_rift','golem_core','golem_defeated','secret_found','extracted']) if (!fullRun.progression[key]) throw Error('Full-world objective missing: ' + key);
for (const id of ['200','301','302','303']) if (!(fullRun.enemy_active_counts[id] > 0) || !(fullRun.enemy_deaths[id])) throw Error('Full-world enemy verification incomplete: ' + id);
for (const attack of ['slam','burst','roar']) if (!(fullRun.boss_active[attack] > 0)) throw Error('Full-world Golem active attack missing');
for (const id of ['echo','survey']) if (!fullRun.full_route.branches[id].outbound || !fullRun.full_route.branches[id].returned) throw Error('Branch out-and-back missing: ' + id);
for (const proof of [...progression.sources, ...combat.sources, ...saves.sources, ...world.sources, ...victory.sources]) {
  const current = createHash('sha256').update(readFileSync(join(repo, 'prototypes/quantum-divergence', proof.path))).digest('hex');
  if (current !== proof.sha256) throw Error('Native source changed after route verification: ' + proof.path);
}
const tree = git(['write-tree']).trim();
const commit = git(['commit-tree', tree, '-p', expectedParent],
  `Verify full Probability Mines combat and optional branch traversal\n\nMake ascending branch stairs advance sideways so the echo chamber can be entered and physically backtracked with the starting movement kit. Keep separately named branch routes and add an input-only complete-world playtest covering all eight landmarks, every station, three projectile-damaged crystals, four live enemy families, every Golem attack, secret reward, core stabilization and gated extraction. Verify ${nativePassed + worldPassed + victory.branches.passed} native behavior checks and a rendered ${fullRun.ticks}-tick complete tour ending at HP ${fullRun.player_hp}. Retain initial failing echo-path evidence locally. Final art/animation, durable world saves, module programming, audio and MetroForge app generation remain pending.\n`).trim();
const result = { status: 'prepared', commit, parent: expectedParent, files: hashes, tests: { nativePassed: nativePassed + worldPassed + victory.branches.passed, compactPassed: nativePassed, worldPassed, branchPassed: victory.branches.passed, nativeFailed: 0, fullWorldTicks: fullRun.ticks, fullWorldHP: fullRun.player_hp }, workingIndexPreserved: indexHash() === beforeIndex };
writeFileSync(join(report, 'github-quantum-upload.json'), JSON.stringify(result, null, 2));
git(['update-ref', branch, commit, expectedParent]);
git(['push', 'origin', branch + ':' + branch]);
const remote = git(['ls-remote', '--heads', 'origin', branch]).trim().split(/\s+/)[0];
if (remote !== commit || indexHash() !== beforeIndex) throw Error('Post-upload verification failed');
result.status = 'uploaded';
result.url = 'https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
writeFileSync(join(report, 'github-quantum-upload.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, commit, files: files.length, workingIndexPreserved: true, url: result.url }));
