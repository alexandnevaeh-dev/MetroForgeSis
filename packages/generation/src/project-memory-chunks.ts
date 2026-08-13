import type { ProjectMemoryChunk } from '@metroforge/ai';
import type { LoadedProject } from './project-loader.js';

const MAX_ROOM_CHUNKS = 48;

export function buildProjectMemoryChunks(project: LoadedProject): Omit<ProjectMemoryChunk, 'embedding'>[] {
  const chunks: Omit<ProjectMemoryChunk, 'embedding'>[] = [];
  const { gameDna, gameContent, roomsData, worldGraph, playtestRoute } = project;

  chunks.push({
    id: 'identity',
    category: 'identity',
    text: `Game "${gameDna.identity.title}" (${gameDna.identity.tone} tone, ${gameDna.profile} profile). ${gameDna.identity.tagline ?? ''}`.trim(),
  });

  chunks.push({
    id: 'narrative',
    category: 'narrative',
    text: `Premise: ${gameDna.narrative.premise}. Protagonist: ${gameDna.narrative.protagonist}. Conflict: ${gameDna.narrative.centralConflict}.`,
  });

  chunks.push({
    id: 'world-summary',
    category: 'world',
    text: `${project.roomIds.length} rooms across ${gameDna.world.biomeCount} biomes. Start ${playtestRoute?.startRoomId ?? project.roomIds[0] ?? 'room_000'}; victory boss ${playtestRoute?.victoryBossId ?? 'boss_final'} in ${playtestRoute?.victoryRoomId ?? 'unknown'}.`,
  });

  for (const ability of gameDna.abilities.filter((a) => a.enabled !== false)) {
    chunks.push({
      id: `ability-${ability.id}`,
      category: 'ability',
      text: `Ability ${ability.name} (${ability.id}) — ${ability.category}.`,
    });
  }

  for (const quest of gameContent.quests) {
    const objective = quest.objectives[0];
    chunks.push({
      id: `quest-${quest.id}`,
      category: 'quest',
      text: `Quest "${quest.name}": ${objective?.description ?? quest.description} (${objective?.type ?? 'unknown'} target ${objective?.target ?? '?'})`,
    });
  }

  for (const npc of gameContent.npcs) {
    chunks.push({
      id: `npc-${npc.id}`,
      category: 'npc',
      text: `NPC ${npc.name} (${npc.role}) in ${npc.roomId}${npc.shopId ? `, shop ${npc.shopId}` : ''}.`,
    });
  }

  for (const boss of gameContent.bosses) {
    chunks.push({
      id: `boss-${boss.id}`,
      category: 'boss',
      text: `Boss ${boss.name} (${boss.id}) in arena ${boss.arenaRoomId}.`,
    });
  }

  for (const enemy of gameContent.enemies.slice(0, 24)) {
    chunks.push({
      id: `enemy-${enemy.id}`,
      category: 'enemy',
      text: `Enemy ${enemy.name} (${enemy.id}) in biome ${enemy.biomeId}, ${enemy.combat.type} combat.`,
    });
  }

  const prioritizedRooms = prioritizeRoomIds(project.roomIds, roomsData);
  for (const roomId of prioritizedRooms.slice(0, MAX_ROOM_CHUNKS)) {
    const room = roomsData[roomId] ?? {};
    const archetype = String(room.archetype ?? room.worldArchetype ?? 'combat');
    const connections = Array.isArray(room.connections)
      ? (room.connections as Array<{ targetRoomId?: string; direction?: string }>)
          .map((c) => `${c.direction ?? '?'}->${c.targetRoomId ?? '?'}`)
          .join(', ')
      : '';
    chunks.push({
      id: `room-${roomId}`,
      category: 'room',
      text: `Room ${roomId} archetype ${archetype}${connections ? `; exits: ${connections}` : ''}.`,
    });
  }

  const regionCount = worldGraph.regions?.length ?? 0;
  if (regionCount > 0) {
    chunks.push({
      id: 'regions',
      category: 'world',
      text: `${regionCount} world region(s): ${worldGraph.regions!.map((r) => r.name).join(', ')}.`,
    });
  }

  return chunks;
}

function prioritizeRoomIds(
  roomIds: string[],
  roomsData: Record<string, Record<string, unknown>>,
): string[] {
  const special: string[] = [];
  const normal: string[] = [];
  for (const roomId of roomIds) {
    const archetype = String(roomsData[roomId]?.archetype ?? 'combat');
    if (archetype === 'combat' || archetype === 'connector' || archetype === 'traversal') {
      normal.push(roomId);
    } else {
      special.push(roomId);
    }
  }
  return [...special, ...normal];
}
