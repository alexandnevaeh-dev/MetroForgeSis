export { SURFACE_ROLES, createOccupancy, getKind, setKind, roleToCell, atlasKey } from './surface-roles.js';
export type { SurfaceRole, SurfaceSemantic, OccupancyKind, OccupancyGrid, VisualCell } from './surface-roles.js';
export { neighborMask, resolveSurfaceRole, resolveSurfaceTiles } from './surface-resolver.js';
export type { NeighborMask } from './surface-resolver.js';
export {
  DEFAULT_REPETITION_BUDGET,
  analyzeRepetition,
  longestHorizontalRun,
  longestVerticalRun,
  suppressRepetition,
} from './repetition.js';
export type { RepetitionBudget, RepetitionAnalysis } from './repetition.js';
export {
  defaultLightingPlan,
  platformStrategyFor,
  traversalFromGeometry,
  mapArchetypeToIntent,
} from './room-blueprint.js';
export type {
  RoomBlueprint,
  RoomArchetypeId,
  TraversalSegment,
  TraversalSegmentType,
  PlatformVisualStrategy,
  LightingPlan,
  AtmospherePlan,
  LandmarkPlan,
  RoomVisualIntent,
  GeometryRect,
} from './room-blueprint.js';
export { composePlayableVisuals } from './compose-visuals.js';
export type { ComposeVisualsInput, ComposeVisualsResult } from './compose-visuals.js';
export { composeBossArena, isGenericBossRoom } from './boss-arena.js';
export {
  evaluateRoomPresentation,
  evaluateRoomsPresentation,
  hasFullHeightWallFrame,
  floorMassRowCount,
  PRESENTATION_VIOLATIONS,
} from './presentation-metrics.js';
export type { PresentationRoomInput } from './presentation-metrics.js';
export { dressPlatforms, markPlatformOccupancy } from './platform-visual.js';
export { placeArchitecture } from './architecture.js';
