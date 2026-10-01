/**
 * Certify player walk/run sheets are articulated multi-frame (not single-frame bob).
 * Usage: node --import tsx scripts/certify-player-loco.mjs <projectDir>
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodePngRgba, computeFrameQualityMetrics } from '../packages/assets/src/png.ts';
import { PLAYER_ANIMATION_SPEC } from '../packages/assets/src/player-animation-spec.ts';

const projectDir = resolve(process.argv[2] ?? 'GeneratedGames/vvs-godot-spore-galleries-20260926b');
const chars = join(projectDir, 'assets', 'characters');
const reviewPath = join(projectDir, 'visual_review.json');

function certify(name, expectedFrames, minUnique) {
  const path = join(chars, name);
  if (!existsSync(path)) throw new Error(`missing ${name}`);
  const buf = readFileSync(path);
  const { rgba, width, height } = decodePngRgba(buf);
  const frameW = 64;
  const frames = Math.round(width / frameW);
  if (height !== 64) throw new Error(`${name}: height ${height} != 64`);
  if (frames < expectedFrames) throw new Error(`${name}: ${frames}f < expected ${expectedFrames}`);
  const metrics = computeFrameQualityMetrics(rgba, frameW, height, frames);
  console.log(
    `${name}: ${frames}f unique=${metrics.uniqueFrameRatio.toFixed(3)} silDelta=${metrics.meanSilhouetteDelta.toFixed(3)} drift=${metrics.contentBoundsDrift.toFixed(3)}`,
  );
  if (metrics.uniqueFrameRatio < minUnique) {
    throw new Error(`${name}: uniqueFrameRatio ${metrics.uniqueFrameRatio} < ${minUnique}`);
  }
  if (metrics.meanSilhouetteDelta < 0.01) {
    throw new Error(`${name}: meanSilhouetteDelta too low — likely bob/static`);
  }
  return metrics;
}

const walk = certify('player_walk.png', PLAYER_ANIMATION_SPEC.walk.frameCount, 0.7);
const run = certify('player_run.png', PLAYER_ANIMATION_SPEC.run.frameCount, 0.75);
const attack = certify('player_attack.png', PLAYER_ANIMATION_SPEC.attack.frameCount, 0.6);

const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
if (review.fakeAnimationDetected !== false) {
  throw new Error('visual_review.fakeAnimationDetected is still true');
}
console.log('CERTIFIED articulated loco — ready for aesthetic review');
console.log(JSON.stringify({ walk, run, attack: { unique: attack.uniqueFrameRatio } }, null, 2));
