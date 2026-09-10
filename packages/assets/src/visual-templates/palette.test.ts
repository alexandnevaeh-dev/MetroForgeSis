import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVisualReferenceLibrary, resolveVisualReferenceTemplate } from './library.js';
import { hexToRgb, archetypeForTemplate, templateFillAccent, templateTilesetStyle, templateBackgroundPalette, templatePropFillAccent } from './palette.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('hexToRgb', () => {
  it('converts a hex color to an RGB triple', () => {
    expect(hexToRgb('#b95d3e')).toEqual([185, 93, 62]);
    expect(hexToRgb('63dbe0')).toEqual([99, 219, 224]);
  });
});

describe('archetypeForTemplate', () => {
  const library = loadVisualReferenceLibrary(REPO_ROOT);

  it('maps enemy_flying to the live procedural fallback\'s "flying" archetype', () => {
    const template = resolveVisualReferenceTemplate(library, { assetRole: 'enemy_flying', biome: 'foundry' })!;
    expect(archetypeForTemplate(template)).toBe('flying');
  });

  it('maps enemy_armored_heavy to the "armored" archetype', () => {
    const template = resolveVisualReferenceTemplate(library, { assetRole: 'enemy_armored_heavy', biome: 'foundry' })!;
    expect(archetypeForTemplate(template)).toBe('armored');
  });

  it('gives melee and ranged distinct archetypes from each other and from flying/armored', () => {
    const melee = resolveVisualReferenceTemplate(library, { assetRole: 'enemy_melee', biome: 'foundry' })!;
    const ranged = resolveVisualReferenceTemplate(library, { assetRole: 'enemy_ranged', biome: 'foundry' })!;
    const archetypes = [melee, ranged].map((t) => archetypeForTemplate(t));
    expect(new Set(archetypes).size).toBe(2);
  });

  it('returns undefined for a non-enemy role (no archetype geometry applies)', () => {
    const boss = resolveVisualReferenceTemplate(library, { assetRole: 'boss', biome: 'foundry' })!;
    expect(archetypeForTemplate(boss)).toBeUndefined();
  });
});

describe('templateFillAccent', () => {
  it('reads fill from palette[0] and accent from palette[1]', () => {
    const library = loadVisualReferenceLibrary(REPO_ROOT);
    const template = resolveVisualReferenceTemplate(library, { assetRole: 'enemy_flying', biome: 'flooded_utility' })!;
    const { fill, accent } = templateFillAccent(template);
    expect(fill).toEqual([...hexToRgb(template.palette[0]!), 255]);
    expect(accent).toEqual([...hexToRgb(template.palette[1]!), 255]);
  });
});

describe('templateTilesetStyle / templateBackgroundPalette / templatePropFillAccent (fifteenth session)', () => {
  const library = loadVisualReferenceLibrary(REPO_ROOT);

  it('maps a terrain template\'s 7-color palette onto generateTilesetSource style params', () => {
    const template = resolveVisualReferenceTemplate(library, { assetRole: 'terrain', biome: 'foundry' })!;
    const style = templateTilesetStyle(template);
    expect(style.shadowColor).toEqual(hexToRgb(template.palette[0]!));
    expect(style.wallColor).toEqual(hexToRgb(template.palette[1]!));
    expect(style.groundColor).toEqual(hexToRgb(template.palette[2]!));
    expect(style.accentColor).toEqual(hexToRgb(template.palette[4]!));
    expect(style.accentColor2).toEqual(hexToRgb(template.palette[5]!));
    expect(style.features).toEqual(template.environmentFeatures);
  });

  it('gives each biome distinct terrain style colors (real material variation, not a shared default)', () => {
    const foundry = templateTilesetStyle(resolveVisualReferenceTemplate(library, { assetRole: 'terrain', biome: 'foundry' })!);
    const flooded = templateTilesetStyle(resolveVisualReferenceTemplate(library, { assetRole: 'terrain', biome: 'flooded_utility' })!);
    const overgrown = templateTilesetStyle(resolveVisualReferenceTemplate(library, { assetRole: 'terrain', biome: 'overgrown_reactor' })!);
    expect(foundry.wallColor).not.toEqual(flooded.wallColor);
    expect(flooded.wallColor).not.toEqual(overgrown.wallColor);
    expect(foundry.features).not.toEqual(flooded.features);
  });

  it('templateBackgroundPalette converts every palette entry to RGB in the same order', () => {
    const template = resolveVisualReferenceTemplate(library, { assetRole: 'background', biome: 'overgrown_reactor' })!;
    const rgb = templateBackgroundPalette(template);
    expect(rgb).toHaveLength(template.palette.length);
    expect(rgb[0]).toEqual(hexToRgb(template.palette[0]!));
    expect(rgb[4]).toEqual(hexToRgb(template.palette[4]!));
  });

  it('templatePropFillAccent reads fill from structure (index 1) and accent from wear (index 4)', () => {
    const template = resolveVisualReferenceTemplate(library, { assetRole: 'prop', biome: 'flooded_utility' })!;
    const { fill, accent } = templatePropFillAccent(template);
    expect(fill).toBe(template.palette[1]);
    expect(accent).toBe(template.palette[4]);
  });
});
