import {beforeEach,afterEach,it,expect} from 'vitest';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {readArchiveFurnishings,saveArchiveFurnishing,restoreArchiveFurnishing} from './archive-furnishing-authoring.js';
let project:string;
const rel='data/visual/stormglass-room-kits.json';
const put=(path:string,text:string)=>{mkdirSync(dirname(join(project,path)),{recursive:true});writeFileSync(join(project,path),text);};
const bytes=(path=rel)=>readFileSync(join(project,path));
beforeEach(()=>{
 project=mkdtempSync(join(tmpdir(),'archive-authoring-'));
 put('project.godot','[application]');put('game_dna.json',JSON.stringify({archetype:'SIDE_VIEW_METROIDVANIA',identity:{title:'Stormglass Reliquary Archive'}}));
 put('data/rooms/rooms.json',JSON.stringify({rooms:{room_047:{width:1536,height:1536}}}));put('scenes/rooms/room_047.tscn','original scene geometry');
 put(rel,JSON.stringify({version:1,rooms:{room_047:{props:[],archiveBays:[{id:'Desk',kind:'scribe-desk',x:1088,width:192,height:40,privateAuthorNote:'retain me'}]},room_046:{archiveBays:[]}}}));
 put('world_graph.json','original graph');put('progression_graph.json','original progression');put('validation_report.json',JSON.stringify({passed:true,productionReady:true,keep:'original checks'}));
});
afterEach(()=>rmSync(project,{recursive:true,force:true}));
it('edits one original assembly with exact undo/redo and preserves geometry and other records',()=>{
 const original=bytes(),scene=bytes('scenes/rooms/room_047.tscn'),rooms=bytes('data/rooms/rooms.json'),state=readArchiveFurnishings(project,'room_047');
 const saved=saveArchiveFurnishing(project,'room_047',{id:'Desk',x:1104,width:192,height:56,floorY:null},state.revision);
 expect(saved.bays[0]).toMatchObject({x:1104,height:56});expect(saved.bays[0].floorY).toBeUndefined();
 const config=JSON.parse(bytes().toString());expect(config.rooms.room_047.archiveBays[0]).toMatchObject({privateAuthorNote:'retain me',preserveSize:true});expect(config.rooms.room_046).toEqual({archiveBays:[]});
 expect(bytes('scenes/rooms/room_047.tscn')).toEqual(scene);expect(bytes('data/rooms/rooms.json')).toEqual(rooms);expect(bytes('world_graph.json').toString()).toBe('original graph');expect(bytes('progression_graph.json').toString()).toBe('original progression');
 expect(JSON.parse(bytes('validation_report.json').toString())).toMatchObject({passed:false,productionReady:false,keep:'original checks'});
 const changed=bytes(),undone=restoreArchiveFurnishing(project,'room_047',saved.revision,saved.historyToken);expect(bytes()).toEqual(original);
 restoreArchiveFurnishing(project,'room_047',undone.revision,undone.historyToken);expect(bytes()).toEqual(changed);
});
it.each([{x:100},{height:385},{width:0},{floorY:1537},{x:NaN},{height:'56'},{kind:'new-role'},{id:'Unknown'}])('rejects invalid edits before writes %j',patch=>{
 const original=bytes(),state=readArchiveFurnishings(project,'room_047');
 expect(()=>saveArchiveFurnishing(project,'room_047',{id:'Desk',x:1088,width:192,height:40,floorY:null,...patch} as any,state.revision)).toThrow();expect(bytes()).toEqual(original);expect(existsSync(join(project,'.metroforge'))).toBe(false);
});
it('refuses stale geometry or config without overwriting user work',()=>{
 const state=readArchiveFurnishings(project,'room_047');put('scenes/rooms/room_047.tscn','user changed geometry');
 expect(()=>saveArchiveFurnishing(project,'room_047',{id:'Desk',x:1088,width:192,height:56,floorY:null},state.revision)).toThrow('Project changed');expect(bytes('scenes/rooms/room_047.tscn').toString()).toBe('user changed geometry');
});
it('rejects unrelated genres and damaged undo preimages',()=>{
 const state=readArchiveFurnishings(project,'room_047'),saved=saveArchiveFurnishing(project,'room_047',{id:'Desk',x:1088,width:192,height:56,floorY:1472},state.revision),before=bytes();
 put('.metroforge/archive_furnishing_history/'+saved.historyToken+'.before.json','{}');expect(()=>restoreArchiveFurnishing(project,'room_047',saved.revision,saved.historyToken)).toThrow('history bytes changed');expect(bytes()).toEqual(before);
 put('game_dna.json',JSON.stringify({archetype:'TOP_DOWN_ACTION_ADVENTURE',identity:{title:'Stormglass Reliquary'}}));expect(()=>readArchiveFurnishings(project,'room_047')).toThrow('side-view');
});
it('preserves malformed validation reports before any promotion or history write',()=>{
 const state=readArchiveFurnishings(project,'room_047'),before=bytes();put('validation_report.json','null');
 expect(()=>saveArchiveFurnishing(project,'room_047',{id:'Desk',x:1088,width:192,height:56,floorY:null},state.revision)).toThrow('validation report is invalid');expect(bytes()).toEqual(before);expect(existsSync(join(project,'.metroforge'))).toBe(false);
});
it('keeps explicit zero floor separate from the native default without approving support',()=>{
 const state=readArchiveFurnishings(project,'room_047'),saved=saveArchiveFurnishing(project,'room_047',{id:'Desk',x:1088,width:192,height:40,floorY:0},state.revision);
 expect(saved.bays[0].floorY).toBe(0);expect(JSON.parse(bytes('validation_report.json').toString()).passed).toBe(false);
});
it.each([{kind:['scribe-desk']},{preserveSize:'true'}])('refuses malformed saved furnishing roles or policy %j',patch=>{
 const config=JSON.parse(bytes().toString());Object.assign(config.rooms.room_047.archiveBays[0],patch);put(rel,JSON.stringify(config));const before=bytes();
 expect(()=>readArchiveFurnishings(project,'room_047')).toThrow('valid authored archive');expect(bytes()).toEqual(before);
});
