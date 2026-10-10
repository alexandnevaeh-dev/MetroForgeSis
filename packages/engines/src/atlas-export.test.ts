import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {GameDNASchema} from '@metroforge/schemas';
import {describe,it,expect} from 'vitest';
import {buildGameplayPack} from './gameplay-pack.js';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const resourceRoot=process.env.METROFORGE_ATLAS_TEST_ROOT ?? fileURLToPath(new URL('../../../',import.meta.url));
const packRoot=join(resourceRoot,'test-packs/stormglass-player-cape-v3');
const manifest=JSON.parse(readFileSync(join(packRoot,'manifest.json'),'utf8'));
const authored={clips:Object.keys(manifest.animations),textures:new Map<string,Buffer>(manifest.assets.map((asset:{source:string;destination:string})=>[asset.destination,readFileSync(join(packRoot,asset.source))]))};
authored.textures.set('assets/characters/player_animations.json',Buffer.from(JSON.stringify(manifest.animations)));
const textureFiles=new Map(authored.textures);textureFiles.set('assets/tilesets/biome_0/source.png',Buffer.from('presence fixture'));
const gameDna=GameDNASchema.parse({version:'0.1.0',archetype:'SIDE_VIEW_METROIDVANIA',identity:{title:'Atlas Export',genre:'Metroidvania',tone:'dark',visualStyle:'original painted art'},technical:{resolution:{width:1920,height:1080},tileSize:32,targetPlaytimeHours:1,difficulty:'normal'},combat:{style:'melee',meleeEnabled:true,rangedEnabled:false},movement:{walkSpeed:220,runSpeed:380,jumpHeight:160,gravity:980},abilities:[],world:{biomeCount:1,roomCount:3},narrative:{premise:'Archive',protagonist:'Courier',centralConflict:'Return'},seed:42,profile:'TINY_TEST'});
const input={outputDir:tmpdir(),gameDna,roomIds:['room_000'],worldGraph:{version:'0.1.0',seed:42,nodes:[{id:'room_000',type:'room' as const,label:'Start',metadata:{}}],edges:[],regions:[]},progressionGraph:{version:'0.1.0',seed:42,startNodeId:'room_000',endNodeId:'room_000',nodes:[],edges:[],abilities:[],criticalPath:['room_000']},textureFiles};
describe('authored player atlas export',()=>{
 it('uses the authored source sheet and every region rather than slicing a different procedural strip',()=>{
  const pack=buildGameplayPack(input),manifest=JSON.parse(authored.textures.get('assets/characters/player_animations.json')!.toString());
  for(const name of authored.clips){const clip=pack.sprites.find(c=>c.ownerId==='player'&&c.clip===name)!,spec=manifest[name];expect(clip.relativePath).toBe(spec.sourceSheet);expect(clip.frameRegions!.map(r=>[r.x,r.y,r.width,r.height])).toEqual(spec.sourceRegions);expect(clip.pixelsPerUnit).toBe(1/spec.displayScale);expect(clip.frameCount).toBe(spec.frameCount);}
  expect(pack.sprites.find(c=>c.clip==='fall'&&c.ownerId==='player')!.frameRegions![0]).toMatchObject({x:1075,width:266,height:724});
 });
 it.each(['region','anchor','path','scale','impact','fps','loop','filter'] as const)('rejects invalid authored %s',kind=>{
  const manifest=JSON.parse(authored.textures.get('assets/characters/player_animations.json')!.toString());
  if(kind==='region')manifest.fall.sourceRegions[0][0]=-1;
  if(kind==='anchor')manifest.fall.frameFootAnchors=[[0,0]];
  if(kind==='path')manifest.fall.sourceSheet='../outside.png';
  if(kind==='scale')manifest.fall.displayScale=0;
  if(kind==='impact')manifest.fall.impactFrame=manifest.fall.frameCount;
  if(kind==='fps')manifest.fall.fps=0;
  if(kind==='loop')manifest.fall.loop='not a boolean';
  if(kind==='filter')manifest.fall.smoothFiltering='not a boolean';
  const textureFiles=new Map(authored.textures);textureFiles.set('assets/characters/player_animations.json',Buffer.from(JSON.stringify(manifest)));
  expect(()=>buildGameplayPack({...input,textureFiles})).toThrow();
 });
});
