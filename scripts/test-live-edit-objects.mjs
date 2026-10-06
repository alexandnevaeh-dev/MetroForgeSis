import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveEditSession } from '../packages/engines/dist/live-edit-session.js';
const object = { id: 'platform', roomId: 'room_025', x: 40, y: 80, properties: { width: 48, height: 16 } };
const create = () => new LiveEditSession('project', 'session', [], new Set(['width', 'height']));
const tx = s => ({ projectId: 'project', sessionId: 'session', baseRevision: s.snapshot().revision });
test('construct, rearrange, deconstruct and reverse a room object', () => {
 const s=create();
 s.commit({...tx(s),operations:[{type:'add',object},{type:'move',objectId:'platform',x:96,y:128}]});
 assert.equal(s.snapshot().objects[0].x,96);
 s.commit({...tx(s),operations:[{type:'remove',objectId:'platform'}]});
 assert.equal(s.snapshot().objects.length,0);
 s.undo(tx(s)); assert.equal(s.snapshot().objects[0].x,96);
 s.undo(tx(s)); assert.equal(s.snapshot().objects.length,0);
 s.redo(tx(s)); assert.equal(s.snapshot().objects[0].y,128);
 s.redo(tx(s)); assert.equal(s.snapshot().objects.length,0);
});
test('a failed mixed transaction preserves objects, revision and history', () => {
 const s=create(); const before=s.snapshot();
 assert.throws(()=>s.commit({...tx(s),operations:[{type:'add',object},{type:'remove',objectId:'missing'}]}));
 assert.deepEqual(s.snapshot(),before);
 assert.throws(()=>s.commit({...tx(s),operations:[{type:'add',object},{type:'add',object}]}));
 assert.deepEqual(s.snapshot(),before);
});
test('added values are validated and copied; runtime acknowledgement becomes stale after deletion',()=>{
 const s=create();const supplied=structuredClone(object);
 s.commit({...tx(s),operations:[{type:'add',object:supplied}]});supplied.properties.width=900;
 assert.equal(s.snapshot().objects[0].properties.width,48);
 s.markSaved(s.snapshot().revision);s.acknowledgeRuntime('project','session',s.snapshot().revision);
 s.commit({...tx(s),operations:[{type:'remove',objectId:'platform'}]});
 assert.equal(s.snapshot().dirty,true);assert.equal(s.snapshot().runtimeSynchronized,false);
 assert.throws(()=>s.commit({...tx(s),operations:[{type:'add',object:{...object,x:NaN}}]}));
 assert.equal(s.snapshot().objects.length,0);
});
