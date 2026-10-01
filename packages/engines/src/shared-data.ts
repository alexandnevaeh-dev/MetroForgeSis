import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AssemblyInput } from '@metroforge/godot';
import { validateLootCatalog } from '@metroforge/schemas';
import { buildMovementJson } from '@metroforge/shared';
import { buildGameplayPack } from './gameplay-pack.js';
import type { GameplayPack } from './types.js';

export function writeSharedProjectData(
  input: AssemblyInput,
  pack: GameplayPack = buildGameplayPack(input),
): GameplayPack {
  const tables = validateLootCatalog(input.gameContent?.lootTables ?? [], input.gameContent?.items ?? [], input.gameContent?.enemies ?? []);
  mkdirSync(input.outputDir, { recursive: true });
  mkdirSync(join(input.outputDir, 'data', 'loot'), { recursive: true });
  writeFileSync(join(input.outputDir, 'data', 'loot', 'loot_tables.json'), JSON.stringify({ tables }, null, 2));
  writeFileSync(join(input.outputDir, 'gameplay.json'), JSON.stringify(pack, null, 2));
  writeFileSync(join(input.outputDir, 'game_dna.json'), JSON.stringify(input.gameDna, null, 2));
  writeFileSync(join(input.outputDir, 'world_graph.json'), JSON.stringify(input.worldGraph, null, 2));
  writeFileSync(
    join(input.outputDir, 'progression_graph.json'),
    JSON.stringify(input.progressionGraph, null, 2),
  );
  mkdirSync(join(input.outputDir, 'data', 'world'), { recursive: true });
  writeFileSync(
    join(input.outputDir, 'data', 'world', 'world_graph.json'),
    JSON.stringify(input.worldGraph, null, 2),
  );
  mkdirSync(join(input.outputDir, 'data', 'player'), { recursive: true });
  writeFileSync(
    join(input.outputDir, 'data', 'player', 'movement.json'),
    JSON.stringify(buildMovementJson(input.gameDna.movement), null, 2),
  );
  mkdirSync(join(input.outputDir, 'data', 'abilities'), { recursive: true });
  writeFileSync(
    join(input.outputDir, 'data', 'abilities', 'abilities.json'),
    JSON.stringify({ abilities: pack.abilities }, null, 2),
  );
  mkdirSync(join(input.outputDir, 'data', 'rooms'), { recursive: true });
  const rooms: Record<string, unknown> = {};
  for (const room of pack.rooms) {
    rooms[room.id] = {
      id: room.id,
      index: room.index,
      biomeId: room.biomeId,
      archetype: room.archetype,
      width: room.width,
      height: room.height,
      connections: room.doors.map((d) => ({
        direction: d.direction,
        targetRoomId: d.targetRoomId,
        optional: d.optional,
        requirements: d.requirements,
      })),
      enemies: room.enemy ? [room.enemy.id] : [],
      npcs: (room.npcs ?? []).map(npc => npc.definitionId),
      collectibles: [],
    };
  }
  writeFileSync(join(input.outputDir, 'data', 'rooms', 'rooms.json'), JSON.stringify({ rooms }, null, 2));

  // Keep authored equipment available to the desktop catalog for every exported engine.
  mkdirSync(join(input.outputDir, 'data', 'items'), { recursive: true });
  writeFileSync(
    join(input.outputDir, 'data', 'items', 'items.json'),
    JSON.stringify({ items: input.gameContent?.items ?? [] }, null, 2),
  );

  if (input.gameContent) {
    for (const key of ['npcs', 'dialogues', 'quests', 'shops'] as const) {
      mkdirSync(join(input.outputDir, 'data', key), { recursive: true });
      writeFileSync(join(input.outputDir, 'data', key, `${key}.json`),
        JSON.stringify({ [key]: input.gameContent[key] }, null, 2));
    }
    mkdirSync(join(input.outputDir, 'data', 'enemies'), { recursive: true });
    writeFileSync(
      join(input.outputDir, 'data', 'enemies', 'enemies.json'),
      JSON.stringify({ enemies: input.gameContent.enemies }, null, 2),
    );
  }

  if (input.textureFiles) {
    for (const [rel, buffer] of input.textureFiles) {
      const dest = join(input.outputDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      if (!existsSync(dest)) writeFileSync(dest, buffer);
    }
  }
  // Direct engine exports may not pass through the asset-generation pipeline.
  // Preserve its richer provenance/history whenever that manifest already exists.
  const libraryPath = join(input.outputDir, 'generation_manifest.json');
  if (input.textureFiles?.size && !existsSync(libraryPath)) {
    const artifacts = [...input.textureFiles.keys()]
      .filter(path => path.toLowerCase().endsWith('.png'))
      .map(path => {
        const clip = pack.sprites.find(sprite => sprite.relativePath === path);
        return {
          id: path.replace(/\\/g, '/').replace(/\.png$/i, ''),
          path,
          sourceType: 'assembly-input',
          productionReady: false,
          metadata: clip ? { ...clip } : {},
        };
      });
    writeFileSync(libraryPath, JSON.stringify({ artifacts, assetHistory: {} }, null, 2));
  }
  return pack;
}
