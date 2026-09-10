import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePngRgba } from '../packages/assets/dist/png.js';

const root = join(process.cwd(), 'test-packs', 'industrial-transit');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const playerMetadata = JSON.parse(readFileSync(join(root, 'characters/player/player_animations.json'), 'utf8'));
const report = { pack: manifest.id, passed: true, checkedAt: new Date().toISOString(), assets: [], issues: [] };

function bounds(rgba, width, height, x0, x1) {
  let left = x1, top = height, right = x0 - 1, bottom = -1, opaque = 0, borderOpaque = 0, hash = 2166136261;
  for (let y = 0; y < height; y++) for (let x = x0; x < x1; x++) {
    const i = (y * width + x) * 4; const a = rgba[i + 3];
    if (a < 16) continue;
    opaque++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    if (x === x0 || x === x1 - 1 || y === 0 || y === height - 1) borderOpaque++;
    hash = Math.imul(hash ^ rgba[i] ^ rgba[i + 1] ^ rgba[i + 2] ^ a, 16777619) >>> 0;
  }
  return { left: left - x0, top, right: right - x0, bottom, opaque, borderOpaque, hash };
}

for (const asset of manifest.assets) {
  const path = join(root, asset.source);
  const item = { id: asset.id, source: asset.source, passed: true, issues: [] };
  if (!existsSync(path)) item.issues.push('source file missing');
  else {
    const { rgba, width, height } = decodePngRgba(readFileSync(path));
    if (asset.animation?.[0] && width !== asset.nativeDimensions.width * asset.animation[0].frameCount) item.issues.push(`width ${width} does not match manifest grid`);
    if (height !== asset.nativeDimensions.height) item.issues.push(`height ${height} does not match manifest grid`);
    const state = asset.animation?.[0];
    const frameWidth = state?.frameSize?.[0] ?? asset.nativeDimensions.width;
    const frameCount = state?.frameCount ?? Math.floor(width / frameWidth);
    if (asset.family === 'character') {
      if (width % frameWidth !== 0) item.issues.push(`width ${width} is not divisible by ${frameWidth}px frame width`);
      const frames = [];
      for (let frame = 0; frame < frameCount; frame++) frames.push(bounds(rgba, width, height, frame * frameWidth, (frame + 1) * frameWidth));
      if (frames.some((frame) => frame.opaque < 30)) item.issues.push('empty animation frame');
      if (new Set(frames.map((frame) => frame.hash)).size < 2 && frameCount > 1) item.issues.push('duplicate frames masquerading as animation');
      if (frames.some((frame) => frame.borderOpaque > frame.opaque * 0.35)) item.issues.push('opaque background or clipped frame');
      const baseline = Math.max(...frames.map((frame) => frame.bottom)) - Math.min(...frames.map((frame) => frame.bottom));
      const widths = frames.map((frame) => Math.max(1, frame.right - frame.left + 1));
      const scaleVariance = (Math.max(...widths) - Math.min(...widths)) / Math.max(...widths);
      if (state && ['idle', 'run', 'land', 'attack_1', 'attack_2', 'hurt', 'death', 'interact'].includes(state.id) && baseline > 2) item.issues.push(`ground baseline variance ${baseline}px`);
      if (scaleVariance > 0.45) item.issues.push(`scale variance ${(scaleVariance * 100).toFixed(0)}%`);
      item.frames = frames.length; item.frameSize = state?.frameSize ?? [frameWidth, height]; item.baselineVariance = baseline; item.scaleVariance = scaleVariance;
    }
  }
  item.passed = item.issues.length === 0;
  if (!item.passed) { report.passed = false; report.issues.push(`${item.id}: ${item.issues.join('; ')}`); }
  report.assets.push(item);
}
const sourceState = { walk: 'run', jump_rise: 'jump', attack_1: 'attack', swim_move: 'swim' };
const missingStates = Object.keys(playerMetadata).filter((state) => {
  const source = sourceState[state] ?? state;
  return !existsSync(join(root, 'characters', 'player', `player_${source}.png`));
});
if (missingStates.length) { report.passed = false; report.issues.push(`missing player states: ${missingStates.join(', ')}`); }
report.playerAnimationStateCount = Object.keys(playerMetadata).length;
report.requiredStatesPresent = missingStates.length === 0;
writeFileSync(join(root, 'validation-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, assets: report.assets.length, playerStates: report.playerAnimationStateCount, issues: report.issues }, null, 2));
process.exitCode = report.passed ? 0 : 1;