import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { GameDNASchema } from '../packages/schemas/dist/index.js';
import { GodotProjectAssembler } from '../packages/godot/dist/index.js';
import { generateGameContent } from '../packages/procedural/dist/index.js';
import { extractSheetFramePng } from '../packages/assets/dist/index.js';
import { buildRuinedCanopy } from './lib/ruined-canopy-world.mjs';
import {addCanopyStory,CANOPY_SPELLS,CANOPY_LORE} from './lib/ruined-canopy-story.mjs';
import { writeCanopyProvenance } from './lib/canopy-provenance.mjs';
import { canopyEnvironment, canopyTerrainV2 } from './lib/ruined-canopy-environment.mjs';
import { canopyActor, canopyIcon, canopySound, canopyPickup, canopyEffect } from './lib/ruined-canopy-art.mjs';

const seed = Number(process.argv[2] ?? 20260930);
if (!Number.isSafeInteger(seed)) throw new Error('Seed must be an integer');
const stamp = new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
const outputDir = resolve(`GeneratedGames/test-games/topdown/candidate-canopy-${stamp}`);
if (!outputDir.toLowerCase().startsWith('e:\\') || existsSync(outputDir)) throw new Error('A fresh E: candidate is required');
const gameDna = GameDNASchema.parse({ version:'0.1.0', archetype:'TOP_DOWN_ACTION_ADVENTURE', profile:'TINY_TEST',seed,
  identity:{title:'Ruined Canopy: Verdant Oath',genre:'Action-Adventure',tone:'mysterious hopeful',visualStyle:'rich stylized pixel art, HD-2D inspired diorama',tagline:'Carry the First Seed through a forest that remembers'},
  technical:{resolution:{width:1280,height:720},tileSize:32,targetPlaytimeHours:0.2,difficulty:'normal'},
  combat:{style:'directional melee',meleeEnabled:true,rangedEnabled:true},
  movement:{walkSpeed:120,runSpeed:185,jumpHeight:0,gravity:0,acceleration:850,deceleration:1100},
  abilities:[{id:'wind_disc',name:'Verdant Disc',category:'tool',enabled:true}],
  world:{biomeCount:1,roomCount:16,regionCount:1},
  narrative:{premise:'Aster returns the First Seed to the Hollow Crown. Follow amber paths past moss-lit idols, cross the ruined aqueduct, recover the Verdant Disc, then open the living vine seals and face the corrupted grove guardian.',protagonist:'Aster, the Seedbearer',centralConflict:'Restore the woodland heart before the ruins consume its roots'},
  topDown:{movementDirections:8,worldStyle:'screen_by_screen',dungeonCount:1,townCount:0,worldVariantEnabled:false,dungeonItemProgression:true,puzzleDensity:0.25,secretDensity:0.1},
});
const world = buildRuinedCanopy(seed);
const gameContent = generateGameContent(gameDna,'TINY_TEST',seed,world.overworld.victoryAreaId,world.roomIds);
for(const enemy of gameContent.enemies) {enemy.name=enemy.id==='enemy_001'?'Rune-Stalker':'Rootbound Sentinel';enemy.health=enemy.id==='enemy_001'?28:35;enemy.damage=8;enemy.speed=enemy.id==='enemy_001'?48:65;}
const boss=gameContent.bosses[0];boss.name='The Hollow Crown';boss.arenaRoomId=world.overworld.victoryAreaId;boss.health=240;
boss.phases=[{phase:1,healthThreshold:1,attacks:['slam'],telegraphDuration:0.65,recoveryWindow:1.0},{phase:2,healthThreshold:0.5,attacks:['slam','projectile','area_burst'],telegraphDuration:0.5,recoveryWindow:0.9}];
const wind=gameContent.items.find(item=>item.id==='wind_disc');if(wind)wind.name='Verdant Disc';
gameContent.npcs=[{id:'npc_000',name:'Mira of the Roots',role:'lore',roomId:'overworld',dialogueIds:['dlg_npc_000_lore'],questIds:[]}];
gameContent.quests=[];gameContent.shops=[];
gameContent.dialogues=[{id:'dlg_npc_000_lore',lines:[{speaker:'Mira',text:'The forest has swallowed the old road. Follow the amber stones to Mosslight Clearing.'},{speaker:'Mira',text:'The shrine beyond the aqueduct holds the Verdant Disc. Bring it back to open the vine seal.'}]}];
const textures = new Map();
addCanopyStory(gameContent);
const png=(path,bytes)=>textures.set(path,bytes);
const json=(path,data)=>textures.set(path,Buffer.from(JSON.stringify(data,null,2)));
json('data/abilities/spells.json',CANOPY_SPELLS);
json('data/lore/canopy.json',CANOPY_LORE);
json('data/visual/hd2d.json',{enabled:true,style:'pixel-sprites-in-3d-diorama',productionApproved:false});
const terrain=canopyTerrainV2();
png('assets/tilesets/biome_0/source.png',terrain.bytes);
json('assets/tilesets/biome_0/terrain.json',{tileSize:32,roles:terrain.roles});
const actions={idle:12,walk:12,run:16,attack:12,hurt:6,death:12};
const facings=['N','NE','E','SE','S','SW','W','NW'];
for(const [action,count] of Object.entries({...actions,cast:12})) {
  for(const facing of facings)png(`assets/characters/player_${action}_${facing}.png`,canopyActor('hero',action,facing,count));
  png(`assets/characters/player_${action}.png`,canopyActor('hero',action,'S',count));
}
png('assets/characters/player.png',extractSheetFramePng(textures.get('assets/characters/player_idle_S.png'),64,64,0));
json('assets/characters/player_animations.json',Object.fromEntries(Object.entries({...actions,cast:12}).map(([action,count])=>[action,{frameCount:count,fps:action==='cast'||action==='run'?24:action==='attack'?30:action==='idle'?10:action==='death'?15:16,loop:['idle','walk','run'].includes(action),...(action==='attack'?{attackTiming:{activeStart:3.6,activeEnd:7.2,recoveryEnd:12}}:{})}])));
for(const [id,kind,folder,size] of [['enemy_000','melee','enemies',64],['enemy_001','ranged','enemies',64],['boss_final','boss','bosses',128],['npc_000','npc','npcs',64],['npc_001','npc','npcs',64],['npc_002','npc','npcs',64]]) {
  for(const [action,count] of Object.entries(actions))png(`assets/${folder}/${id}_${action}.png`,canopyActor(kind,action,'S',count));
  const still=extractSheetFramePng(textures.get(`assets/${folder}/${id}_idle.png`),size,size,0);
  png(`assets/${folder}/${id}.png`,still);png(`assets/${folder}/${id}_idle_pose.png`,still);
  json(`assets/${folder}/${id}_animations.json`,Object.fromEntries(Object.entries(actions).map(([action,count])=>[action,{frameCount:count,fps:action==='attack'?21:action==='run'?24:action==='idle'?10:16,loop:['idle','walk','run'].includes(action)}])));
  if(folder==='enemies')for(const action of Object.keys(actions))png(`assets/enemies/${kind}_${action}.png`,textures.get(`assets/enemies/${id}_${action}.png`));
  if(folder==='enemies')png(`assets/enemies/${kind}.png`,still);
}
for(const area of world.overworld.areas) {
  const objects=[{kind:area.landmark,x:area.landmarkAt[0]*32,y:area.landmarkAt[1]*32,solid:true,id:`${area.id}_landmark`},...area.scenery];
  for(const [index,object] of objects.entries()) {
    if(index>0&&area.pois.some(poi=>Math.hypot(poi.x-object.x,poi.y-object.y)<72))continue;
    const art=canopyEnvironment(object.kind),relative=`assets/props/canopy/${object.kind}.png`;
    png(relative,art.bytes);
    const footprint=['root_arch','vine_gate','bridge'].includes(object.kind)?[{x:-65,y:-12,width:26,height:12},{x:39,y:-12,width:26,height:12}]:[{x:-12,y:-12,width:24,height:14}];
    const layout={version:1,sourceSize:[art.width,art.height],anchorPx:art.anchor,displayScale:1,occlusionFade:true,collisionRectsPx:object.solid?footprint:[]};
    area.propPlacements.push({id:object.id??`${area.id}_${object.kind}_${index}`,image:'res://'+relative,x:object.x,y:object.y,layout,kind:object.kind});
  }
}
for(const [path,kind] of [['assets/generated/chest/interactive_chest_closed.png','chest'],['assets/generated/chest/interactive_chest_open.png','chest_open'],['assets/generated/gate/interactive_ability_gate.png','gate'],['assets/generated/portal/interactive_portal.png','portal'],['assets/generated/checkpoint/interactive_checkpoint.png','seed'],['assets/props/interact/pickup.png','seed'],['assets/generated/collectible/collectible_health_pickup.png','health']])png(path,canopyIcon(kind));
const audioFiles=new Map(['pickup','ability','ui_click','player_attack','enemy_attack','death','hit','boss_hit','boss_attack'].map(id=>[id,canopySound(id)]));
png('assets/generated/items/health_pickup.png',canopyPickup('health'));
png('assets/generated/items/progression_pickup.png',canopyPickup('scrap'));
const effects=['hit_spark','death_puff','dash_trail','pickup_spark','ability_unlock','boss_phase_shift','area_burst','slam_shock','attack_warning','ranged_projectile'];
for(const id of effects)png(`assets/vfx/${id}.png`,canopyEffect(id,id==='ranged_projectile'?1:10));
json('assets/vfx/effects.json',Object.fromEntries(effects.filter(id=>id!=='ranged_projectile').map(id=>[id,{frameCount:10,frameWidth:32,frameHeight:32,fps:24,loop:false}])));
const result=new GodotProjectAssembler().assemble({outputDir,gameDna,...world,gameContent,textureFiles:textures,audioFiles});
if(!result.success)throw new Error(JSON.stringify(result.errors));
// This larger forest needs fifteen tiles vertically visible for route and combat readability.
const playerScene=join(outputDir,'scenes/player/Player.tscn');
writeFileSync(playerScene,readFileSync(playerScene,'utf8').replace('zoom = Vector2(2.5, 2.5)','zoom = Vector2(1.5, 1.5)'));
const npcScene=join(outputDir,'scenes/world/NPC.tscn');
writeFileSync(npcScene,readFileSync(npcScene,'utf8').replace('frame_count = 4','frame_count = 12'));
for(const file of ['CanopyAcceptance.gd','CanopyAcceptance.tscn','CanopyBossAcceptance.gd','CanopyBossAcceptance.tscn','CanopyBossTelegraphAcceptance.gd','CanopyBossTelegraphAcceptance.tscn','CanopyArtDetailAcceptance.gd','CanopyArtDetailAcceptance.tscn','CanopyPresentationAcceptance.gd','CanopyPresentationAcceptance.tscn','CanopyHD2DAcceptance.gd','CanopyHD2DAcceptance.tscn','CanopySpellAcceptance.gd','CanopySpellAcceptance.tscn','CanopyAnimationShowcase.gd','CanopyAnimationShowcase.tscn','CanopyTerrainDepthAcceptance.gd','CanopyTerrainDepthAcceptance.tscn']) {
  const destination=join(outputDir,file.endsWith('.gd')?'scripts/test':'scenes/test',file);
  writeFileSync(destination,readFileSync(join('scripts/test-cases',file)));
}
// No old source game/art is copied. Preserve the exact original source of each generated asset.
for(const [relative,bytes] of textures){const path=join(outputDir,relative);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}
writeFileSync(join(outputDir,'game_dna.json'),JSON.stringify(gameDna,null,2));
const generatedAt=new Date().toISOString();
writeFileSync(join(outputDir,'project.json'),JSON.stringify({projectId:randomUUID(),slug:'ruined-canopy',prompt:gameDna.narrative.premise,profile:'TINY_TEST',mode:'LOCAL_ONLY',seed,createdAt:generatedAt,lastGeneratedAt:generatedAt,gameDnaVersion:'0.1.0',generatorVersion:'0.1.0',archetype:gameDna.archetype,engine:'godot'},null,2));
const assets=[...textures,...[...audioFiles].map(([id,bytes])=>[`audio/sfx/${id}.wav`,bytes])].map(([path,bytes])=>({path,sha256:createHash('sha256').update(bytes).digest('hex')}));
writeFileSync(join(outputDir,'GAME_SET.json'),JSON.stringify({genre:'topdown',archetype:gameDna.archetype,generatedAt:new Date().toISOString(),seed,layoutStyle:'ruined_canopy',artRevision:5,presentationRevision:3,sourceAssets:null,artSource:'original detailed procedural pixel clusters and posed animation; original 3D diorama with lowered rivers and supported bridges; no prior game asset files copied',productionApproved:false,assets},null,2));
writeCanopyProvenance(outputDir);
writeFileSync(join(outputDir,'CANOPY_DESIGN.json'),JSON.stringify({compositionVersion:2,rooms:world.overworld.areas.map(({id,name,landmark,purpose,composition})=>({id,name,landmark,purpose,composition})),referenceConversation:'https://copilot.microsoft.com/chats/pw5YSx231xc1UyaGMwwwa',nativeValidated:false},null,2));
console.log(JSON.stringify({outputDir,rooms:world.overworld.areas.length,assets:assets.length,result}));
