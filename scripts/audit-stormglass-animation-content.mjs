/** Read-only pixel/content audit. Passing is not human-motion acceptance. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const game = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
assert.ok(process.argv[2] && process.argv[3]);
assert.match(output, /^E:[\\/]/i);
assert.ok(!existsSync(output), 'Preserve earlier audits');
const metadata = JSON.parse(readFileSync(join(game, 'assets/characters/player_animations.json'), 'utf8'));
const clips = [];
const hash = (value) => createHash('sha256').update(value).digest('hex');
for (const [name, spec] of Object.entries(metadata)) {
  const path = join(game, `assets/characters/player_${name}.png`);
  if (!existsSync(path)) {
    clips.push({ name, missing: true });
    continue;
  }
  const bytes = readFileSync(path);
  const info = await sharp(bytes).metadata();
  const frameWidth = info.width / spec.frameCount;
  const frameHashes = [];
  if (Number.isInteger(frameWidth)) {
    for (let index = 0; index < spec.frameCount; index++) {
      const pixels = await sharp(bytes).extract({ left: index * frameWidth, top: 0, width: frameWidth, height: info.height }).ensureAlpha().raw().toBuffer();
      frameHashes.push(hash(pixels));
    }
  }
  const repeatedHalf = frameHashes.length >= 4 && frameHashes.length % 2 === 0 && frameHashes.slice(0, frameHashes.length / 2).every((value, index) => value === frameHashes[index + frameHashes.length / 2]);
  clips.push({ name, sha256: hash(bytes), frameCount: spec.frameCount, fps: spec.fps, width: info.width, height: info.height, validGrid: Number.isInteger(frameWidth), uniqueFrames: new Set(frameHashes).size, repeatedHalf, frameHashes });
}
const duplicateSheets = [];
for (let a = 0; a < clips.length; a++) for (let b = a + 1; b < clips.length; b++) {
  if (clips[a].sha256 && clips[a].sha256 === clips[b].sha256) duplicateSheets.push([clips[a].name, clips[b].name]);
}
mkdirSync(output, { recursive: true });
const distinctRequired = ['walk', 'run', 'attack', 'attack_2', 'attack_3', 'hurt', 'death'];
const blockingDuplicates = duplicateSheets.filter(pair => pair.every(name => distinctRequired.includes(name)));
const technicalPassed = clips.every(clip => !clip.missing && clip.validGrid);
const productionContentPassed = technicalPassed && blockingDuplicates.length === 0;
const report = { game, clips, duplicateSheets, blockingDuplicates, technicalPassed, productionContentPassed, visualAccepted: false, scope: 'Exact sheet/frame duplicates and grid integrity. Distinct core action requirement catches aliased combos. Does not assess anatomy, alternating contact, foot sliding, pivots or loop quality.' };
writeFileSync(join(output, 'audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ clips: clips.length, technicalPassed, productionContentPassed, blockingDuplicates, repeatedHalf: clips.filter(c => c.repeatedHalf).map(c => c.name), output }));
if (process.argv.includes('--require-distinct-core') && !productionContentPassed) process.exitCode = 1;
