import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const assetRoot = join(root, 'assets/external/sunnyland_forest/normalized/player_v3_1');
const scenePath = join(root, 'templates/godot-metroidvania/scenes/player/Player_V3_1_SunnyLand.tscn');
const requiredStates = [
  'idle', 'walk', 'run', 'jump_start', 'jump', 'fall', 'land', 'attack', 'attack_2', 'attack_3',
  'dash', 'air_dash', 'double_jump', 'wall_slide', 'wall_jump', 'ground_slam_start',
  'ground_slam_fall', 'ground_slam_impact', 'swim', 'swim_idle', 'grapple', 'phase', 'hurt',
  'death', 'respawn', 'interact', 'ability_acquire',
];
const directSource = new Set(['idle', 'jump', 'fall', 'hurt']);
const metadataPath = join(assetRoot, 'player_v3_1_animations.json');
const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, 'utf8')) : {};
const scene = existsSync(scenePath) ? readFileSync(scenePath, 'utf8') : '';
const failures = [];
const warnings = [];

if (requiredStates.length !== 27) failures.push('validator state contract must contain 27 states');
if (/assets\/characters\/player_/.test(scene)) failures.push('V2 player texture reference found in V3.1 scene');
for (const state of requiredStates) {
  const entry = metadata[state];
  const texturePath = join(assetRoot, `${state}.png`);
  if (!entry) failures.push(`missing metadata: ${state}`);
  if (!existsSync(texturePath)) failures.push(`missing texture: ${state}`);
  if (!entry || !existsSync(texturePath)) continue;
  const image = await sharp(texturePath).metadata();
  if (image.height !== 64 || image.width % 64 !== 0) failures.push(`invalid 64px frame grid: ${state}`);
  if (image.width / 64 !== entry.frameCount) failures.push(`frame count mismatch: ${state}`);
  if (!Number.isFinite(entry.fps) || typeof entry.loop !== 'boolean') failures.push(`invalid timing metadata: ${state}`);
  if (!directSource.has(state) && entry.derived !== true) failures.push(`missing explicit derivative declaration: ${state}`);
  if (!directSource.has(state) && entry.sourceFrames) {
    warnings.push(`${state}: uses ${entry.sourceFrames} source poses and needs manual semantic animation review`);
  }
}

// The current V3.1 builder only translates/reorders unrelated source frames for these states.
// Treat them as incomplete rather than accepting filename coverage as authored animation.
const knownPlaceholderMappings = [
  'walk', 'run', 'jump_start', 'land', 'attack', 'attack_2', 'attack_3', 'death', 'dash', 'air_dash',
  'double_jump', 'wall_slide', 'wall_jump', 'ground_slam_start', 'ground_slam_fall',
  'ground_slam_impact', 'swim', 'swim_idle', 'grapple', 'phase', 'respawn', 'interact', 'ability_acquire',
];
for (const state of knownPlaceholderMappings) {
  if (metadata[state]) failures.push(`semantically incomplete derived animation: ${state}`);
}

console.log(JSON.stringify({
  passed: failures.length === 0,
  requiredStateCount: requiredStates.length,
  stateFilesPresent: requiredStates.filter((state) => existsSync(join(assetRoot, `${state}.png`))).length,
  failures,
  warnings,
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
