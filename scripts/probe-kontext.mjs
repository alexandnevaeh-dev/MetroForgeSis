/**
 * One-shot hosted Kontext payload probe. Prints HTTP status only — never logs the API key.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadDotEnv(root) {
  const raw = readFileSync(join(root, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = /^(?:export\s+)?NVIDIA_API_KEY\s*=\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env.NVIDIA_API_KEY = v;
  }
}

function tinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAQAAAAABCAYAAAAbQvnHAAAADUlEQVR4nGP4z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

const root = process.cwd();
loadDotEnv(root);
const key = process.env.NVIDIA_API_KEY;
if (!key) {
  console.log('KONTEXT_PROBE status=NO_KEY');
  process.exit(2);
}

const player = readFileSync(
  join(
    root,
    'apps/cli/GeneratedGames/dusk-glass-lantern-keep/assets/characters/player.png',
  ),
);

const payload = {
  prompt: 'same character idle stance, feet planted, side view facing right, isolated sprite',
  seed: 77,
  width: 1024,
  height: 1024,
  image: `data:image/png;base64,${player.toString('base64')}`,
};

const res = await fetch('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-kontext-dev', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'NVCF-POLL-SECONDS': '60',
  },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(90_000),
});

const text = await res.text();
const safe = text
  .replaceAll(key, '[REDACTED]')
  .replace(/Bearer\s+\S+/g, 'Bearer [REDACTED]')
  .slice(0, 400);
console.log(`KONTEXT_PROBE http=${res.status} bytes=${text.length}`);
console.log(`KONTEXT_PROBE body=${safe}`);
void tinyPng;
