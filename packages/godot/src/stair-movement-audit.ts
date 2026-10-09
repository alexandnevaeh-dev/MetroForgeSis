import type {AuthoredStairApproach} from '@metroforge/procedural';
import type {WorldGraph} from '@metroforge/schemas';
import {buildRoomBoundaryColliders,buildStormglassInteriorMasonry,type RoomAssemblyOptions} from './room-assembler.js';

/** Only emitted stair/landing collision can inform the generic feasibility check.
 * No profile names, graph metadata or room ids stand in for physical geometry. */
export function authoredStairApproaches(
  graph: WorldGraph,
  rooms: readonly {roomId: string; options: RoomAssemblyOptions}[],
): Record<string,AuthoredStairApproach> {
  const result: Record<string,AuthoredStairApproach> = {};
  for (const edge of graph.edges) {
    if (edge.transition!=='up') continue;
    const options = rooms.find(room=>room.roomId===edge.from)?.options;
    const port = options?.spatialPorts?.find(p=>p.direction==='up'&&p.targetRoomId===edge.to);
    const connection = options?.connections.find(c=>c.direction==='up'&&c.targetRoomId===edge.to);
    // Painted tiles/region plans and ability obstacles own additional collision;
    // leave those to the generic audit until their geometry is modeled here.
    if (!options?.hasTileset || options.tileCells?.length || options.castleRegionPlan ||
      options.connections.some(c=>c.requirements.some(r=>r==='phase'||r==='ground_slam')) ||
      !options.stairFlights?.length || !options.stairFlightsOneWay || !port || !connection ||
      connection.requirements.length!==edge.requirements.length ||
      connection.requirements.some(requirement=>!edge.requirements.includes(requirement))) continue;
    result[edge.id] = {
      from:edge.from,to:edge.to,width:options.width,height:options.height,
      floorY:options.height-options.tileSize*2,oneWay:options.stairFlightsOneWay,
      flights:options.stairFlights,landings:options.platforms??[],pits:options.pits??[],
      solids:[...buildRoomBoundaryColliders(options),...buildStormglassInteriorMasonry(options)],
      door:{x:port.x,y:port.y},
    };
  }
  return result;
}
