import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import {
  generateTopDownPlayerSheet,
  topDownPlayerFrameCount,
  TOP_DOWN_FACINGS,
} from '../packages/assets/dist/index.js';

const outputDir = resolve(process.argv[2] ?? 'reports/topdown-player-v1');
mkdirSync(outputDir, { recursive: true });
const actions = ['idle', 'walk', 'run', 'attack', 'hurt', 'death'];
const manifest = [];
const thumbnails = [];

for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
  const action = actions[actionIndex];
  for (let facingIndex = 0; facingIndex < TOP_DOWN_FACINGS.length; facingIndex++) {
    const facing = TOP_DOWN_FACINGS[facingIndex];
    const buffer = generateTopDownPlayerSheet(action, facing);
    const filename = `player_${action}_${facing}.png`;
    writeFileSync(join(outputDir, filename), buffer);
    manifest.push({
      action,
      facing,
      frames: topDownPlayerFrameCount(action),
      frameSize: [64, 64],
      anchor: [32, 55],
      sha256: createHash('sha256').update(buffer).digest('hex'),
    });
    const firstFrame = await sharp(buffer)
      .extract({ left: 0, top: 0, width: 64, height: 64 })
      .resize(128, 128, { kernel: 'nearest' })
      .png()
      .toBuffer();
    thumbnails.push({ input: firstFrame, left: facingIndex * 128, top: actionIndex * 128 });
  }
}

await sharp({
  create: {
    width: TOP_DOWN_FACINGS.length * 128,
    height: actions.length * 128,
    channels: 4,
    background: '#121624',
  },
})
  .composite(thumbnails)
  .png()
  .toFile(join(outputDir, 'player-directional-contact-sheet.png'));

writeFileSync(
  join(outputDir, 'manifest.json'),
  JSON.stringify(
    {
      version: 1,
      genre: 'TOP_DOWN_ACTION_ADVENTURE',
      set: 'verdant-ruins',
      provider: 'metroforge-topdown-pixel-v1',
      productionApproved: false,
      actions,
      facings: TOP_DOWN_FACINGS,
      files: manifest,
      review:
        'Deterministic first motion family; requires in-engine motion and user visual review.',
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      outputDir,
      files: manifest.length,
      contactSheet: join(outputDir, 'player-directional-contact-sheet.png'),
    },
    null,
    2,
  ),
);
