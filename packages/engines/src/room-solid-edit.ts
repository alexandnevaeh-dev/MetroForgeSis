import type { GameplayPack } from './types.js';
import type { EditableObject } from './live-edit-session.js';

/** Room-scoped geometry bridge. Does not regenerate unrelated gameplay content. */
export function roomSolidObjects(pack: GameplayPack, roomId: string): EditableObject[] {
  const room = pack.rooms.find(room => room.id === roomId);
  if (!room) throw new Error(`Unknown room: ${roomId}`);
  return room.solids.map((solid, index) => ({
    id: `${roomId}:solid:${index}`, roomId, x: solid.x, y: solid.y,
    properties: { width: solid.width, height: solid.height, ...(solid.name === undefined ? {} : { name: solid.name }) },
  }));
}

/** Returns a copy; callers persist it before marking the session saved. */
export function withRoomSolids(pack: GameplayPack, roomId: string, objects: EditableObject[]): GameplayPack {
  if (!pack.rooms.some(room => room.id === roomId)) throw new Error(`Unknown room: ${roomId}`);
  const ids = new Set<string>();
  const solids = objects.map(object => {
    if (object.roomId !== roomId || !object.id || ids.has(object.id)) throw new Error('Invalid room object identity');
    ids.add(object.id);
    const { width, height, name } = object.properties;
    if (!Number.isFinite(object.x) || !Number.isFinite(object.y) ||
        typeof width !== 'number' || !Number.isFinite(width) || width <= 0 ||
        typeof height !== 'number' || !Number.isFinite(height) || height <= 0 ||
        (name !== undefined && typeof name !== 'string')) throw new Error('Invalid solid dimensions or name');
    if (Object.keys(object.properties).some(key => !['width', 'height', 'name'].includes(key)))
      throw new Error('Unsupported solid property');
    return { ...(name === undefined ? {} : { name }), x: object.x, y: object.y, width, height };
  });
  const result = structuredClone(pack);
  result.rooms.find(room => room.id === roomId)!.solids = solids;
  return result;
}
