import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,utimesSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {applyRoomEditAndRecompile,applyWorldEditAndRecompile} from '../packages/generation/dist/project-edit-service.js';
function snapshot(dir) {
 return readdirSync(dir,{recursive:true}).sort().filter(name=>statSync(join(dir,name)).isFile()).map(name=>({name,bytes:readFileSync(join(dir,name)).toString('base64'),modified:statSync(join(dir,name)).mtimeMs}));
}
for(const engine of ['unity','unreal']) for(const identification of ['manifest','fingerprint']) {
 const dir=mkdtempSync(join(tmpdir(),'metroforge-foreign-edit-'));
 mkdirSync(join(dir,'data/rooms'),{recursive:true});
 if(identification==='manifest') writeFileSync(join(dir,'engine.json'),JSON.stringify({engine}));
 else if(engine==='unity') {
  mkdirSync(join(dir,'ProjectSettings'));writeFileSync(join(dir,'ProjectSettings/ProjectVersion.txt'),'m_EditorVersion: 6000.3.0f1');
 } else writeFileSync(join(dir,'Fixture.uproject'),'{}');
 for(const file of ['data/rooms/rooms.json','world_graph.json']) {
  writeFileSync(join(dir,file),'original sentinel');utimesSync(join(dir,file),1000000000,1000000000);
 }
 const before=snapshot(dir);
 for(const result of [applyRoomEditAndRecompile(dir,{roomId:'room_000',width:900}),applyWorldEditAndRecompile(dir,{type:'move_room',roomId:'room_000',x:40,y:80})]) {
  assert.equal(result.success,false);assert.match(result.errors.join(' '),/Godot adapter/);
 }
 assert.deepEqual(snapshot(dir),before,`${engine} ${identification} must not create or rewrite files`);
}
console.log('PASS: Unity/Unreal room and world edits rejected unchanged with manifest and fingerprint detection');
