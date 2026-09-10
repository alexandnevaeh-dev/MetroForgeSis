import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
if (!existsSync(tsc)) {
  console.error(`TypeScript compiler not found at ${tsc}. Run pnpm install first.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [tsc, '-p', join(root, 'apps', 'cli', 'tsconfig.json')], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
process.exit(result.status ?? 1);
