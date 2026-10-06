/** Inspect and package named atlas regions without resampling or changing artwork bytes. */
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const image = resolve(process.argv[2]),
  game = resolve(process.argv[3]);
assert.ok(process.argv[2] && process.argv[3]);
assert.match(game, /^E:[\\/]/i);
const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.equal(info.width, 1448);
assert.equal(info.height, 1086);
const regions = {
  arch: [32, 0, 368, 416],
  window: [432, 0, 256, 416],
  shelf: [712, 0, 392, 416],
  sarcophagus: [1104, 216, 344, 200],
  bell: [48, 416, 256, 304],
  support: [400, 448, 336, 272],
  apparatus: [736, 432, 368, 288],
  sconce: [1200, 416, 240, 336],
  statue: [96, 720, 208, 366],
  banner: [448, 688, 224, 398],
  weapon_rack: [760, 728, 288, 358],
  floor_trim: [1080, 848, 368, 236],
};
const heights = {
  arch: 384,
  window: 384,
  shelf: 288,
  sarcophagus: 128,
  bell: 192,
  support: 384,
  apparatus: 160,
  sconce: 96,
  statue: 256,
  banner: 192,
  weapon_rack: 192,
  floor_trim: 64,
};
const named = {};
for (const [name, [left, top, width, height]] of Object.entries(regions)) {
  let minX = left + width,
    minY = top + height,
    maxX = -1,
    maxY = -1,
    pixels = 0;
  for (let y = top; y < top + height; y++)
    for (let x = left; x < left + width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 24) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixels++;
    }
  assert.ok(pixels > 100, name + ' has no usable alpha');
  named[name] = {
    rect: [minX, minY, maxX - minX + 1, maxY - minY + 1],
    worldHeight: heights[name],
    opaquePixels: pixels,
  };
}
const destination = join(game, 'assets/architecture/stormglass-room-family');
cpSync(image, join(destination, 'architecture-atlas.png'));
const sha256 = createHash('sha256').update(readFileSync(image)).digest('hex');
writeFileSync(
  join(destination, 'atlas.json'),
  JSON.stringify(
    {
      version: 1,
      sha256,
      regions: named,
      source: 'Built-in image generation; original Stormglass architecture study',
      productionApproved: false,
      scope:
        'Manually inspected region bounds, unchanged PNG pixels. In-game grounding, style and object isolation require native review.',
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    destination,
    regions: Object.keys(named).length,
    sha256,
    productionApproved: false,
  }),
);
