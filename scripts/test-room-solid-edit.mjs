import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roomSolidObjects, withRoomSolids } from '../packages/engines/dist/room-solid-edit.js';
import { LiveEditSession } from '../packages/engines/dist/live-edit-session.js';
const pack=JSON.parse(readFileSync(new URL('../GeneratedGames/ashen-covenant-sideview-unity/Assets/StreamingAssets/gameplay.json',import.meta.url),'utf8'));
test('authored Unity geometry roundtrips without changing content',()=>{
 assert.deepEqual(withRoomSolids(pack,'room_025',roomSolidObjects(pack,'room_025')),pack);
});
test('room edits and undo preserve abilities, doors and every other room',()=>{
 const objects=roomSolidObjects(pack,'room_025');const session=new LiveEditSession('p','s',objects,new Set(['width','height','name']));
 const tx=()=>({projectId:'p',sessionId:'s',baseRevision:session.snapshot().revision});
 session.commit({...tx(),operations:[{type:'remove',objectId:objects[1].id},{type:'add',object:{id:'new-platform',roomId:'room_025',x:200,y:300,properties:{width:80,height:16,name:'AuthoredPlatform'}}}]});
 const updated=withRoomSolids(pack,'room_025',session.snapshot().objects);
 assert.equal(updated.rooms.find(r=>r.id==='room_025').solids.at(-1).name,'AuthoredPlatform');
 updated.rooms.find(r=>r.id==='room_025').solids=structuredClone(pack.rooms.find(r=>r.id==='room_025').solids);
 assert.deepEqual(updated,pack);
 session.undo(tx());
 // Removal undo restores object content, though map insertion order can change.
 const restored=withRoomSolids(pack,'room_025',session.snapshot().objects);
 const sort=rs=>rs.map(r=>JSON.stringify(r)).sort();
 assert.deepEqual(sort(restored.rooms.find(r=>r.id==='room_025').solids),sort(pack.rooms.find(r=>r.id==='room_025').solids));
});
test('invalid geometry and cross-room objects cannot produce an export',()=>{
 const objects=roomSolidObjects(pack,'room_025');
 assert.throws(()=>withRoomSolids(pack,'room_025',[{...objects[0],roomId:'room_000'}]));
 assert.throws(()=>withRoomSolids(pack,'room_025',[{...objects[0],properties:{width:-1,height:16}}]));
 assert.throws(()=>withRoomSolids(pack,'room_025',[objects[0],objects[0]]));
});
