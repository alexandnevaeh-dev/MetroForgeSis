import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,utimesSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {applyRoomEditAndRecompile} from '../packages/generation/dist/project-edit-service.js';
for(const engine of ['unity','unreal']) {
 const dir=mkdtempSync(join(tmpdir(),'metroforge-foreign-edit-'));
 mkdirSync(join(dir,'data/rooms'),{recursive:true});
 writeFileSync(join(dir,'engine.json'),JSON.stringify({engine}));
 const file=join(dir,'data/rooms/rooms.json');writeFileSync(file,'original sentinel');
 utimesSync(file,1000000000,1000000000);const before=statSync(file).mtimeMs;
 const result=applyRoomEditAndRecompile(dir,{roomId:'room_000',width:900});
 assert.equal(result.success,false);assert.match(result.errors.join(' '),/Godot adapter/);
 assert.equal(readFileSync(file,'utf8'),'original sentinel');assert.equal(statSync(file).mtimeMs,before);
}
console.log('PASS: Unity and Unreal room edits rejected without rewriting project data');
