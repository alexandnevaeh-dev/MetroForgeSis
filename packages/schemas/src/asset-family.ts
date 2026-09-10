import { z } from 'zod';

export const AssetFamilyTypeSchema = z.enum(['player', 'enemy', 'boss', 'biome', 'tileset', 'background']);
export type AssetFamilyType = z.infer<typeof AssetFamilyTypeSchema>;

export const AssetFamilyStatusSchema = z.enum([
  'FAMILY_DRAFT',
  'FAMILY_NORMALIZED',
  'FAMILY_CONSISTENT',
  'FAMILY_APPROVED',
  'FAMILY_PRODUCTION_READY',
  'FAMILY_REVIEW_REQUIRED',
]);
export type AssetFamilyStatus = z.infer<typeof AssetFamilyStatusSchema>;

export const AssetFamilyMemberSchema = z.object({
  id: z.string(),
  path: z.string(),
  required: z.boolean(),
  present: z.boolean(),
  placeholder: z.boolean(),
  technicalValid: z.boolean(),
  visuallyValid: z.boolean(),
  productionReady: z.boolean(),
  provider: z.string().optional(),
  model: z.string().optional(),
  defects: z.array(z.string()).default([]),
});
export type AssetFamilyMember = z.infer<typeof AssetFamilyMemberSchema>;

export const AssetFamilySchema = z.object({
  familyId: z.string(),
  familyType: AssetFamilyTypeSchema,
  constitutionId: z.string(),
  constitutionVersion: z.string(),
  canonicalReferenceIds: z.array(z.string()),
  members: z.array(AssetFamilyMemberSchema),
  identityRules: z.array(z.string()),
  providerStrategy: z.string(),
  status: AssetFamilyStatusSchema,
  qualityScores: z.object({ technical: z.number(), visual: z.number(), consistency: z.number() }),
  defects: z.array(z.string()),
  provenance: z.object({ generatedAt: z.string(), seed: z.number().int() }),
});
export type AssetFamily = z.infer<typeof AssetFamilySchema>;

export const PRODUCTION_FAMILY_REQUIREMENTS: Record<AssetFamilyType, string[]> = {
  player: ['player', 'player_walk', 'player_attack', 'player_hurt', 'player_death'],
  enemy: ['enemy_000', 'enemy_000_attack', 'enemy_000_hurt', 'enemy_000_death'],
  boss: ['boss_final', 'boss_final_attack', 'boss_final_hurt', 'boss_final_death'],
  biome: ['biome_0_source', 'biome_0_prop'],
  tileset: ['biome_0_tileset'],
  background: ['biome_0_far', 'biome_0_mid', 'biome_0_near'],
};
