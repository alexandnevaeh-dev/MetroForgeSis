import assert from 'node:assert/strict';
import {spawnCapturedSync,execFileCapturedSync} from '../packages/qa/dist/process-capture.js';
const opts={encoding:'utf8',timeout:5000,windowsHide:true};
const result=spawnCapturedSync(process.execPath,['-e',"console.log('out');console.error('err');process.exitCode=7"],opts);
assert.equal(result.status,7);assert.match(result.stdout,/out/);assert.match(result.stderr,/err/);
assert.throws(()=>execFileCapturedSync(process.execPath,['-e','process.exit(3)'],opts),/exited with 3/);
const missing=spawnCapturedSync('metroforge-no-such-executable',[],opts);assert.ok(missing.error);
const timeout=spawnCapturedSync(process.execPath,['-e','setInterval(()=>{},1000)'],{...opts,timeout:100});assert.ok(timeout.error);assert.notEqual(timeout.status,0);
if(process.platform==='win32') { const overflow=spawnCapturedSync(process.execPath,['-e',"console.log('long output')"],{...opts,maxBuffer:2}); assert.equal(overflow.error.code,'ENOBUFS');assert.equal(overflow.status,null); }
console.log('PASS: captured stdout/stderr, nonzero exit, missing executable, timeout and output limit');
