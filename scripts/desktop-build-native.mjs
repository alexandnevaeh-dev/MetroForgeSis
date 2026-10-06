import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const desktop = join(root, 'apps', 'desktop');
const require = createRequire(join(desktop, 'package.json'));
const viteRequire = createRequire(require.resolve('vite/package.json'));
const esbuildRequire = createRequire(viteRequire.resolve('esbuild/package.json'));
const nativePackage = `@esbuild/${process.platform}-${process.arch}`;
const binary = esbuildRequire.resolve(
  `${nativePackage}/${process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`,
);
const stage = join(root, '.metroforge', 'desktop-build', String(Date.now()));
mkdirSync(stage, { recursive: true });

function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: desktop, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build command failed with exit code ${result.status}`);
}

// Use the executable directly: the JS esbuild service needs pipe creation that
// some Windows environments deny. No source transforms or typechecks are skipped.
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
// Electron resolves workspace packages through their dist exports. Rebuild the
// generation dependency graph first so a fresh desktop cannot run stale code.
run(process.execPath, [tsc, '--build', join(root, 'packages', 'generation', 'tsconfig.json')]);
run(process.execPath, [tsc, '-p', join(desktop, 'tsconfig.json'), '--noEmit']);
run(process.execPath, [tsc, '--build', join(desktop, 'tsconfig.electron.json'), '--force']);
run(binary, [
  'src/main.tsx',
  '--bundle',
  '--minify',
  '--format=esm',
  '--platform=browser',
  '--target=chrome130',
  '--jsx=automatic',
  '--define:process.env.NODE_ENV="production"',
  `--outdir=${join(stage, 'dist')}`,
  '--entry-names=assets/[name]',
  '--asset-names=assets/[name]-[hash]',
  '--loader:.png=file',
  '--loader:.svg=file',
  '--loader:.woff=file',
  '--loader:.woff2=file',
  `--metafile=${join(stage, 'renderer-meta.json')}`,
]);
run(binary, [
  'electron/preload.ts',
  '--bundle',
  '--format=cjs',
  '--platform=node',
  '--target=node20',
  '--external:electron',
  `--outfile=${join(stage, 'preload.cjs')}`,
]);
const output = join(stage, 'dist');
let html = readFileSync(join(desktop, 'index.html'), 'utf8');
const entry = '<script type="module" src="/src/main.tsx"></script>';
if (!html.includes(entry))
  throw new Error('Renderer HTML entry changed; update the native build adapter');
html = html.replace(entry, '<script type="module" src="./assets/main.js"></script>');
if (existsSync(join(output, 'assets', 'main.css'))) {
  html = html.replace(
    '</head>',
    '    <link rel="stylesheet" href="./assets/main.css" />\n  </head>',
  );
}
writeFileSync(join(output, 'index.html'), html);
const publicDir = join(desktop, 'public');
if (existsSync(publicDir)) cpSync(publicDir, output, { recursive: true });
// Install only after both bundles succeed. The generated HTML references only
// this build's outputs; retained older hashed assets are not loaded.
cpSync(output, join(desktop, 'dist'), { recursive: true });
cpSync(join(stage, 'preload.cjs'), join(desktop, 'dist-electron', 'preload.cjs'));
writeFileSync(
  join(desktop, 'dist', 'build-info.json'),
  JSON.stringify({ builder: 'native-esbuild', builtAt: new Date().toISOString() }, null, 2),
);
console.log(`Desktop native build complete. Build evidence: ${stage}`);
