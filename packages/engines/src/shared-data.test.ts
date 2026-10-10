import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {it,expect} from 'vitest';
import {BossSchema,type GameDNA} from '@metroforge/schemas';
import {writeSharedProjectData} from './shared-data.js';
const dna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: { title: 'Pack Slice', genre: 'Metroidvania', tone: 'dark', visualStyle: 'pixel art' },
  technical: { resolution: { width: 1920, height: 1080 }, tileSize: 16, targetPlaytimeHours: 1, difficulty: 'normal' },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 3 },
  narrative: { premise: 'Test', protagonist: 'Courier', centralConflict: 'Pour' },
  seed: 3,
  profile: 'TINY_TEST',
};

it('indexes supplied PNGs without replacing an existing library or history', () => {
 const outputDir=mkdtempSync(join(tmpdir(),'mf-library-'));
 try {
  const input={outputDir,gameDna:dna,roomIds:[],worldGraph:{version:'0.1.0',seed:3,nodes:[],edges:[],regions:[]},progressionGraph:{version:'0.1.0',seed:3,startNodeId:'',endNodeId:'',nodes:[],edges:[],abilities:[],criticalPath:[]},textureFiles:new Map([['assets/a/icon.png',Buffer.from('image')],['assets/b/icon.png',Buffer.from('other')],['assets/data.json',Buffer.from('{}')]])};
  writeSharedProjectData(input);
  const path=join(outputDir,'generation_manifest.json');
  const manifest=JSON.parse(readFileSync(path,'utf8'));
  expect(manifest.artifacts.map((a:{id:string})=>a.id)).toEqual(['assets/a/icon','assets/b/icon']);
  expect(manifest.artifacts.every((a:{productionReady:boolean})=>a.productionReady===false)).toBe(true);
  const preserved=JSON.stringify({artifacts:[{id:'authored',provider:'original'}],assetHistory:{authored:[{version:7}]}});
  writeFileSync(path,preserved);
  writeSharedProjectData(input);
  expect(readFileSync(path,'utf8')).toBe(preserved);
 } finally {rmSync(outputDir,{recursive:true,force:true});}
});

it('preserves authored boss definitions in an engine-neutral catalog', () => {
 const outputDir=mkdtempSync(join(tmpdir(),'mf-boss-catalog-'));
 try {
  const bosses=[BossSchema.parse({
   id:'boss_weather', name:'Weather Warden', lore:'Original storm guardian',
   arenaRoomId:'room_002', health:420,
   phases:[{phase:1,healthThreshold:.5,attacks:['lightning'],telegraphDuration:.6,recoveryWindow:.3}],
  })];
  writeSharedProjectData({
   outputDir,gameDna:dna,roomIds:[],
   worldGraph:{version:'0.1.0',seed:3,nodes:[],edges:[],regions:[]},
   progressionGraph:{version:'0.1.0',seed:3,startNodeId:'',endNodeId:'',nodes:[],edges:[],abilities:[],criticalPath:[]},
   gameContent:{enemies:[],bosses,quests:[],items:[],npcs:[],dialogues:[],shops:[]},
  });
  expect(JSON.parse(readFileSync(join(outputDir,'data/bosses/bosses.json'),'utf8'))).toEqual({bosses});
 } finally {rmSync(outputDir,{recursive:true,force:true});}
});
