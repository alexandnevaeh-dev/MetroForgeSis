import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {readUnityRoomEdit,saveUnityRoomEdit} from '../packages/engines/dist/unity-room-edit-store.js';
const base='E:/Metroforge/Recovery-Audit/room-edit-tests';mkdirSync(base,{recursive:true});
const make=()=>{const dir=mkdtempSync(join(base,'save-'));mkdirSync(join(dir,'Assets/StreamingAssets'),{recursive:true});const content=JSON.stringify({rooms:[{id:'room_0',solids:[{name:'floor',x:0,y:100,width:200,height:16}],doors:[{targetRoomId:'room_1'}]}],abilities:[{id:'phase'}]});for(const path of ['gameplay.json','Assets/StreamingAssets/gameplay.json'])writeFileSync(join(dir,path),content);return dir;};
test('save both copies, preserve other data, retain backups and require restart',()=>{
 const dir=make(),state=readUnityRoomEdit(dir,'room_0');state.objects[0].x=30;
 const result=saveUnityRoomEdit(dir,'room_0',state.objects,state.fingerprints);
 assert.equal(result.restartRequired,true);
 const root=readFileSync(join(dir,'gameplay.json'),'utf8');assert.equal(root,readFileSync(join(dir,'Assets/StreamingAssets/gameplay.json'),'utf8'));
 const pack=JSON.parse(root);assert.equal(pack.rooms[0].solids[0].x,30);assert.equal(pack.abilities[0].id,'phase');assert.equal(pack.rooms[0].doors[0].targetRoomId,'room_1');
 assert.equal(JSON.parse(readFileSync(join(result.backup,'0.json'),'utf8')).rooms[0].solids[0].x,0);
 assert.deepEqual(readUnityRoomEdit(dir,'room_0').fingerprints,result.fingerprints);
});
test('external edits are preserved and mismatched copies reject opening',()=>{
 const dir=make(),state=readUnityRoomEdit(dir,'room_0');const path=join(dir,'gameplay.json');const changed=readFileSync(path,'utf8')+'\n';writeFileSync(path,changed);
 assert.throws(()=>saveUnityRoomEdit(dir,'room_0',state.objects,state.fingerprints),/changed/);assert.equal(readFileSync(path,'utf8'),changed);
 const pack=JSON.parse(changed);pack.abilities.push({id:'new'});writeFileSync(path,JSON.stringify(pack));assert.throws(()=>readUnityRoomEdit(dir,'room_0'),/differ/);
});
test('invalid edit leaves both copies untouched',()=>{
 const dir=make(),state=readUnityRoomEdit(dir,'room_0');state.objects[0].properties.width=0;
 assert.throws(()=>saveUnityRoomEdit(dir,'room_0',state.objects,state.fingerprints),/Invalid/);
 assert.deepEqual(readUnityRoomEdit(dir,'room_0').fingerprints,state.fingerprints);
});
