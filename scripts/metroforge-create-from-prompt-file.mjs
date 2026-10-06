/**
 * Read a UTF-8 prompt file and run `metroforge create` with remaining argv.
 * Avoids PowerShell parsing of parentheses inside --prompt strings.
 *
 * Usage (from repo root, after metroforge-env.cmd):
 *   node scripts/metroforge-create-from-prompt-file.mjs path/to/prompt.txt [create options...]
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const promptPath = process.argv[2];
if (!promptPath) {
  console.error('Usage: node scripts/metroforge-create-from-prompt-file.mjs <prompt.txt> [create options...]');
  process.exit(2);
}

const prompt = readFileSync(resolve(promptPath), 'utf8').replace(/^\uFEFF/, '').trim();
if (!prompt) {
  console.error(`Empty prompt file: ${promptPath}`);
  process.exit(2);
}

const createArgs = process.argv.slice(3);
const node = process.execPath;
const cli = resolve('apps/cli/dist/index.js');
const args = ['--no-warnings', cli, 'create', '--prompt', prompt, ...createArgs];

console.log(`[metroforge-create-from-prompt-file] prompt=${promptPath} (${prompt.length} chars)`);
console.log(`[metroforge-create-from-prompt-file] create args: ${createArgs.join(' ')}`);

const result = spawnSync(node, args, {
  stdio: 'inherit',
  env: process.env,
  cwd: process.cwd(),
  windowsHide: true,
});

process.exit(result.status == null ? 1 : result.status);
