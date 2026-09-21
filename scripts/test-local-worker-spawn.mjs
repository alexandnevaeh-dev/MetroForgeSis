import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {LocalSpriteWorkerProvider} from '../packages/assets/dist/providers/local-sprite-worker.js';
const original = childProcess.spawn;
try {
 childProcess.spawn = () => { throw new Error('Injected EPERM'); };
 syncBuiltinESMExports();
 const worker = new LocalSpriteWorkerProvider();
 const caps = await worker.getCapabilities();
 assert.equal(caps.ok,false);
 assert.match(caps.error,/SPAWN_ERROR.*Injected EPERM/);
 const result=await worker.generate({kind:'character_sheet',width:32,height:32,frameCount:1,seed:1,fill:[1,2,3],accent:[4,5,6]});
 assert.equal(result.subprocessFailure.reason,'SPAWN_ERROR');
 console.log('PASS: synchronous spawn failure is structured for health and generation');
} finally {childProcess.spawn=original;syncBuiltinESMExports();}
