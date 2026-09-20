import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const projects = [
  'packages/shared/tsconfig.json',
  'packages/schemas/tsconfig.json',
  'packages/core/tsconfig.json',
  'packages/database/tsconfig.json',
  'packages/procedural/tsconfig.json',
  'packages/ai/tsconfig.json',
  'packages/assets/tsconfig.json',
  'packages/tools/tsconfig.json',
  'packages/godot/tsconfig.json',
  'packages/engines/tsconfig.json',
  'packages/unity/tsconfig.json',
  'packages/unreal/tsconfig.json',
  'packages/qa/tsconfig.json',
  'packages/generation/tsconfig.json',
  'apps/cli/tsconfig.json',
  'apps/desktop/tsconfig.electron.json',
];

if (!existsSync(tsc)) {
  console.error(`TypeScript compiler not found at ${tsc}. Run pnpm install first.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [tsc, '-b', ...projects.map((project) => join(root, project)), '--pretty', 'false'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
process.exit(result.status ?? 1);
