import type { GenerationMode } from '@metroforge/shared';
import type { WorldEditCommand } from './world-edit.js';
import type { RoomEditPatch } from './project-edit-service.js';
import type { ManualAssetRequest } from './manual-asset.js';
import type { ProjectCommand } from './ai-commands.js';
import { parseProjectCommand } from './ai-commands.js';

export interface LlmCommandSource {
  generateText(req: {
    prompt: string;
    systemPrompt: string;
    jsonMode?: boolean;
    mode?: GenerationMode;
  }): Promise<{ text: string }>;
}

const SYSTEM_PROMPT = `You translate natural-language game editor commands into JSON.
Respond with ONLY valid JSON matching one of these shapes (no markdown):
{"kind":"world_edit","summary":"...","command":{...WorldEditCommand}}
{"kind":"room_edit","summary":"...","patch":{...RoomEditPatch}}
{"kind":"generate_asset","summary":"...","request":{"description":"...","assetType":"enemy|boss|weapon|prop|ui_icon|tileset"}}
{"kind":"regenerate_room","summary":"...","roomId":"room_xxx","scope":"full|geometry|encounter"}
{"kind":"unknown","summary":"could not parse"}

WorldEditCommand types: add_room, connect_rooms, disconnect_rooms.
RoomEditPatch fields: roomId, hasEnemy, width, height, archetype.
Use only room IDs from the provided context when possible.`;

export interface LlmCommandContext {
  roomIds: string[];
  selectedRoomId?: string;
  projectPath?: string;
  ragContext?: string;
}

export async function parseProjectCommandWithLlm(
  input: string,
  ctx: LlmCommandContext,
  source: LlmCommandSource,
  mode: GenerationMode = 'LOCAL_ONLY',
): Promise<ProjectCommand | null> {
  const ruleBased = parseProjectCommand(input, ctx);
  if (ruleBased) return ruleBased;

  const ragBlock = ctx.ragContext?.trim()
    ? `\nRelevant project memory:\n${ctx.ragContext.trim()}\n`
    : '';
  const prompt = `Room IDs: ${ctx.roomIds.join(', ')}
Selected room: ${ctx.selectedRoomId ?? 'none'}${ragBlock}
User command: ${input}`;

  try {
    const { text } = await source.generateText({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      jsonMode: true,
      mode,
    });
    const parsed = JSON.parse(text) as {
      kind?: string;
      summary?: string;
      command?: WorldEditCommand;
      patch?: RoomEditPatch;
      request?: Pick<ManualAssetRequest, 'description' | 'assetType'>;
      roomId?: string;
      scope?: 'full' | 'geometry' | 'encounter';
    };
    if (!parsed.kind || parsed.kind === 'unknown') return null;

    switch (parsed.kind) {
      case 'world_edit':
        if (!parsed.command) return null;
        return { kind: 'world_edit', command: parsed.command, summary: parsed.summary ?? 'World edit' };
      case 'room_edit':
        if (!parsed.patch?.roomId) return null;
        return { kind: 'room_edit', patch: parsed.patch, summary: parsed.summary ?? 'Room edit' };
      case 'generate_asset':
        if (!parsed.request?.description) return null;
        return {
          kind: 'generate_asset',
          request: parsed.request,
          summary: parsed.summary ?? 'Generate asset',
        };
      case 'regenerate_room':
        if (!parsed.roomId) return null;
        return {
          kind: 'regenerate_room',
          roomId: parsed.roomId,
          scope: parsed.scope ?? 'full',
          summary: parsed.summary ?? `Regenerate ${parsed.roomId}`,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
