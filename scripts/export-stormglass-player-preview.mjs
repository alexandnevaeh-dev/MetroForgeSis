import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateStormglassPlayerSheet, stormglassFrameCount } from '../packages/assets/dist/index.js';

const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/export-stormglass-player-preview.mjs <output-directory>');
const actions = ['idle', 'walk', 'run', 'jump_start', 'jump', 'fall', 'land', 'dash', 'attack', 'hurt', 'death'];
mkdirSync(output, { recursive: true });
for (const action of actions) writeFileSync(join(output, `veilblade_${action}.png`), generateStormglassPlayerSheet(action));
writeFileSync(join(output, 'animation-manifest.json'), JSON.stringify({
  family: 'stormglass-veilblade-v1', frameSize: [64, 64], anchor: 'bottom-center', facing: 'right',
  actions: Object.fromEntries(actions.map((action) => [action, { frames: stormglassFrameCount(action), file: `veilblade_${action}.png` }])),
  status: 'candidate', productionApproved: false,
}, null, 2));
console.log(JSON.stringify({ output, sheets: actions.length }, null, 2));
