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
