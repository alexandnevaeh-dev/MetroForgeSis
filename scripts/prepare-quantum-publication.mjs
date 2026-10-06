/** Apply only the backed-up Quantum changes onto the published tree, without touching the working index. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const source = resolve('.');
const parent = 'd0e155edfedbc25e00ad1386363fdfaa32134944';
const store = 'E:/MetroForgeData/GitHubUpload/20261001/quantum-saves.git';
const output = 'E:/MetroForgeData/GitHubUpload/20261002/quantum-publication-' + Date.now();
const tree = join(output, 'tree');
const review = join(output, 'review');
assert.match(source, /^E:[/\\]/i);
mkdirSync(tree, { recursive: true }); mkdirSync(review, { recursive: true });
const git = args => {
  const result = spawnSync('git', ['--git-dir=' + store, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  return result.stdout;
};
assert.equal(git(['rev-parse', 'refs/heads/codex/metroforge-epic-20261001']).trim(), parent);
const archive = join(output, 'published.tar');
git(['archive', '--format=tar', '--output=' + archive, parent]);
const extracted = spawnSync('tar.exe', ['-xf', archive, '-C', tree], { windowsHide: true, encoding: 'utf8' });
if (extracted.error || extracted.status !== 0) throw new Error(extracted.error?.message ?? extracted.stderr);
const genBackup = 'E:/MetroForgeData/Backups/quantum-generation-20261001';
const uiBackup = 'E:/MetroForgeData/Backups/quantum-create-ui-20261002';
const normalize = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const edited = [
  'packages/shared/src/constants.ts', 'packages/shared/src/archetypes.ts', 'packages/shared/src/archetypes.test.ts',
  'packages/schemas/src/core.ts', 'packages/schemas/src/genre.ts', 'packages/schemas/src/index.ts',
  'packages/godot/src/assembler.ts', 'packages/godot/src/index.ts',
  'packages/generation/src/pipeline.ts', 'packages/generation/src/index.ts', 'packages/generation/src/scaffold-manual-project.ts',
  'prototypes/quantum-divergence/scripts/WorldPlayground.gd', 'prototypes/quantum-divergence/scripts/MinesArtPlayground.gd',
  'apps/desktop/src/studio/CreateScreen.tsx', 'apps/desktop/src/studio/metroforge-api.ts', 'apps/desktop/src/styles.css',
  'apps/desktop/electron/main.ts', 'apps/desktop/electron/generation-bus.ts', 'apps/desktop/electron/handlers.ts',
  'apps/cli/src/commands/create.ts', 'UX-CONTRACT.md', 'prototypes/quantum-divergence/README.md', 'packages/ai/src/generators/game-dna.ts',
];
const uiFlat = { 'apps/desktop/electron/main.ts': 'main.ts', 'apps/desktop/electron/generation-bus.ts': 'generation-bus.ts',
  'apps/desktop/electron/handlers.ts': 'handlers.ts', 'apps/cli/src/commands/create.ts': 'cli-create.ts',
  'UX-CONTRACT.md': 'UX-CONTRACT.md', 'prototypes/quantum-divergence/README.md': 'quantum-README.md' };
const summary = { source, parent, output, tree, edited: [], additions: [], conflicts: [], dependencyScope: 'Existing third-party runtimes only; every MetroForge workspace import targets this isolated tree', status: 'preparing' };
const files = new Set();
for (const file of edited) {
  const current = normalize(readFileSync(join(source, file)));
  let before;
  if (file === 'packages/ai/src/generators/game-dna.ts') {
    const guard = "  if (resolveGameArchetype(input.archetype ?? inferGameArchetypeFromPrompt(input.prompt)) === 'QUANTUM_SIMULATION_ROGUELITE') {\n    throw new Error('Quantum requires its dedicated generation contract; generic room DNA is unsupported');\n  }\n";
    assert.equal(current.split(guard).length, 2, 'Original guard reconstruction must be exact');
    before = current.replace(guard, '');
  } else {
    const backup = uiFlat[file] ? join(uiBackup, uiFlat[file]) : file.startsWith('apps/') ? join(uiBackup, file) : join(genBackup, file);
    assert.ok(existsSync(backup), 'Missing before-change backup: ' + file);
    before = normalize(readFileSync(backup));
  }
  const remote = normalize(readFileSync(join(tree, file)));
  const prefix = join(review, file.replaceAll('/', '__'));
  for (const [suffix, text] of [['published', remote], ['before', before], ['current', current]]) writeFileSync(prefix + '.' + suffix, text);
  let merged;
  if (remote === before) merged = current;
  else if (remote === current) merged = current;
  else {
    const result = spawnSync('git', ['merge-file', '-p', prefix + '.published', prefix + '.before', prefix + '.current'], { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    if (result.error || result.status !== 0) {
      summary.conflicts.push({ file, status: result.status, error: result.error?.message ?? result.stderr });
      writeFileSync(prefix + '.conflict', result.stdout ?? '');
      continue;
    }
    merged = result.stdout;
  }
  assert.ok(!/^(?:<<<<<<<|=======|>>>>>>>)/m.test(merged));
  writeFileSync(join(tree, file), merged);
  files.add(file);
  summary.edited.push({ file, publishedSha256: hash(remote), beforeSha256: hash(before), currentSha256: hash(current), stagedSha256: hash(merged), priorUnpublishedChanges: remote !== before, stagedEqualsCurrent: merged === current });
}
const added = ['packages/schemas/src/quantum.ts', 'packages/godot/src/quantum-assembler.ts', 'packages/generation/src/quantum-generation.ts',
  'prototypes/quantum-divergence/scripts/GeneratedMines.gd', 'prototypes/quantum-divergence/scenes/GeneratedMines.tscn',
  'scripts/package-quantum-runtime.mjs', 'scripts/verify-quantum-generation.mjs', 'scripts/verify-quantum-create-ui.mjs', 'scripts/desktop-build-native.mjs',
  'apps/desktop/src/studio/creation-contract.ts', 'apps/desktop/src/studio/creation-contract.test.ts', 'apps/desktop/electron/generation-bus.test.ts',
  'docs/development/QUANTUM_GENERATION.md'];
function admit(file) {
  mkdirSync(dirname(join(tree, file)), { recursive: true });
  cpSync(join(source, file), join(tree, file));
  files.add(file); summary.additions.push({ file, sha256: hash(readFileSync(join(tree, file))) });
}
for (const file of added) admit(file);
function folder(relative) {
  for (const entry of readdirSync(join(source, relative), { withFileTypes: true })) {
    const file = relative + '/' + entry.name;
    if (entry.isDirectory()) folder(file); else if (entry.isFile()) admit(file); else throw new Error('Unexpected template link: ' + file);
  }
}
folder('templates/godot-quantum-divergence');
// Reuse installed external dependencies, never canonical workspace package builds.
const workspaces = [...readdirSync(join(tree, 'packages')).map(name => 'packages/' + name), 'apps/cli', 'apps/desktop'].filter(path => existsSync(join(tree, path, 'package.json')));
const names = Object.fromEntries(workspaces.map(path => [JSON.parse(readFileSync(join(tree, path, 'package.json'), 'utf8')).name, join(tree, path)]));
function dependencies(path) {
  const origin = join(source, path, 'node_modules');
  const target = join(tree, path, 'node_modules');
  if (!existsSync(origin)) return;
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(origin, { withFileTypes: true })) {
    if (entry.name === '.bin' || entry.name === '.vite' || entry.name === '@metroforge') continue;
    if (entry.name.startsWith('@')) {
      mkdirSync(join(target, entry.name), { recursive: true });
      for (const name of readdirSync(join(origin, entry.name))) symlinkSync(realpathSync(join(origin, entry.name, name)), join(target, entry.name, name), 'junction');
    } else symlinkSync(realpathSync(join(origin, entry.name)), join(target, entry.name), 'junction');
  }
  mkdirSync(join(target, '@metroforge'), { recursive: true });
  for (const [name, directory] of Object.entries(names)) symlinkSync(directory, join(target, name), 'junction');
}
dependencies(''); for (const path of workspaces) dependencies(path);
summary.files = [...files].sort();
summary.status = summary.conflicts.length ? 'needs-reconciliation' : 'ready-for-build';
writeFileSync(join(output, 'review.json'), JSON.stringify(summary, null, 2));
mkdirSync(join(source, 'reports/game-tests/20261002-quantum-publication'), { recursive: true });
writeFileSync(join(source, 'reports/game-tests/20261002-quantum-publication/latest.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ status: summary.status, tree, files: files.size, priorUnpublished: summary.edited.filter(value => value.priorUnpublishedChanges).map(value => value.file), conflicts: summary.conflicts }));
if (summary.conflicts.length) process.exitCode = 1;
