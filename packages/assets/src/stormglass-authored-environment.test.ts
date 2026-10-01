import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'authored', 'stormglass-environment');

const assets = [
  { file: 'stormglass-grand-arch-v1.png', minWidth: 900, minHeight: 900 },
  { file: 'stormglass-lancet-window-v1.png', minWidth: 900, minHeight: 1400 },
  { file: 'stormglass-platform-v1.png', minWidth: 2000, minHeight: 650 },
] as const;

const runtimeSurfaceAssets = [
  { file: 'stormglass-platform-trim-v1.png', width: 384, height: 80 },
  { file: 'stormglass-floor-strip-v1.png', width: 768, height: 64 },
] as const;

const gothicProps = [
  'gothic_prop_00_tall_lantern.png',
  'gothic_prop_01_altar_lantern.png',
  'gothic_prop_02_hanging_censer.png',
  'gothic_prop_03_broken_glass.png',
  'gothic_prop_04_reliquary_window.png',
  'gothic_prop_05_stone_pedestal.png',
  'gothic_prop_06_candle_shrine.png',
  'gothic_prop_07_wall_bracket.png',
  'gothic_prop_08_bell_fragment.png',
  'gothic_prop_09_banner.png',
  'gothic_prop_10_door_lintel.png',
  'gothic_prop_11_reliquary_marker.png',
] as const;

const conditionDecals = [
  'intact_altar.png',
  'intact_banner.png',
  'intact_sconce.png',
  'intact_statue.png',
  'flooded_waterline.png',
  'flooded_arch.png',
  'flooded_roots.png',
  'flooded_puddle.png',
  'archive_bookcase.png',
  'archive_books.png',
  'archive_rubble.png',
  'archive_balcony.png',
  'frozen_bell.png',
  'frozen_gears.png',
  'frozen_icicles.png',
  'frozen_window.png',
] as const;

describe('Stormglass authored environment kit', () => {
  it.each(assets)('$file is a detailed transparent production asset', async ({ file, minWidth, minHeight }) => {
    const image = sharp(join(root, file));
    const metadata = await image.metadata();
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.width).toBeGreaterThanOrEqual(minWidth);
    expect(metadata.height).toBeGreaterThanOrEqual(minHeight);

    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = info.width * info.height;
    let visible = 0;
    const colors = new Set<number>();
    for (let index = 0; index < data.length; index += info.channels) {
      const alpha = data[index + 3]!;
      if (alpha < 18) continue;
      visible += 1;
      colors.add((data[index]! >> 3) << 10 | (data[index + 1]! >> 3) << 5 | (data[index + 2]! >> 3));
    }
    expect(visible / pixels).toBeGreaterThan(0.08);
    expect(visible / pixels).toBeLessThan(0.82);
    expect(colors.size).toBeGreaterThan(180);

    const cornerAlpha = [
      data[3],
      data[(info.width - 1) * info.channels + 3],
      data[((info.height - 1) * info.width) * info.channels + 3],
      data[(pixels - 1) * info.channels + 3],
    ];
    expect(cornerAlpha).toEqual([0, 0, 0, 0]);
  });

	 it('ships an opaque wide drowned-monastery panorama for safe far-parallax use', async () => {
		 const image = sharp(join(root, 'stormglass-drowned-monastery-panorama-v1.png'));
		 const metadata = await image.metadata();
		 expect(metadata.width).toBeGreaterThanOrEqual(1600);
		 expect(metadata.height).toBeGreaterThanOrEqual(900);
		 expect((metadata.width ?? 0) / (metadata.height ?? 1)).toBeGreaterThan(1.7);
		 expect(metadata.hasAlpha).toBe(false);
	 });

	 it('ships one opaque wide castle-interior panorama for all Stormglass districts', async () => {
		 const image = sharp(join(root, 'stormglass-reliquary-interior-panorama-v2.png'));
		 const metadata = await image.metadata();
		 expect(metadata.width).toBeGreaterThanOrEqual(1600);
		 expect(metadata.height).toBeGreaterThanOrEqual(900);
		 expect((metadata.width ?? 0) / (metadata.height ?? 1)).toBeGreaterThan(1.7);
		 expect(metadata.hasAlpha).toBe(false);
	 });

  it('ships a transparent 4x4 authored condition-decal source atlas', async () => {
    const image = sharp(join(root, 'stormglass-condition-decals-v1.png'));
    const metadata = await image.metadata();
    expect(metadata.width).toBe(1536);
    expect(metadata.height).toBe(1024);
    expect(metadata.hasAlpha).toBe(true);
  });

  it.each(conditionDecals)('%s is a cropped transparent castle-condition decal', async (file) => {
    const image = sharp(join(root, 'condition-decals-v1', file));
    const metadata = await image.metadata();
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.width).toBeGreaterThan(120);
    expect(metadata.height).toBeGreaterThan(120);
    expect(metadata.width).toBeLessThanOrEqual(384);
    expect(metadata.height).toBeLessThanOrEqual(256);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let visible = 0;
    for (let index = 3; index < data.length; index += info.channels) {
      if (data[index]! >= 18) visible += 1;
    }
    expect(visible).toBeGreaterThan(900);
    expect(visible).toBeLessThan(info.width * info.height * 0.92);
  });

  it.each(gothicProps)('%s is a normalized transparent 128 px gameplay prop', async (file) => {
    const image = sharp(join(root, 'gothic-props-v1', file));
    const metadata = await image.metadata();
    expect(metadata.width).toBe(128);
    expect(metadata.height).toBe(128);
    expect(metadata.hasAlpha).toBe(true);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let visible = 0;
    for (let index = 3; index < data.length; index += info.channels) {
      if (data[index]! >= 18) visible += 1;
    }
    expect(visible).toBeGreaterThan(160);
    expect(visible).toBeLessThan(info.width * info.height * 0.82);
    expect(data[3]).toBe(0);
    expect(data[(info.width * info.height - 1) * info.channels + 3]).toBe(0);
  });

  it.each(runtimeSurfaceAssets)('$file is normalized for collision-aligned runtime dressing', async ({ file, width, height }) => {
    const image = sharp(join(root, file));
    const metadata = await image.metadata();
    expect(metadata.width).toBe(width);
    expect(metadata.height).toBe(height);
    expect(metadata.hasAlpha).toBe(true);
  });
});
