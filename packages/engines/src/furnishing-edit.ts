import type { GameplayPack, GameplayRoom } from './types.js';
import { placeFurnishings, type FurnishingRequest } from './furnishing-layout.js';

export interface UnityFurnishingEdit {
  id: string;
  x: number;
  floorY: number;
  height: number;
}

function requestsFor(room: GameplayRoom): FurnishingRequest[] {
  if (room.furnishingRequests !== undefined) {
    if (!Array.isArray(room.furnishingRequests) || room.furnishingRequests.length > 512)
      throw new Error('Invalid saved furnishing requests');
    return structuredClone(room.furnishingRequests);
  }
  // Older exports can recover placed requests, but not omitted asset identities.
  return (room.furnishings ?? []).map(({ collision, layer, anchor, ...request }) => ({
    ...request,
    renderLayer: request.renderLayer ?? layer,
  }));
}

export function readUnityFurnishingRequests(room: GameplayRoom) {
  const requests = requestsFor(room);
  return requests.map((request) => ({
    id: request.id,
    role: request.role,
    x: request.x,
    floorY: request.floorY,
    height: request.height,
    width: request.width,
  }));
}

/** Changes authored intent only. Placement is recomputed; unsafe props remain omitted. */
export function withRoomFurnishingEdits(
  pack: GameplayPack,
  roomId: string,
  edits: UnityFurnishingEdit[] = [],
): GameplayPack {
  const result = structuredClone(pack);
  const room = result.rooms.find((entry) => entry.id === roomId);
  if (!room) throw new Error(`Unknown room: ${roomId}`);
  if (!Array.isArray(edits) || edits.length > 512) throw new Error('Invalid furnishing edits');
  const requests = requestsFor(room);
  const ids = new Set<string>();
  for (const request of requests) {
    if (
      !request ||
      typeof request.id !== 'string' ||
      !request.id ||
      ids.has(request.id) ||
      ![request.x, request.floorY, request.width, request.height].every(Number.isFinite) ||
      request.width <= 0 ||
      request.height <= 0
    )
      throw new Error('Saved furnishing identities or dimensions are invalid');
    ids.add(request.id);
  }
  const edited = new Set<string>();
  for (const edit of edits) {
    if (
      !edit ||
      typeof edit.id !== 'string' ||
      !ids.has(edit.id) ||
      edited.has(edit.id) ||
      Object.keys(edit).some((key) => !['id', 'x', 'floorY', 'height'].includes(key)) ||
      ![edit.x, edit.floorY, edit.height].every(Number.isFinite) ||
      edit.x < 0 ||
      edit.x > room.width ||
      edit.floorY < 0 ||
      edit.floorY > room.height ||
      edit.height < 1 ||
      edit.height > Math.min(4096, room.height)
    )
      throw new Error('Edit an existing furnishing with valid room coordinates and height');
    edited.add(edit.id);
    const request = requests.find((entry) => entry.id === edit.id)!;
    const ratio = request.width / request.height;
    request.x = edit.x;
    request.floorY = edit.floorY;
    request.height = edit.height;
    request.width = ratio * edit.height;
  }
  const sourceOmissions =
    room.furnishingSourceOmissions ??
    (room.furnishingOmissions ?? []).filter((entry) => !ids.has(entry.id));
  const placement = placeFurnishings(room, requests);
  room.furnishingRequests = requests;
  room.furnishingSourceOmissions = structuredClone(sourceOmissions);
  room.furnishings = placement.placements;
  room.furnishingOmissions = [...sourceOmissions, ...placement.omissions];
  return result;
}
