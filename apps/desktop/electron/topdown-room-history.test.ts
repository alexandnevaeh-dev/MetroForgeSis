import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {applyRoomEditAndRecompile,snapshotRoomRecord} from '@metroforge/generation';
import {recordRoomEdit,undoRoomEdit,redoRoomEdit,canUndoRoom,canRedoRoom} from './edit-history-store.js';
it('undoes and redoes top-down props through actual desktop room history',()=>{
 const root=mkdtempSync(join(tmpdir(),'topdown-history-'));mkdirSync(join(root,'data/world'),{recursive:true});
 writeFileSync(join(root,'project.godot'),'[application]\nconfig/name="history"');
 const path=join(root,'data/world/overworld.json');writeFileSync(path,JSON.stringify({areas:[{id:'room_1',tiles:[[0]]}]}));
 const previous=snapshotRoomRecord(root,'room_1')!;
 const result=applyRoomEditAndRecompile(root,{roomId:'room_1',propPlacements:[]});expect(result.success).toBe(true);
 recordRoomEdit(root,'room_1',previous,'Change props');expect(canUndoRoom(root)).toBe(true);
 expect(undoRoomEdit(root).success).toBe(true);expect(Object.hasOwn(JSON.parse(readFileSync(path,'utf8')).areas[0],'propPlacements')).toBe(false);
 expect(canRedoRoom(root)).toBe(true);expect(redoRoomEdit(root).success).toBe(true);
 expect(JSON.parse(readFileSync(path,'utf8')).areas[0].propPlacements).toEqual([]);
 expect(canUndoRoom(root)).toBe(true);expect(canRedoRoom(root)).toBe(false);
});
