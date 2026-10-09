import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { GameDNA, ProgressionGraph, WorldGraph } from '@metroforge/schemas';
import { UnrealProjectAssembler } from './assembler.js';

const dna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: { title: 'Unreal Slice', genre: 'Metroidvania', tone: 'dark', visualStyle: 'pixel art' },
  technical: { resolution: { width: 1920, height: 1080 }, tileSize: 16, targetPlaytimeHours: 1, difficulty: 'normal' },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 2 },
  narrative: { premise: 'Test', protagonist: 'Courier', centralConflict: 'Pour' },
  seed: 9,
  profile: 'TINY_TEST',
};

describe('UnrealProjectAssembler', () => {
  it('retains Platformer ledge data and warns about missing native one-way behavior', () => {
    const outputDir=join(tmpdir(),`mf-unreal-platformer-${Date.now()}`);
    const roomIds=['room_000','room_001'];
    const worldGraph: WorldGraph={version:'0.1.0',seed:9,nodes:roomIds.map(id=>({id,type:'room',label:id,metadata:{archetype:'tutorial',platformerStage:true,targetTileWidth:64,targetTileHeight:24}})),edges:[],regions:[]};
    const progressionGraph: ProgressionGraph={version:'0.1.0',seed:9,startNodeId:roomIds[0]!,endNodeId:roomIds[1]!,nodes:[],edges:[],abilities:[],criticalPath:roomIds};
    const result=new UnrealProjectAssembler().assemble({outputDir,roomIds,worldGraph,progressionGraph,
      gameDna:{...dna,archetype:'SIDE_VIEW_PLATFORMER',abilities:[]},
      textureFiles:new Map([['assets/tilesets/biome_0/source.png',Buffer.from('path presence fixture')]])});
    expect(result.success).toBe(true);
    expect(result.warnings).toContainEqual(expect.stringContaining('does not yet implement jump-through ledges'));
    const pack=JSON.parse(readFileSync(join(outputDir,'Content/Raw/gameplay.json'),'utf8'));
    expect(pack.rooms.some((room: {solids: Array<{oneWay?:boolean}>})=>room.solids.some(solid=>solid.oneWay))).toBe(true);
    rmSync(outputDir,{recursive:true,force:true});
  });
  it('writes a Paper2D C++ project with plugins enabled', () => {
    const outputDir = join(tmpdir(), `mf-unreal-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const roomIds = ['room_000', 'room_001'];
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 9,
      nodes: roomIds.map((id) => ({ id, type: 'room' as const, label: id, metadata: {} })),
      edges: [
        { id: 'e1', from: 'room_000', to: 'room_001', requirements: [], optional: false, bidirectional: true },
      ],
      regions: [{ id: 'region_0', name: 'R0', biomeId: 'biome_0', roomIds }],
    };
    const progressionGraph: ProgressionGraph = {
      version: '0.1.0',
      seed: 9,
      startNodeId: 'room_000',
      endNodeId: 'room_001',
      nodes: [],
      edges: [],
      abilities: ['dash'],
      criticalPath: roomIds,
    };
    const result = new UnrealProjectAssembler().assemble({
      outputDir,
      gameDna: dna,
      worldGraph,
      progressionGraph,
      roomIds,
    });
    expect(result.success).toBe(true);
    const uproject = JSON.parse(readFileSync(join(outputDir, 'MetroForgeGame.uproject'), 'utf-8')) as {
      EngineAssociation: string;
      Plugins: Array<{ Name: string; Enabled: boolean }>;
    };
    expect(uproject.EngineAssociation).toBe('5.8');
    expect(uproject.Plugins.find((p) => p.Name === 'Paper2D')?.Enabled).toBe(true);
    expect(readFileSync(join(outputDir, 'Source/MetroForgeGame/MFPawn.cpp'), 'utf-8')).toContain('UPaperSpriteComponent');
    expect(readFileSync(join(outputDir, 'Source/MetroForgeGame/MFAcceptance.cpp'), 'utf-8')).toContain('FOUNDRY_ACCEPT');
    expect(readFileSync(join(outputDir, 'Source/MetroForgeGame/MFEnemy.cpp'), 'utf-8')).toContain('AMFEnemy');
    expect(readFileSync(join(outputDir, 'Content/Raw/gameplay.json'), 'utf-8')).toContain('startRoomId');
    rmSync(outputDir, { recursive: true, force: true });
  });
});
