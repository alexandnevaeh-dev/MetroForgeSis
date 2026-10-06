/** Small follow-up on the confirmed GitHub parent, leaving the canonical index intact. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const source = resolve('.');
const store = 'E:/MetroForgeData/GitHubUpload/20261003/quantum-publish-objectdb';
const parent = '10b16a035825e476839fa44ea030e7adf37fa868';
const output = 'E:/MetroForgeData/GitHubUpload/20261003/quantum-collision-followup-' + Date.now();
const tree = join(output, 'tree');
const files = ['apps/desktop/electron/generation-bus.ts', 'apps/desktop/electron/generation-bus.test.ts', 'scripts/verify-quantum-create-ui.mjs'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.match(source, /^E:[/\\]/i);
const git = args => execFileSync('git', ['-c', 'core.autocrlf=false', '--git-dir=' + store, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
assert.equal(git(['rev-parse', 'refs/heads/codex/metroforge-epic-20261001']).trim(), parent);
mkdirSync(tree, { recursive: true });
const archive = join(output, 'parent.tar');
git(['archive', '--format=tar', '--output=' + archive, parent]);
execFileSync('tar.exe', ['-xf', archive, '-C', tree], { windowsHide: true });
const inherited = JSON.parse(readFileSync(join(tree, 'docs/verification/quantum-generation-20261002/backend-proof.json'), 'utf8'));
for (const entry of inherited.sources) assert.equal(sha(readFileSync(join(tree, entry.path))), entry.sha256, 'Parent archive changed bytes: ' + entry.path);
for (const file of files) {
  const backup = join('E:/MetroForgeData/Backups/20261003-quantum-collision', file.replaceAll('/', '__'));
  assert.equal(readFileSync(join(tree, file), 'utf8').replaceAll('\r\n', '\n'), readFileSync(backup, 'utf8').replaceAll('\r\n', '\n'), 'Unrelated unpublished changes in ' + file);
  cpSync(join(source, file), join(tree, file));
}
const workspaces = [...readdirSync(join(tree, 'packages')).map(name => 'packages/' + name), 'apps/cli', 'apps/desktop'].filter(path => existsSync(join(tree, path, 'package.json')));
const names = Object.fromEntries(workspaces.map(path => [JSON.parse(readFileSync(join(tree, path, 'package.json'), 'utf8')).name, join(tree, path)]));
function dependencies(path) {
  const origin = join(source, path, 'node_modules');
  const target = join(tree, path, 'node_modules');
  if (!existsSync(origin)) return;
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(origin, { withFileTypes: true })) {
    if (['.bin', '.vite', '@metroforge'].includes(entry.name)) continue;
    if (entry.name.startsWith('@')) {
      mkdirSync(join(target, entry.name), { recursive: true });
      for (const name of readdirSync(join(origin, entry.name))) symlinkSync(realpathSync(join(origin, entry.name, name)), join(target, entry.name, name), 'junction');
    } else symlinkSync(realpathSync(join(origin, entry.name)), join(target, entry.name), 'junction');
  }
  mkdirSync(join(target, '@metroforge'), { recursive: true });
  for (const [name, directory] of Object.entries(names)) symlinkSync(directory, join(target, name), 'junction');
}
dependencies(''); for (const path of workspaces) dependencies(path);
const report = join(source, 'reports/game-tests/20261003-quantum-collision-publication');
mkdirSync(report, { recursive: true });
const review = { parent, source, tree, output, store, files, hashes: Object.fromEntries(files.map(file => [file, sha(readFileSync(join(tree, file)))])), status: 'prepared', originalIndexSha256: sha(readFileSync(join(source, '.git/index'))) };
writeFileSync(join(report, 'latest.json'), JSON.stringify(review, null, 2));
console.log(JSON.stringify({ tree, files, parent }));
