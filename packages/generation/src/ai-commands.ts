import type { WorldEditCommand } from './world-edit.js';
import type { RoomEditPatch } from './project-edit-service.js';
import type { ManualAssetRequest } from './manual-asset.js';

export type ProjectCommand =
  | { kind: 'world_edit'; command: WorldEditCommand; summary: string }
  | { kind: 'room_edit'; patch: RoomEditPatch; summary: string }
  | { kind: 'generate_asset'; request: Pick<ManualAssetRequest, 'description' | 'assetType'>; summary: string }
  | { kind: 'regenerate_room'; roomId: string; scope: 'full' | 'geometry' | 'encounter'; summary: string };

export interface CommandContext {
  roomIds: string[];
  selectedRoomId?: string;
}

export function parseProjectCommand(input: string, ctx: CommandContext): ProjectCommand | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  const addTreasure = text.match(/add (?:an? )?(?:optional )?treasure room(?: connected to (room_[\w]+))?/);
  if (addTreasure) {
    const connectFrom = addTreasure[1] ?? ctx.roomIds[0];
    if (!connectFrom) return null;
    const roomId = `room_treasure_${Date.now().toString(36).slice(-4)}`;
    return {
      kind: 'world_edit',
      summary: `Add optional treasure room connected to ${connectFrom}`,
      command: {
        type: 'add_room',
        roomId,
        label: 'Hidden Cache',
        archetype: 'treasure',
        connectFromRoomId: connectFrom,
      },
    };
  }

  const connectMatch = text.match(/connect (room_[\w]+) (?:to|with) (room_[\w]+)/);
  if (connectMatch) {
    return {
      kind: 'world_edit',
      summary: `Connect ${connectMatch[1]} to ${connectMatch[2]}`,
      command: { type: 'connect_rooms', from: connectMatch[1]!, to: connectMatch[2]!, bidirectional: true },
    };
  }

  const disconnectMatch = text.match(/disconnect (room_[\w]+) (?:from|and) (room_[\w]+)/);
  if (disconnectMatch) {
    return {
      kind: 'world_edit',
      summary: `Disconnect ${disconnectMatch[1]} from ${disconnectMatch[2]}`,
      command: { type: 'disconnect_rooms', from: disconnectMatch[1]!, to: disconnectMatch[2]! },
    };
  }

  const harderRoom = text.match(/make (?:this )?room harder|add enemies?/);
  if (harderRoom && ctx.selectedRoomId) {
    return {
      kind: 'room_edit',
      summary: `Add enemy to ${ctx.selectedRoomId}`,
      patch: { roomId: ctx.selectedRoomId, hasEnemy: true },
    };
  }

  const regenRoom = text.match(/regenerate room (room_[\w]+)/);
  if (regenRoom) {
    return {
      kind: 'regenerate_room',
      roomId: regenRoom[1]!,
      scope: 'full',
      summary: `Regenerate ${regenRoom[1]}`,
    };
  }

  const generateAsset = text.match(/generate (?:a |an )?(.+)/);
  if (generateAsset && (text.includes('sword') || text.includes('enemy') || text.includes('icon') || text.includes('weapon') || text.includes('boss'))) {
    const desc = input.trim();
    let assetType: ManualAssetRequest['assetType'] = 'prop';
    if (text.includes('enemy')) assetType = 'enemy';
    else if (text.includes('boss')) assetType = 'boss';
    else if (text.includes('sword') || text.includes('weapon')) assetType = 'weapon';
    else if (text.includes('icon')) assetType = 'ui_icon';
    return {
      kind: 'generate_asset',
      summary: `Generate asset: ${desc.slice(0, 60)}`,
      request: { description: desc, assetType },
    };
  }

  return null;
}
