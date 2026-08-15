import { z } from 'zod';

export const ArtBibleSchema = z.object({
  version: z.string(),
  seed: z.number().int(),
  visualStyle: z.string(),
  palette: z.array(
    z.object({
      name: z.string(),
      hex: z.string(),
      usage: z.string(),
    }),
  ),
  characterGuidelines: z.object({
    player: z.string(),
    enemy: z.string(),
    boss: z.string(),
    npc: z.string(),
  }),
  environmentGuidelines: z.object({
    tileStyle: z.string(),
    lighting: z.string(),
    parallax: z.string(),
  }),
  uiGuidelines: z.object({
    fontStyle: z.string(),
    hudTheme: z.string(),
    iconStyle: z.string(),
  }),
  negativePrompts: z.array(z.string()),
  promptPrefixes: z.record(z.string(), z.string()),
});

export type ArtBible = z.infer<typeof ArtBibleSchema>;

export const AudioBibleSchema = z.object({
  version: z.string(),
  seed: z.number().int(),
  musicStyle: z.string(),
  moodKeywords: z.array(z.string()),
  instrumentation: z.array(z.string()),
  biomeThemes: z.array(
    z.object({
      biomeId: z.string(),
      mood: z.string(),
      tempo: z.enum(['slow', 'medium', 'fast']),
      key: z.string(),
    }),
  ),
  sfxGuidelines: z.object({
    combat: z.string(),
    movement: z.string(),
    ui: z.string(),
    ambient: z.string(),
  }),
  mixNotes: z.string(),
});

export type AudioBible = z.infer<typeof AudioBibleSchema>;

export const DesignBibleSchema = z.object({
  version: z.string(),
  seed: z.number().int(),
  art: ArtBibleSchema,
  audio: AudioBibleSchema,
});

export type DesignBible = z.infer<typeof DesignBibleSchema>;

/** Compact style spec consumed by asset prompts. Derived from ArtBible + Game DNA — not a parallel creative source. */
export const StyleBibleSchema = z.object({
  styleId: z.string(),
  renderingStyle: z.string(),
  pixelResolution: z.number().int().positive(),
  palette: ArtBibleSchema.shape.palette,
  outlineRules: z.string(),
  lighting: z.string(),
  materials: z.string(),
  characterScale: z.string(),
  spritePerspective: z.string(),
  environmentDensity: z.string(),
  VFXStyle: z.string(),
  UIStyle: z.string(),
  promptPrefixes: z.record(z.string(), z.string()),
  negativePrompts: z.array(z.string()),
});

export type StyleBible = z.infer<typeof StyleBibleSchema>;
