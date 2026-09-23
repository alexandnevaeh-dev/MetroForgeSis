import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AssemblyInput } from '@metroforge/godot';
import { buildMovementJson } from '@metroforge/shared';
import { buildGameplayPack } from './gameplay-pack.js';
import type { GameplayPack } from './types.js';

export function writeSharedProjectData(
  input: AssemblyInput,
  pack: GameplayPack = buildGameplayPack(input),
): GameplayPack {
  mkdirSync(input.outputDir, { recursive: true });
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
  return pack;
}
