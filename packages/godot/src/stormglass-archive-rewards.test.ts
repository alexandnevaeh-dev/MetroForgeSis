import { it, expect } from 'vitest';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameDNASchema } from '@metroforge/schemas';
import { generateGameContent } from '@metroforge/procedural';
import { recompileRooms } from './room-assembler.js';

it.each(['SMALL', 'MEDIUM', 'LARGE'] as const)('binds archive rewards to stable existing collectible IDs for %s', profile => {
  const input = JSON.parse(readFileSync(new URL('../../assets/src/fixtures/canopy-game-dna.json', import.meta.url), 'utf8'));
  input.archetype='SIDE_VIEW_METROIDVANIA';input.identity.title='Stormglass Reliquary';input.technical.tileSize=32;
  input.movement={walkSpeed:220,runSpeed:380,jumpHeight:160,gravity:980};
  const dna=GameDNASchema.parse(input),graph=JSON.parse(readFileSync('templates/godot-metroidvania/data/visual/blueprints/stormglass-archive-wing-campaign-v1.json','utf8')).worldGraph;
  const ids=graph.nodes.map((n:{id:string})=>n.id),content=generateGameContent(dna,profile,42,'room_039',ids);
  const output=mkdtempSync(join(tmpdir(),'archive-reward-'));
  const result=recompileRooms({outputDir:output,gameDna:dna,worldGraph:graph,gameContent:content,roomIds:ids,targetRoomIds:['room_046','room_047']});
  expect(result.errors).toEqual([]);
  const rooms=JSON.parse(readFileSync(join(output,'data/rooms/rooms.json'),'utf8')).rooms;
  expect(rooms.room_046.collectibles).toEqual(['lost_echo_001']);expect(rooms.room_047.collectibles).toEqual(['lost_echo_002']);
});
