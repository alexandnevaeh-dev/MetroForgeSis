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
export { measureRoomLayout, layoutsTooSimilar, roomSetHasExcessDuplicates } from './room-variety.js';
export type { RoomLayoutMetrics } from './room-variety.js';
export { composeEnvironment, biomeCompositionRule } from './environment-composition.js';
export type { EnvironmentCompositionSpec, CompositionLayer } from './environment-composition.js';
export { compileGodotTerrainSet } from './terrain-set.js';
