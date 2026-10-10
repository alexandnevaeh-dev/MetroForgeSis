import {describe,it,expect} from 'vitest';
import {GameDNASchema} from '@metroforge/schemas';
import {buildGameplayPack} from './gameplay-pack.js';
const dna=GameDNASchema.parse({version:'0.1.0',seed:42,archetype:'SIDE_VIEW_METROIDVANIA',identity:{title:'Fixture',genre:'Metroidvania',tone:'dark',visualStyle:'pixel art'},technical:{resolution:{width:1920,height:1080},tileSize:16,targetPlaytimeHours:1,difficulty:'normal'},combat:{style:'melee',meleeEnabled:true,rangedEnabled:false},movement:{walkSpeed:200,runSpeed:350,jumpHeight:120,gravity:980},abilities:[],world:{biomeCount:1,roomCount:1},narrative:{premise:'Test',protagonist:'Courier',centralConflict:'Test'},profile:'TINY_TEST'});
function pack(theme?:string,archetype='SIDE_VIEW_METROIDVANIA',title='Unrelated title') {
 return buildGameplayPack({outputDir:'E:/MetroForgeData/Development/unity-castle-material-20261010/export-fixture',
  gameDna:{...dna,archetype:archetype as typeof dna.archetype,identity:{...dna.identity,title}},roomIds:['room_000'],
  worldGraph:{version:'0.1.0',seed:42,nodes:[{id:'room_000',type:'room',label:'Fixture',metadata:theme?{stormglassRoomTheme:theme}:{}}],edges:[],regions:[]},
  progressionGraph:{version:'0.1.0',seed:42,startNodeId:'room_000',endNodeId:'room_000',nodes:[],edges:[],abilities:[],criticalPath:['room_000']},textureFiles:new Map()});
}
describe('explicit authored castle terrain identity',()=>{
 it('exports masonry identity without any whole-scene background or title inference',()=>{
  const room=pack('archive-vault').rooms[0]!;
  expect(room.terrainMaterial).toBe('stormglass-masonry-v1');expect(room.backgrounds.interior).toBeUndefined();
  const {terrainMaterial,...rest}=room;expect(rest).toEqual(pack().rooms[0]);
 });
 it('leaves unmarked procedural rooms unchanged even with a castle title',()=>{
  expect(pack(undefined,'SIDE_VIEW_METROIDVANIA','Stormglass Reliquary').rooms[0]?.terrainMaterial).toBeUndefined();
 });
 it.each(['TOP_DOWN_ADVENTURE','SIDE_VIEW_PLATFORMER','QUANTUM_SIMULATION_ROGUELITE'])('does not apply side-view masonry to %s',archetype=>{
  expect(pack('archive-vault',archetype).rooms[0]?.terrainMaterial).toBeUndefined();
 });
});
