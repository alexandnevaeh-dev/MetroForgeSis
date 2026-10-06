import { z } from 'zod';

export const VisualAssetQualityTierSchema = z.enum([
  'BLOCKOUT',
  'PROCEDURAL_PLACEHOLDER',
  'DRAFT_GENERATED',
  'NORMALIZED',
  'VISUALLY_VALIDATED',
  'APPROVED',
  'PRODUCTION_READY',
]);
export type VisualAssetQualityTier = z.infer<typeof VisualAssetQualityTierSchema>;

export const VisualCertificationSchema = z.enum([
  'VISUAL_UNVALIDATED',
  'VISUAL_DEGRADED',
  'VISUAL_VALIDATED',
  'VISUAL_PRODUCTION_READY',
]);
export type VisualCertification = z.infer<typeof VisualCertificationSchema>;

export const VisualConstitutionSchema = z.object({
  id: z.string(),
  version: z.string(),
  artDirection: z.string(),
  renderingStyle: z.string(),
  perspective: z.string(),
  targetResolution: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  baseSpriteScale: z.number().positive(),
  tileSize: z.number().int().positive(),
  palette: z.object({
    global: z.array(z.string()),
    shadows: z.array(z.string()),
    highlights: z.array(z.string()),
    accents: z.array(z.string()),
    ui: z.array(z.string()),
    biome: z.record(z.array(z.string())).default({}),
  }),
  lighting: z.object({ direction: z.string(), contrast: z.string(), ambient: z.string(), emissive: z.string() }),
  language: z.object({
    characters: z.string(),
    environments: z.string(),
    enemies: z.string(),
    bosses: z.string(),
    props: z.string(),
    ui: z.string(),
    vfx: z.string(),
  }),
  silhouetteRules: z.array(z.string()),
  materialRules: z.array(z.string()),
  animationRules: z.array(z.string()),
  forbiddenTraits: z.array(z.string()),
  consistencyConstraints: z.array(z.string()),
  provenance: z.object({ source: z.string(), seed: z.number().int(), generatedAt: z.string() }),
});
export type VisualConstitution = z.infer<typeof VisualConstitutionSchema>;

export function visualConstitutionIsStale(assetVersion: string | undefined, constitutionVersion: string): boolean {
  return Boolean(assetVersion && assetVersion !== constitutionVersion);
}
