export {
  GodotProjectAssembler,
  getTemplatePath,
  overlayAuthoredVisualPolish,
  applyAuthoredOverlayProvenance,
  isRollbackOnlyTemplatePath,
  stripRollbackOnlyAssets,
} from './assembler.js';
export { assembleQuantumProject } from './quantum-assembler.js';
export type { QuantumAssemblyInput, QuantumAssemblyResult } from './quantum-assembler.js';
export type {
  AssemblyInput,
  AssemblyResult,
  RecompileRoomsInput,
  RecompileRoomsResult,
} from './assembler.js';
export {
  deriveRoomIds,
  resolvePublishedArchetype,
  auditRoomArchetypeFidelity,
  recompileRooms,
  pickRoomPickupItem,
  prepareRoomAssemblyContext,
  buildRoomAssemblyOptions,
  buildPublishedRoomRecord,
  collectRoomCollisionRects,
  spawnSideForEntry,
  defaultEntityPlacements,
  resolveEntityPlacements,
  mergeEntityPlacementsForIds,
  findPlacement,
} from './room-assembler.js';
export type {
  PublishedRoomRecord,
  TileCell,
  RoomArchetypeFidelityIssue,
  RoomAssemblyOptions,
  RoomAssemblyContext,
  CollisionRect,
  RoomConnection,
  EntityPlacement,
  EntityKind,
} from './room-assembler.js';
export {
  buildRoomTileCells,
  buildRoomShellColliders,
  floorTopPx,
  SIDE_DOOR_ROWS,
} from './tile-layout.js';
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
export {
  measureRoomLayout,
  layoutsTooSimilar,
  roomSetHasExcessDuplicates,
} from './room-variety.js';
export type { RoomLayoutMetrics } from './room-variety.js';
export { composeEnvironment, biomeCompositionRule } from './environment-composition.js';
export type { EnvironmentCompositionSpec, CompositionLayer } from './environment-composition.js';
export { compileGodotTerrainSet } from './terrain-set.js';
export { EXTERNAL_VISUAL_PACKS, loadExternalVisualPack } from './external-visual-pack.js';
export type {
  ExternalVisualPackId,
  ExternalVisualPackManifest,
  ExternalVisualPackAsset,
} from './external-visual-pack.js';
export {
  expandFoundryTextureAliases,
  remapTileCellsForFoundry,
  foundryBackdropCoverScale,
  FOUNDRY_BACKDROP_NATIVE,
  FOUNDRY_LETTERBOX_PAD,
  projectUsesFoundryVisualKit,
} from './foundry-visual-pack.js';

export { parseRoomSceneCollision } from './scene-collision.js';
export type { SceneCollision, SceneCollisionRect } from './scene-collision.js';
export { buildCastleInteriorLayout } from './castle-interior-layout.js';
export { buildCastleRegionPlan, supportsCastleRegionPlan, type CastleRegionPlan } from './castle-region-plan.js';
export { applyStormglassGalleryBlueprint } from './stormglass-gallery-graph.js';
export { generateStormglassGalleryCampaign, applyStormglassGalleryDnaContract } from './stormglass-campaign-recipe.js';
export {exportedStairApproaches} from './exported-stair-audit.js';
