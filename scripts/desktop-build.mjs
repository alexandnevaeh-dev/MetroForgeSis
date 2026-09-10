import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'apps', 'desktop');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

for (const tool of [tsc, vite]) {
  if (!existsSync(tool)) {
    console.error(`Build tool not found at ${tool}. Run pnpm install first.`);
    process.exit(1);
  }
}

const electronTypecheck = spawnSync(process.execPath, [tsc, '-p', join(desktop, 'tsconfig.electron.json')], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (electronTypecheck.status !== 0) process.exit(electronTypecheck.status ?? 1);

const rendererBuild = spawnSync(process.execPath, [vite, 'build'], {
  cwd: desktop,
  stdio: 'inherit',
  windowsHide: true,
});
process.exit(rendererBuild.status ?? 1);
