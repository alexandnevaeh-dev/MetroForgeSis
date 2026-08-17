export { GodotProjectAssembler, getTemplatePath } from './assembler.js';
export type { AssemblyInput, AssemblyResult, RecompileRoomsInput, RecompileRoomsResult } from './assembler.js';
export {
  deriveRoomIds,
  resolvePublishedArchetype,
  auditRoomArchetypeFidelity,
  recompileRooms,
  pickRoomPickupItem,
} from './room-assembler.js';
export type { PublishedRoomRecord, TileCell, RoomArchetypeFidelityIssue } from './room-assembler.js';
export { buildRoomTileCells, floorTopPx } from './tile-layout.js';
export {
  composePlayableVisuals,
  composeBossArena,
  resolveSurfaceTiles,
  suppressRepetition,
  analyzeRepetition,
  evaluateRoomPresentation,
  evaluateRoomsPresentation,
  hasFullHeightWallFrame,
  floorMassRowCount,
  DEFAULT_REPETITION_BUDGET,
  PRESENTATION_VIOLATIONS,
} from './composition/index.js';
export type {
  RoomBlueprint,
  VisualCell,
  OccupancyGrid,
  RepetitionBudget,
  PlatformVisualStrategy,
  PresentationRoomInput,
} from './composition/index.js';
export { measureRoomLayout, layoutsTooSimilar, roomSetHasExcessDuplicates } from './room-variety.js';
export type { RoomLayoutMetrics } from './room-variety.js';
export { composeEnvironment, biomeCompositionRule } from './environment-composition.js';
export type { EnvironmentCompositionSpec, CompositionLayer } from './environment-composition.js';
export { compileGodotTerrainSet } from './terrain-set.js';
