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
  /** Optional production polish fields — older style bibles omit these. */
  contrast: z.string().optional(),
  saturation: z.string().optional(),
  enemyProportions: z.string().optional(),
  cameraScale: z.string().optional(),
  backgroundDepthRules: z.string().optional(),
  iconStyle: z.string().optional(),
  textureDensity: z.string().optional(),
  dimension: z.enum(['2d', 'hd-2d', '2.5d', '3d']).optional(),
  /** Production style lock — present on VISUAL_VERTICAL_SLICE and new generations. */
  artStyle: z.string().optional(),
  projection: z.enum(['side-view', 'top-down']).optional(),
  targetResolution: z.object({ width: z.number(), height: z.number() }).optional(),
  internalRenderResolution: z.object({ width: z.number(), height: z.number() }).optional(),
  tileSize: z.number().int().positive().optional(),
  pixelsPerUnit: z.number().positive().optional(),
  playerSpriteWidth: z.number().int().positive().optional(),
  playerSpriteHeight: z.number().int().positive().optional(),
  enemyScaleRange: z.tuple([z.number(), z.number()]).optional(),
  bossScaleRange: z.tuple([z.number(), z.number()]).optional(),
  maximumPaletteSize: z.number().int().positive().optional(),
  shadingRules: z.string().optional(),
  highlightRules: z.string().optional(),
  lightingDirection: z.string().optional(),
  lightingContrast: z.string().optional(),
  backgroundLayerCount: z.number().int().positive().optional(),
  parallaxRules: z.string().optional(),
  animationFPS: z.number().positive().optional(),
  animationFrameRules: z.string().optional(),
  VFXScaleRules: z.string().optional(),
  UIResolution: z.object({ width: z.number(), height: z.number() }).optional(),
  cameraZoom: z.number().positive().optional(),
  cameraLookAhead: z.number().optional(),
  cameraDeadZone: z.number().optional(),
  pixelFiltering: z.enum(['nearest', 'linear']).optional(),
  nearestNeighbor: z.boolean().optional(),
  pixelSnap: z.boolean().optional(),
});

export type StyleBible = z.infer<typeof StyleBibleSchema>;
