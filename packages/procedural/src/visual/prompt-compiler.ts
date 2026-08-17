import { createHash } from 'node:crypto';
import type {
  BiomeVisualDNA,
  VisualCategory,
  VisualDNA,
  VisualPromptCompileResult,
} from '@metroforge/schemas';

export const VISUAL_PROMPT_COMPILER_VERSION = 1 as const;

export interface CompileVisualPromptInput {
  visualDNA: VisualDNA;
  biomeVisualDNA?: BiomeVisualDNA;
  category: VisualCategory;
  subject: string;
  role?: string;
  technicalSpec: {
    width: number;
    height: number;
    transparentBackground: boolean;
    tileSize?: number;
  };
  identityReference?: string;
  variantSeed?: number;
  animationState?: string;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function paletteLine(dna: VisualDNA, biome?: BiomeVisualDNA): string {
  const palette = biome?.paletteOverrides.global ?? dna.palette.global;
  return `palette ${palette.join(' ')}`;
}

function biomeLine(biome?: BiomeVisualDNA): string {
  if (!biome) return '';
  return [
    biome.displayName,
    biome.atmosphere,
    `architecture ${biome.architecture.motifs.slice(0, 3).join(', ')}`,
    `materials ${biome.terrainMaterials.map((m) => m.name).join(', ')}`,
  ]
    .filter(Boolean)
    .join(', ');
}

function categoryLocks(category: VisualCategory, transparent: boolean): string {
  const transparency = transparent ? 'transparent background, isolated, no scene backdrop' : 'full-frame composition, no letterboxing';
  switch (category) {
    case 'player':
    case 'npc':
    case 'enemy':
    case 'boss':
      return `${transparency}, single character, side view facing right, feet planted on canvas bottom`;
    case 'portrait':
      return 'bust portrait, face readable, matching costume and palette, no text';
    case 'tileset':
    case 'terrain':
      return 'tileable material, orthographic, no characters, no UI';
    case 'background':
    case 'parallax':
      return 'environment only, no characters, no UI, no logos';
    case 'ui':
    case 'hud':
    case 'icon':
      return 'UI asset, no baked readable text, no photographs';
    case 'vfx':
      return 'isolated VFX sprite, transparent background, no characters';
    default:
      return transparency;
  }
}

export function compileVisualPrompt(input: CompileVisualPromptInput): VisualPromptCompileResult {
  const { visualDNA, biomeVisualDNA, category, subject, role, technicalSpec } = input;
  const variantSeed = input.variantSeed ?? visualDNA.seed;
  const styleFingerprint = biomeVisualDNA?.styleFingerprint ?? visualDNA.styleFingerprint;
  const anchors = [...visualDNA.promptAnchors, ...(biomeVisualDNA?.promptAnchors ?? [])];
  const prompt = [
    visualDNA.artStyle.label,
    visualDNA.renderingStyle,
    `${visualDNA.resolution.tileSize}px pixel density`,
    paletteLine(visualDNA, biomeVisualDNA),
    visualDNA.lighting.direction,
    visualDNA.lighting.contrast,
    visualDNA.materials.map((m) => m.name).join(', '),
    biomeLine(biomeVisualDNA),
    role ? `gameplay role: ${role}` : '',
    input.animationState ? `animation state: ${input.animationState}` : '',
    input.identityReference ? `identity lock: ${input.identityReference}` : '',
    categoryLocks(category, technicalSpec.transparentBackground),
    `${technicalSpec.width}x${technicalSpec.height}`,
    anchors.join(', '),
    subject,
  ]
    .filter((part) => part && part.trim())
    .join('. ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const negativePrompt = [
    ...visualDNA.forbiddenPatterns,
    ...(biomeVisualDNA?.forbiddenPatterns ?? []),
    'blurry',
    'low quality',
    'watermark',
    'photorealistic photograph',
    'mismatched art style',
    'wrong palette',
  ].join(', ');

  return {
    prompt,
    negativePrompt,
    promptHash: hash(prompt),
    negativePromptHash: hash(negativePrompt),
    seed: variantSeed,
    styleFingerprint,
    compiler: 'VisualPromptCompiler',
    compilerVersion: VISUAL_PROMPT_COMPILER_VERSION,
    technicalConstraints: {
      width: technicalSpec.width,
      height: technicalSpec.height,
      transparentBackground: technicalSpec.transparentBackground,
      tileSize: technicalSpec.tileSize ?? visualDNA.resolution.tileSize,
      pixelArt: visualDNA.artStyle.renderingFamily === 'modern-pixel' || visualDNA.artStyle.renderingFamily === 'gothic',
    },
    category,
    variantSeed,
  };
}
