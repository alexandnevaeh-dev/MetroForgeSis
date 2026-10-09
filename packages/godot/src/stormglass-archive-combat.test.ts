import {describe, it, expect} from 'vitest';
import {applyStormglassArchiveEncounterComposition, generateRoomScene, buildPublishedRoomRecord, recompileRooms, type RoomAssemblyOptions} from './room-assembler.js';
import {buildStormglassArchiveChamber} from './stormglass-archive-chamber.js';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GameDNASchema} from '@metroforge/schemas';
import {generateGameContent} from '@metroforge/procedural';

const roster = [
  {id:'enemy_000',movement:'patrol',combat:{type:'melee'}},
  {id:'enemy_007',movement:'teleport',combat:{type:'burst'}},
];
function options(id='room_047'): RoomAssemblyOptions {
  return {hasEnemy:false,enemyIndex:0,hasAbilityPickup:false,abilityPickups:[],isBossRoom:false,
    bossId:'',hasSavePoint:false,width:1536,height:1536,biomeIndex:0,connections:[],hasTileset:false,
    tileSize:32,npcs:[],hasItemPickup:true,itemId:'lost_echo_002',itemAmount:1,
    archiveChamberPlan:buildStormglassArchiveChamber(id),worldGraphArchetype:'secret',
    stormglassRoomTheme:id==='room_046'?'archive-loft':'archive-vault'};
}
describe('Archive chamber reward encounters',()=>{
  it('emits one grounded defined guard without replacing a curio, progression or return geometry',()=>{
    for(const id of ['room_046','room_047']){
      const opts=options(id), geometry=structuredClone(opts.archiveChamberPlan);
      applyStormglassArchiveEncounterComposition(id,opts,roster);
      const enemies=opts.entityPlacements!.filter(p=>p.kind==='enemy');
      expect(enemies).toHaveLength(1);
      expect(enemies[0].definitionId).toBe(id==='room_046'?'enemy_000':'enemy_007');
      expect(enemies[0].y).toBe(1472);
      // The complete patrol/teleport envelope (100px each side), not just its
      // origin, stays beyond the descent well and clear of the side walls.
      expect(enemies[0].x-100).toBeGreaterThan(864+64);
      expect(enemies[0].x+100).toBeLessThan(1536-192);
      expect(opts.entityPlacements!.some(p=>p.kind==='item_pickup'&&p.id==='lost_echo_002')).toBe(true);
      expect(opts.entityPlacements!.find(p=>p.kind==='item_pickup')!.x).toBeGreaterThan(enemies[0].x+100);
      expect(opts.archiveChamberPlan).toEqual(geometry);
      expect(opts.abilityPickups).toEqual([]);
      const scene=generateRoomScene(id,47,opts),record=buildPublishedRoomRecord(id,47,opts);
      expect(scene).toContain('position = Vector2(1088, 1472)');
      expect(scene).toContain('enemy_id = "'+enemies[0].definitionId+'"');
      // Clear Enemy.tscn's inherited enemy_000 idle. The runtime loads this
      // definition's own idle if present, otherwise its first walk frame.
      expect(scene).toContain('extra_animation_sheets = {}');
      expect(scene).not.toContain('"idle": "assets/enemies/enemy_000_idle.png"');
      expect(record.enemies).toEqual([id+'_reward_guard']);
    }
  });
  it('keeps edited guard membership and coordinates, including intentional removal',()=>{
    const opts=options(),authored=[{kind:'enemy' as const,id:'my_guard',definitionId:'enemy_000',x:1216,y:1472}];
    applyStormglassArchiveEncounterComposition('room_047',opts,roster,authored);
    expect(opts.entityPlacements).toEqual(authored);expect(opts.hasEnemy).toBe(true);
    opts.archiveChamberPlan=undefined;
    applyStormglassArchiveEncounterComposition('room_047',opts,roster,authored);
    expect(opts.entityPlacements).toEqual(authored);expect(opts.hasEnemy).toBe(true);
    applyStormglassArchiveEncounterComposition('room_047',opts,roster,[]);
    expect(opts.entityPlacements).toEqual([]);expect(opts.hasEnemy).toBe(false);
    applyStormglassArchiveEncounterComposition('room_047',opts,roster,authored,false);
    expect(opts.hasEnemy).toBe(false);
  });
  it('rejects an incompatible roster rather than emitting an undefined guard',()=>{
    expect(()=>applyStormglassArchiveEncounterComposition('room_047',options(),[])).toThrow('enemy_007');
    expect(()=>applyStormglassArchiveEncounterComposition('room_046',options('room_046'),[{...roster[0],movement:'fly'}])).toThrow('enemy_000');
  });
  it('leaves earlier profiles, the calm hall, bosses and explicit removals alone',()=>{
    const old={...options(),archiveChamberPlan:undefined};
    applyStormglassArchiveEncounterComposition('room_047',old,roster);expect(old.hasEnemy).toBe(false);
    const hall=options('room_044');applyStormglassArchiveEncounterComposition('room_044',hall,roster);expect(hall.hasEnemy).toBe(false);
    const boss={...options(),isBossRoom:true};applyStormglassArchiveEncounterComposition('room_047',boss,roster);expect(boss.hasEnemy).toBe(false);
    const removed=options();applyStormglassArchiveEncounterComposition('room_047',removed,roster,undefined,false);expect(removed.hasEnemy).toBe(false);
  });
  it('preserves a moved guard through the actual compiler paint/encounter path, then honors removal',()=>{
    const output=mkdtempSync(join(tmpdir(),'archive-guard-'));
    const dna=GameDNASchema.parse({version:'1',identity:{title:'Stormglass Reliquary',genre:'Metroidvania',tone:'quiet danger',visualStyle:'original gothic pixel art'},technical:{resolution:{width:1920,height:1080},tileSize:32,targetPlaytimeHours:2,difficulty:'normal'},combat:{style:'sword',meleeEnabled:true,rangedEnabled:false},movement:{walkSpeed:220,runSpeed:380,jumpHeight:160,gravity:980},abilities:['dash','double_jump','wall_slide','wall_jump','ground_slam','air_dash'].map(id=>({id,name:id,category:'movement',enabled:true})),world:{biomeCount:1,roomCount:48},narrative:{premise:'Recover the weather seals',protagonist:'Courier',centralConflict:'Restore the castle'},seed:42,profile:'MEDIUM',archetype:'SIDE_VIEW_METROIDVANIA'});
    const graph=JSON.parse(readFileSync('templates/godot-metroidvania/data/visual/blueprints/stormglass-archive-wing-campaign-v1.json','utf8')).worldGraph;
    const ids=graph.nodes.map((n:{id:string})=>n.id);
    const content=generateGameContent(dna,'MEDIUM',42,'room_038',ids);
    const input={outputDir:output,gameDna:dna,worldGraph:graph,gameContent:content,targetRoomIds:['room_047']};
    expect(recompileRooms(input).errors).toEqual([]);
    const file=join(output,'data/rooms/rooms.json'),saved=JSON.parse(readFileSync(file,'utf8'));
    const guard=saved.rooms.room_047.entityPlacements.find((p:{kind:string})=>p.kind==='enemy');
    expect(guard.definitionId).toBe('enemy_007');guard.x=1232;
    writeFileSync(file,JSON.stringify(saved));
    expect(recompileRooms({...input,roomOverrides:{room_047:{tileCells:[]}},regenerateEncounterRoomIds:['room_047']}).errors).toEqual([]);
    const painted=JSON.parse(readFileSync(file,'utf8')).rooms.room_047;
    expect(painted.archiveChamberPlan).toBeUndefined();
    expect(painted.entityPlacements.find((p:{kind:string})=>p.kind==='enemy')).toEqual(guard);
    expect(painted.enemies).toEqual(['room_047_reward_guard']);
    const scene=()=>readFileSync(join(output,'scenes/rooms/room_047.tscn'),'utf8');
    expect(scene()).toContain('position = Vector2(1232, 1472)');
    expect(recompileRooms({...input,roomOverrides:{room_047:{hasEnemy:false}}}).errors).toEqual([]);
    expect(scene()).not.toContain('parent="." instance=ExtResource("2_enemy")');
    expect(JSON.parse(readFileSync(file,'utf8')).rooms.room_047.forceEnemy).toBe(false);
    expect(recompileRooms(input).errors).toEqual([]);
    expect(scene()).not.toContain('parent="." instance=ExtResource("2_enemy")');
  });
});
