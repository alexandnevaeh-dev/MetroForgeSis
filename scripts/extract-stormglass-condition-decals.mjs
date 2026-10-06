import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const input = resolve(
  process.argv[2] ?? join(root, 'packages', 'assets', 'authored', 'stormglass-environment', 'stormglass-condition-decals-v1.png'),
);
const output = resolve(
  process.argv[3] ?? join(root, 'packages', 'assets', 'authored', 'stormglass-environment', 'condition-decals-v1'),
);

const cells = [
  ['intact_altar', 'intact_banner', 'intact_sconce', 'intact_statue'],
  ['flooded_waterline', 'flooded_arch', 'flooded_roots', 'flooded_puddle'],
  ['archive_bookcase', 'archive_books', 'archive_rubble', 'archive_balcony'],
  ['frozen_bell', 'frozen_gears', 'frozen_icicles', 'frozen_window'],
];

const metadata = await sharp(input).metadata();
if (!metadata.width || !metadata.height || metadata.width % 4 !== 0 || metadata.height % 4 !== 0) {
  throw new Error(`Expected a 4x4 atlas with divisible dimensions, got ${metadata.width}x${metadata.height}`);
}
if (!metadata.hasAlpha) throw new Error('Condition decal atlas must preserve transparency');

const cellWidth = metadata.width / 4;
const cellHeight = metadata.height / 4;
mkdirSync(output, { recursive: true });

for (let row = 0; row < cells.length; row += 1) {
  for (let column = 0; column < cells[row].length; column += 1) {
    const name = cells[row][column];
    const target = join(output, `${name}.png`);
    const cell = await sharp(input)
      .extract({ left: column * cellWidth, top: row * cellHeight, width: cellWidth, height: cellHeight })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let minX = cell.info.width;
    let minY = cell.info.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < cell.info.height; y += 1) {
      for (let x = 0; x < cell.info.width; x += 1) {
        const alpha = cell.data[(y * cell.info.width + x) * cell.info.channels + 3];
        if (alpha < 18) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) throw new Error(`Atlas cell ${name} has no visible pixels`);
    const padding = 3;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(cell.info.width - 1, maxX + padding);
    maxY = Math.min(cell.info.height - 1, maxY + padding);
    await sharp(cell.data, {
      raw: { width: cell.info.width, height: cell.info.height, channels: cell.info.channels },
    })
      .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
      .png({ compressionLevel: 9 })
      .toFile(target);
    const extracted = await sharp(target).metadata();
    if (!extracted.width || !extracted.height || !extracted.hasAlpha) {
      throw new Error(`Invalid extracted decal ${name}`);
    }
    console.log(`${name}: ${extracted.width}x${extracted.height}`);
  }
}
