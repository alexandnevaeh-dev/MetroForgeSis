import assert from 'node:assert/strict';
import { startSpeechRecording } from '../apps/desktop/src/studio/speech-capture.ts';
globalThis.window = {setTimeout,clearTimeout};
let stopped=0,created=0,grant;
const stream={getTracks:()=>[{stop:()=>stopped++}]};
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{grant=resolve;})}},configurable:true});
globalThis.MediaRecorder=class {constructor(){created++;}};
const pending=startSpeechRecording();
pending.stop(); grant(stream);
await assert.rejects(pending.done,/cancelled/);
assert.equal(created,0);assert.equal(stopped,1);
for(const phase of ['constructor','start']) {
  navigator.mediaDevices.getUserMedia=async()=>stream;
  globalThis.MediaRecorder=class {constructor(){if(phase==='constructor')throw new Error(phase);} start(){throw new Error(phase);}};
  const recording=startSpeechRecording();
  await assert.rejects(recording.done,new RegExp(phase));
}
assert.equal(stopped,3);
globalThis.MediaRecorder=class {state='inactive';mimeType='audio/webm';start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['sample'])});this.onstop();}};
const normal=startSpeechRecording();await Promise.resolve();normal.stop();
assert.equal((await normal.done).size,6);assert.equal(stopped,4);
console.log('PASS: pending permission cancellation, constructor/start failure cleanup, normal stop');
