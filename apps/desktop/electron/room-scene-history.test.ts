import {it,expect,vi} from 'vitest';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const fault=vi.hoisted(()=>({rejectRestore:false}));
vi.mock('node:fs',async original=>{
 const fs=await original<typeof import('node:fs')>();
 return {...fs,writeFileSync:(file:import('node:fs').PathLike,data:string|Buffer)=>{
  if(fault.rejectRestore&&String(file).endsWith('room_006.tscn')&&Buffer.isBuffer(data)&&data.toString()==='old authored scene') {
   fault.rejectRestore=false;throw new Error('scene restore write failed');
  }
  return fs.writeFileSync(file,data);
 }};
});
// Simulate a newer compiler projection. Actual app Regenerate/Undo separately
// exercises the real compiler; these tests isolate scene ownership and rollback.
vi.mock('@metroforge/generation',async original=>{
 const generation=await original<typeof import('@metroforge/generation')>();
 const fs=await import('node:fs');const path=await import('node:path');
 return {...generation,restoreRoomRecord:(project:string,id:string,record:Record<string,unknown>)=>{
  const file=path.join(project,'data/rooms/rooms.json'),rooms=JSON.parse(fs.readFileSync(file,'utf8'));
  rooms.rooms[id]=record;fs.writeFileSync(file,JSON.stringify(rooms));
  fs.writeFileSync(path.join(project,'scenes/rooms',id+'.tscn'),'new compiler projection');
  return {success:true,errors:[]};
 }};
});
import {recordRoomEdit,snapshotRoomScene,undoRoomEdit,redoRoomEdit,canUndoRoom,canRedoRoom} from './edit-history-store.js';
const root=join(tmpdir(),'metroforge-room-scene-history');mkdirSync(root,{recursive:true});
function fixture() {
 const project=mkdtempSync(root+'/case-');for(const folder of ['data/rooms','scenes/rooms'])mkdirSync(join(project,folder),{recursive:true});
 const scene=join(project,'scenes/rooms/room_006.tscn'),rooms=join(project,'data/rooms/rooms.json');
 const before={id:'room_006',stairFlights:['original']},after={id:'room_006',stairFlights:['updated']};
 writeFileSync(scene,'old authored scene');const oldScene=snapshotRoomScene(project,'room_006');
 writeFileSync(rooms,JSON.stringify({rooms:{room_006:after,room_007:{id:'room_007',keep:true}}}));writeFileSync(scene,'new authored scene');
 recordRoomEdit(project,'room_006',before,'Regenerate room',oldScene);return {project,scene,rooms,before,after};
}
it('restores exact before and after scenes despite a different compiler projection',()=>{
 const f=fixture();expect(undoRoomEdit(f.project).success).toBe(true);
 expect(readFileSync(f.scene,'utf8')).toBe('old authored scene');
 expect(JSON.parse(readFileSync(f.rooms,'utf8')).rooms.room_006).toEqual(f.before);
 expect(redoRoomEdit(f.project).success).toBe(true);expect(readFileSync(f.scene,'utf8')).toBe('new authored scene');
 expect(JSON.parse(readFileSync(f.rooms,'utf8')).rooms.room_007).toEqual({id:'room_007',keep:true});
});
it.each(['scene','record'])('rejects external %s drift without consuming Undo',kind=>{
 const f=fixture();if(kind==='scene')writeFileSync(f.scene,'external user scene');
 else {const rooms=JSON.parse(readFileSync(f.rooms,'utf8'));rooms.rooms.room_006.note='external user work';writeFileSync(f.rooms,JSON.stringify(rooms));}
 const scene=readFileSync(f.scene),rooms=readFileSync(f.rooms);
 expect(undoRoomEdit(f.project).success).toBe(false);expect(canUndoRoom(f.project)).toBe(true);expect(canRedoRoom(f.project)).toBe(false);
 expect(readFileSync(f.scene).equals(scene)).toBe(true);expect(readFileSync(f.rooms).equals(rooms)).toBe(true);
});
it('rolls back both files when exact scene restoration fails',()=>{
 const f=fixture(),scene=readFileSync(f.scene),rooms=readFileSync(f.rooms);fault.rejectRestore=true;
 expect(undoRoomEdit(f.project).success).toBe(false);
 expect(readFileSync(f.scene).equals(scene)).toBe(true);expect(readFileSync(f.rooms).equals(rooms)).toBe(true);
 expect(canUndoRoom(f.project)).toBe(true);expect(undoRoomEdit(f.project).success).toBe(true);
});
