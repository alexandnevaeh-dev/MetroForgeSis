import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const p = resolve(process.argv[2] ?? 'GeneratedGames/_prompt-spore-galleries.txt');
const st = statSync(p);
const text = readFileSync(p, 'utf8').replace(/^\uFEFF/, '').trim();
console.log(`PATH=${p}`);
console.log(`BYTES=${st.size}`);
console.log(`TRIMMED_CHARS=${text.length}`);
console.log(`HEAD=${text.slice(0, 80)}`);
if (st.size < 100 || text.length < 100) {
  console.error('FAIL: prompt file too small');
  process.exit(2);
}
console.log('OK');
