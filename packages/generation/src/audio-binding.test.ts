import {describe,it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {applyAudioBinding,readAudioBindings,undoAudioBinding} from './audio-binding.js';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function wave(sample:number){const b=Buffer.alloc(44+16000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(16000,40);for(let i=44;i<b.length;i+=2)b.writeInt16LE(sample,i);return b;}
function fixture(){
 const project=mkdtempSync(join(tmpdir(),'audio-binding-'));for(const folder of ['audio/sfx','audio/music','assets/generated/audio/sfx'])mkdirSync(join(project,folder),{recursive:true});
 const dna=Buffer.from(JSON.stringify({archetype:'SIDE_VIEW_METROIDVANIA',title:'Test castle'}));writeFileSync(join(project,'game_dna.json'),dna);writeFileSync(join(project,'engine.json'),' {"engine":"godot"}');writeFileSync(join(project,'validation_report.json'),'{"passed":true,"productionReady":true}');const original=wave(1000);writeFileSync(join(project,'audio/sfx/door.wav'),original);writeFileSync(join(project,'audio/music/title.wav'),original);
 const take=(sample:number)=>{const path='assets/generated/audio/sfx/'+randomUUID()+'.wav',value=wave(sample),metadataPath=path.replace(/\.wav$/,'.json');writeFileSync(join(project,path),value);writeFileSync(join(project,metadataPath),JSON.stringify({path,metadataPath,model:'stabilityai/stable-audio-3-small-sfx',sha256:hash(value),sampleRate:8000,duration:1,archetype:'SIDE_VIEW_METROIDVANIA',sourceDnaSha256:hash(dna),approved:false,productionReady:false,gameplayApplied:false,request:{kind:'sfx',prompt:'door',duration:1,seed:42}}));return {path,value,metadataPath};};
 return {project,original,take};
}
describe('Reviewed audio event binding',()=>{
 it('applies exact take bytes, keeps recoverable preimages and restores them without reapproving validation',()=>{
  const f=fixture(),take=f.take(4000),before=readFileSync(join(f.project,take.metadataPath));const state=readAudioBindings(f.project,take.path);const applied=applyAudioBinding(f.project,take.path,'audio/sfx/door.wav',state.revision);
  expect(readFileSync(join(f.project,'audio/sfx/door.wav'))).toEqual(take.value);expect(JSON.parse(readFileSync(join(f.project,take.metadataPath),'utf8')).gameplayApplied).toBe(true);expect(JSON.parse(readFileSync(join(f.project,'validation_report.json'),'utf8')).passed).toBe(false);
  undoAudioBinding(f.project,take.path,applied.revision);expect(readFileSync(join(f.project,'audio/sfx/door.wav'))).toEqual(f.original);expect(readFileSync(join(f.project,take.metadataPath))).toEqual(before);expect(JSON.parse(readFileSync(join(f.project,'validation_report.json'),'utf8')).passed).toBe(false);
 });
 it('rejects stale selection, wrong event type and modified source before changing existing audio',()=>{
  const f=fixture(),take=f.take(4000),state=readAudioBindings(f.project,take.path);expect(()=>applyAudioBinding(f.project,take.path,'audio/music/title.wav',state.revision)).toThrow(/same audio type/);writeFileSync(join(f.project,'audio/sfx/door.wav'),wave(2500));expect(()=>applyAudioBinding(f.project,take.path,'audio/sfx/door.wav',state.revision)).toThrow(/refresh/);writeFileSync(join(f.project,take.path),wave(8000));expect(readAudioBindings(f.project,take.path).sourceError).toMatch(/changed/);expect(readFileSync(join(f.project,'audio/sfx/door.wav'))).toEqual(wave(2500));
 });
 it('preserves later user edits when Undo would overwrite them',()=>{
  const f=fixture(),take=f.take(4000),applied=applyAudioBinding(f.project,take.path,'audio/sfx/door.wav',readAudioBindings(f.project,take.path).revision);writeFileSync(join(f.project,'audio/sfx/door.wav'),wave(7000));expect(()=>undoAudioBinding(f.project,take.path,applied.revision)).toThrow();expect(()=>undoAudioBinding(f.project,take.path,readAudioBindings(f.project,take.path).revision)).toThrow(/preserve/);expect(readFileSync(join(f.project,'audio/sfx/door.wav'))).toEqual(wave(7000));
 });
 it('tracks displaced takes and restores both provenance and audio in LIFO order',()=>{
  const f=fixture(),a=f.take(4000),b=f.take(6000);applyAudioBinding(f.project,a.path,'audio/sfx/door.wav',readAudioBindings(f.project,a.path).revision);const firstMeta=readFileSync(join(f.project,a.metadataPath));const second=applyAudioBinding(f.project,b.path,'audio/sfx/door.wav',readAudioBindings(f.project,b.path).revision);expect(JSON.parse(readFileSync(join(f.project,a.metadataPath),'utf8')).gameplayApplied).toBe(false);
  const undone=undoAudioBinding(f.project,b.path,second.revision);expect(readFileSync(join(f.project,a.metadataPath))).toEqual(firstMeta);expect(readFileSync(join(f.project,'audio/sfx/door.wav'))).toEqual(a.value);undoAudioBinding(f.project,b.path,undone.revision);expect(readFileSync(join(f.project,'audio/sfx/door.wav'))).toEqual(f.original);
 });
 it('keeps Quantum and unimplemented engine adapters outside the binding workflow',()=>{
  const f=fixture();writeFileSync(join(f.project,'engine.json'),'{"engine":"unity"}');expect(readAudioBindings(f.project).supported).toBe(false);writeFileSync(join(f.project,'game_dna.json'),'{"archetype":"QUANTUM_SIMULATION_ROGUELITE"}');expect(readAudioBindings(f.project).supported).toBe(false);
 });
 it('allows recovery after a title edit while rejecting reuse of a take captured for the previous DNA',()=>{
  const f=fixture(),take=f.take(4000);applyAudioBinding(f.project,take.path,'audio/sfx/door.wav',readAudioBindings(f.project,take.path).revision);writeFileSync(join(f.project,'game_dna.json'),'{"archetype":"SIDE_VIEW_METROIDVANIA","title":"Edited title"}');const state=readAudioBindings(f.project,take.path);expect(state.supported).toBe(true);expect(state.source).toBeUndefined();expect(state.undoTarget).toBe('audio/sfx/door.wav');expect(()=>applyAudioBinding(f.project,take.path,'audio/sfx/door.wav',state.revision)).toThrow(/identity changed/);undoAudioBinding(f.project,take.path,state.revision);expect(readFileSync(join(f.project,'audio/sfx/door.wav'))).toEqual(f.original);
 });
});
