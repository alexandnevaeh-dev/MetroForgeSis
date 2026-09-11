import { describe, expect, it } from 'vitest';
import { decodePngRgba } from './png.js';
import { WORLD_INTERACTABLE_ASSETS, generatePropSprite, interactablePalette, actorPalette, npcActorPalette } from './prop-art.js';

function opaqueCount(png: Buffer): number {
  const { rgba } = decodePngRgba(png);
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! > 0) n += 1;
  }
  return n;
}

describe('world interactable prop art', () => {
  it('ships pickup, save shrine, and ability sprites', () => {
    expect(WORLD_INTERACTABLE_ASSETS.map((a) => a.id)).toEqual([
      'world_pickup',
      'world_save_shrine',
      'world_ability',
    ]);
  });

  it('paints opaque pixels for each interactable family', () => {
    for (const spec of WORLD_INTERACTABLE_ASSETS) {
      const png = generatePropSprite({
        width: spec.width,
        height: spec.height,
        fill: '#3a4a58',
        accent: '#c4a060',
        family: spec.family,
        seed: 42,
      });
      const decoded = decodePngRgba(png);
      expect(decoded.width).toBe(spec.width);
      expect(decoded.height).toBe(spec.height);
      expect(opaqueCount(png)).toBeGreaterThan(spec.width * spec.height * 0.12);
    }
  });

  it('does not paint interactables with the background/void swatch', () => {
    const palette = {
      global: ['#101018', '#8a6840', '#48b8c8', '#a84830'],
      accents: ['#48b8c8', '#a84830'],
      highlights: ['#325a96', '#4bc87d', '#ffe13f'],
    };
    const { fill, accent } = interactablePalette(palette);
    expect(fill).not.toBe('#101018');
    expect(fill).toBe('#8a6840');
    expect(accent).toBe('#ffe13f');
  });

  it('paints procedural actors with brass/energy, not the void sky swatch', () => {
    const palette = {
      global: ['#101018', '#8a6840', '#48b8c8', '#a84830'],
      accents: ['#48b8c8', '#a84830'],
      highlights: ['#325a96', '#4bc87d', '#ffe13f'],
    };
    const { fill, accent } = actorPalette(palette);
    expect(fill).toEqual([138, 104, 64, 255]);
    expect(accent).toEqual([255, 225, 63, 255]);
    expect(fill[0]).not.toBe(0x10);
  });

  it('paints NPC placeholders as soot couriers with a role accent, not a mustard cube', () => {
    const palette = {
      global: ['#101018', '#8a6840', '#48b8c8', '#a84830'],
      accents: ['#48b8c8', '#a84830'],
      highlights: ['#325a96', '#4bc87d', '#ffe13f'],
    };
    const { fill, accent } = npcActorPalette('quest_giver', palette);
    expect(fill[0]).toBeLessThan(120);
    expect(Math.abs(fill[0] - fill[1])).toBeLessThan(30);
    expect(accent[0]).toBeGreaterThan(accent[2]);
    expect(accent[0]).toBeGreaterThan(140);
    expect(fill[0]).not.toBe(220);
  });
});
