import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'assets/external/sunnyland_forest');
const reference = path.join(source, 'authoring_reference');
const output = path.join(source, 'authoring_handoff_batch_a');
const normalized = path.join(source, 'normalized/player');
const original = path.join(source, 'original/Sunny-land-forest-files/Assets/PNG/sprites/player');

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, 'native_reference'), { recursive: true });
const copied = [
  'SUNNYLAND_CHARACTER_REFERENCE.png', 'sunnyland-player-palette.png', 'sunnyland-player-palette.json',
  'CHARACTER_PROPORTIONS.md', 'AUTHORING_BATCH_A.md', 'FRAME_BY_FRAME_POSE_PLANS.md',
  'PLAYER_V3_1_ANIMATION_TIMING.md', 'walk_template.png', 'run_template.png',
  'jump_start_template.png', 'land_template.png', 'README_BATCH_A.md',
];
for (const file of copied) await fs.copyFile(path.join(reference, file), path.join(output, file));
for (const state of ['idle', 'jump', 'fall', 'hurt']) await fs.copyFile(path.join(normalized, `${state}.png`), path.join(output, `${state}_reference.png`));
const native = [
  ['player-idle', 'player-idle-1.png'], ['player-jump', 'player-jump-1.png'], ['player-fall', 'player-fall-1.png'],
  ['player-hurt', 'player-hurt-1.png'], ['player-skip', 'player-skip-1.png'], ['player-duck', 'player-duck-1.png'],
];
for (const [folder, file] of native) await fs.copyFile(path.join(original, folder, file), path.join(output, 'native_reference', file));

function svg(text, width, height, color = '#eef4ff') {
  return Buffer.from(`<svg width="${width}" height="${height}"><text x="4" y="16" fill="${color}" font-family="monospace" font-size="13">${text}</text></svg>`);
}
const rows = [
  ['idle_reference.png', 'EMPTY AUTHORING TARGET: WALK', 'EMPTY AUTHORING TARGET: RUN'],
  ['idle_reference.png', 'EMPTY AUTHORING TARGET: JUMP_START', 'jump_reference.png'],
  ['fall_reference.png', 'EMPTY AUTHORING TARGET: LAND', 'idle_reference.png'],
];
const composites = [];
for (let row = 0; row < rows.length; row++) {
  for (let column = 0; column < rows[row].length; column++) {
    const item = rows[row][column]; const x = column * 256, y = row * 105;
    composites.push({ input: svg(item.replace('.png', '').replaceAll('_', ' ').toUpperCase(), 248, 20), left: x, top: y });
    if (item.startsWith('EMPTY')) {
      composites.push({ input: Buffer.from('<svg width="256" height="80"><rect x="4" y="4" width="248" height="72" fill="none" stroke="#dfaa5d" stroke-width="2" stroke-dasharray="6 4"/></svg>'), left: x, top: y + 22 });
      composites.push({ input: svg(item, 248, 50, '#dfaa5d'), left: x + 4, top: y + 48 });
    } else {
      composites.push({ input: await sharp(path.join(output, item)).resize({ width: 256, height: 64, fit: 'inside', kernel: 'nearest' }).png().toBuffer(), left: x, top: y + 28 });
    }
  }
}
await sharp({ create: { width: 768, height: 315, channels: 4, background: '#17202a' } }).composite(composites).png().toFile(path.join(output, 'BATCH_A_TRANSITIONS.png'));
console.log(JSON.stringify({ output, files: (await fs.readdir(output)).length }, null, 2));