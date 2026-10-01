import { z } from 'zod';
import { GameArchetypeSchema } from './core.js';

/**
 * Perspective / progression / combat are orthogonal dimensions.
 * "Metroidvania" is primarily a progression/world-structure concept;
 * side-view vs top-down describes spatial presentation and movement.
 * Distinct from room `archetype` (tutorial/boss/shop) in game.ts.
 */

export const PerspectiveSchema = z.enum(['SIDE_VIEW', 'TOP_DOWN', 'ISOMETRIC']);
export type Perspective = z.infer<typeof PerspectiveSchema>;

export const WorldTopologyModelSchema = z.enum([
  'LINEAR',
  'HUB_AND_SPOKE',
  'INTERCONNECTED',
  'OPEN_REGION',
  'DUNGEON_BASED',
]);
export type WorldTopologyModel = z.infer<typeof WorldTopologyModelSchema>;

export const ProgressionModelSchema = z.enum([
  'ABILITY_GATED',
  'ITEM_GATED',
  'KEY_GATED',
  'STORY_GATED',
  'EQUIPMENT_GATED',
  'OPEN',
]);
export type ProgressionModel = z.infer<typeof ProgressionModelSchema>;

export const CombatModelSchema = z.enum([
  'MELEE_ACTION',
  'DIRECTIONAL_MELEE',
  'SHOOTER',
  'MAGIC',
  'HYBRID',
]);
export type CombatModel = z.infer<typeof CombatModelSchema>;

export const LocomotionModelSchema = z.enum([
  'PLATFORMER',
  'PLANAR_4DIR',
  'PLANAR_8DIR',
  'PLANAR_ANALOG',
]);
export type LocomotionModel = z.infer<typeof LocomotionModelSchema>;

export const CameraModelSchema = z.enum([
  'SIDE_FOLLOW_ROOM',
  'TOP_DOWN_FOLLOW',
  'TOP_DOWN_SCREEN',
  'CONTINUOUS_FOLLOW',
]);
export type CameraModel = z.infer<typeof CameraModelSchema>;

export const NavigationModelSchema = z.enum([
  'PLATFORMER_GEOMETRY',
  'WALKABILITY_GRID',
  'NAVIGATION_AGENT',
]);
export type NavigationModel = z.infer<typeof NavigationModelSchema>;

export const AbilityNamespaceSchema = z.enum(['movement_abilities', 'dungeon_tools']);
export type AbilityNamespace = z.infer<typeof AbilityNamespaceSchema>;

export const ArtProjectionSchema = z.enum(['side-view', 'top-down']);
export type ArtProjection = z.infer<typeof ArtProjectionSchema>;

export const QualityPassProfileSchema = z.enum([
  'side_view_metroidvania',
  'top_down_action_adventure',
  'none',
]);
export type QualityPassProfile = z.infer<typeof QualityPassProfileSchema>;

/** Boolean / enum capabilities the pipeline queries instead of `if (archetype === …)`. */
export const GenreCapabilitiesSchema = z.object({
  supportsVerticalPlatforming: z.boolean(),
  supportsFreePlanarMovement: z.boolean(),
  supportsJumping: z.boolean(),
  supportsGravity: z.boolean(),
  supportsElevationLayers: z.boolean(),
  supportsLockedAbilityGates: z.boolean(),
  supportsItemToolGates: z.boolean(),
  supportsProjectileCombat: z.boolean(),
  supportsDirectionalCombat: z.boolean(),
  supportsRoomTransitions: z.boolean(),
  supportsContinuousWorldCamera: z.boolean(),
  supportsDungeonRooms: z.boolean(),
  supportsParallaxBackgrounds: z.boolean(),
  supportsYSort: z.boolean(),
  supportsDirectionalSpriteSheets: z.boolean(),
  supportsOverworldMap: z.boolean(),
  supportsPerRoomScenes: z.boolean(),
  /** When false, QualityDirector / side-view repair must not run. */
  supportsSideViewQualityPass: z.boolean(),
  abilityNamespace: AbilityNamespaceSchema,
  artProjection: ArtProjectionSchema,
  qualityPassProfile: QualityPassProfileSchema,
});
export type GenreCapabilities = z.infer<typeof GenreCapabilitiesSchema>;

export const GenreRuntimeBindingSchema = z.object({
  godotTemplate: z.string().min(1),
  playerController: z.enum(['side_view', 'top_down_8dir']),
  cameraModel: CameraModelSchema,
  worldGenerator: z.enum(['linear_room_graph', 'overworld_chunks']),
  combatModel: z.enum(['side_view_melee', 'directional_top_down']),
  navigationModel: NavigationModelSchema,
  locomotion: LocomotionModelSchema,
});
export type GenreRuntimeBinding = z.infer<typeof GenreRuntimeBindingSchema>;

export const GenreDefinitionSchema = z.object({
  id: GameArchetypeSchema,
  displayName: z.string().min(1),
  perspective: PerspectiveSchema,
  defaultWorldTopology: WorldTopologyModelSchema,
  defaultProgression: ProgressionModelSchema,
  defaultCombat: CombatModelSchema,
  capabilities: GenreCapabilitiesSchema,
  runtime: GenreRuntimeBindingSchema,
  /** Optional style/reference tags for ArtDirectionSpec (not copyrighted assets). */
  referenceTags: z.array(z.string()).default([]),
});
export type GenreDefinition = z.infer<typeof GenreDefinitionSchema>;

export type GenreCapabilityFlag = {
  [K in keyof GenreCapabilities]: GenreCapabilities[K] extends boolean ? K : never;
}[keyof GenreCapabilities];
