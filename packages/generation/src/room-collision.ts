import { parseRoomSceneCollision } from '@metroforge/godot';
import { assetFile, assertAssetId, fileBytes } from './asset-files.js';

export function readGodotRoomCollision(project: string, roomId: string) {
  assertAssetId(roomId);
  const cache = new Map<string, string>();
  const read = (path: string) => {
    if (!path.startsWith('res://') || !path.endsWith('.tscn')) throw new Error('Invalid scene resource path');
    const relative = path.slice(6); const cached = cache.get(relative); if (cached !== undefined) return cached;
    const bytes = fileBytes(assetFile(project, relative));
    if (!bytes || bytes.length > 1024 * 1024) throw new Error('Room scene is missing or exceeds the preview size limit');
    const text = bytes.toString('utf8'); cache.set(relative, text); return text;
  };
  return { roomId, ...parseRoomSceneCollision(read(`res://scenes/rooms/${roomId}.tscn`), read) };
}
