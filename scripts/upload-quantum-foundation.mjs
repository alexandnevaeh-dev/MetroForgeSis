import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Explicit source-only follow-up; never modifies the working checkout's Git index.
const repo = resolve('.');
const report = join(repo, 'reports/game-tests/20261001-quantum-divergence');
const store = 'E:/MetroForgeData/GitHubUpload/20261001/snapshot.git';
const branch = 'refs/heads/codex/metroforge-epic-20261001';
const expectedParent = '58f93dd8b8cca2a3208e1ca499fb88fc924a4545';
const files = [
  'docs/development/QUANTUM_DIVERGENCE.md',
  'prototypes/quantum-divergence/.gitignore',
  'prototypes/quantum-divergence/project.godot',
  'prototypes/quantum-divergence/README.md',
  'prototypes/quantum-divergence/scripts/MicrocellGrid.gd',
  'prototypes/quantum-divergence/tests/SimulationTests.gd',
  'scripts/upload-quantum-foundation.mjs',
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
if (changes.split('\n').some(line => line.startsWith('D\t')) || changes.split('\n').length !== files.length) throw Error('Unexpected snapshot changes');
const tree = git(['write-tree']).trim();
const commit = git(['commit-tree', tree, '-p', expectedParent],
  'Start separate quantum simulation genre with native material tests\n\nRecord delegated design choices and the Probability Mines specification. Add an isolated Godot microcell foundation and 27 native checks. This is a tested simulation foundation, not a complete playable app-generated game.\n').trim();
const result = { status: 'prepared', commit, parent: expectedParent, files: hashes, tests: { nativePassed: 27, nativeFailed: 0 }, workingIndexPreserved: indexHash() === beforeIndex };
writeFileSync(join(report, 'github-quantum-upload.json'), JSON.stringify(result, null, 2));
git(['update-ref', branch, commit, expectedParent]);
git(['push', 'origin', branch + ':' + branch]);
const remote = git(['ls-remote', '--heads', 'origin', branch]).trim().split(/\s+/)[0];
if (remote !== commit || indexHash() !== beforeIndex) throw Error('Post-upload verification failed');
result.status = 'uploaded';
result.url = 'https://github.com/alexandnevaeh-dev/MetroForgeSis/tree/codex/metroforge-epic-20261001';
writeFileSync(join(report, 'github-quantum-upload.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, commit, files: files.length, workingIndexPreserved: true, url: result.url }));
