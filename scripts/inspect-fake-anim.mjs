import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'GeneratedGames/vvs-godot-spore-galleries-20260926b';
for (const name of ['production-asset-family-report.json', 'asset_coverage.json', 'generation_manifest.json']) {
  const p = join(root, name);
  if (!existsSync(p)) {
    console.log(`missing ${name}`);
    continue;
  }
  const raw = readFileSync(p, 'utf8');
  const hits = [];
  if (raw.includes('fakeAnimation')) {
    const j = JSON.parse(raw);
    const walk = (arr) => {
      if (!Array.isArray(arr)) return;
      for (const a of arr) {
        if (a && (a.fakeAnimation === true || a.id?.includes('player') || a.path?.includes('player_walk'))) {
          hits.push({ id: a.id, path: a.path, fakeAnimation: a.fakeAnimation, provider: a.provider, maturity: a.maturity });
        }
      }
    };
    walk(j.assets);
    walk(j.families);
    walk(j.items);
    if (j.spriteQa) hits.push({ spriteQa: j.spriteQa });
    if (j.fakeAnimationDetected != null) hits.push({ fakeAnimationDetected: j.fakeAnimationDetected });
  }
  console.log(name, hits.length ? JSON.stringify(hits.slice(0, 30), null, 2) : 'no fake/player hits');
}
