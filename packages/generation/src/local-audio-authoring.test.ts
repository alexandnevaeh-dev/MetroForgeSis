import {describe,it,expect} from 'vitest';
import {inspectLocalAudioWav,localAudioBase,normalizeLocalAudioWav,validateLocalAudioRequest,listLocalAudioAlternatives} from './local-audio-authoring.js';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

function floatWav(sample:number):Buffer {
 const n=8000,header=Buffer.alloc(44),data=Buffer.alloc(n*4);
 header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(3,20);header.writeUInt16LE(1,22);header.writeUInt32LE(8000,24);header.writeUInt32LE(32000,28);header.writeUInt16LE(4,32);header.writeUInt16LE(32,34);header.write('data',36);header.writeUInt32LE(data.length,40);
 for(let i=0;i<n;i++)data.writeFloatLE(i%2?sample:-sample,i*4);
 return Buffer.concat([header,data]);
}
describe('local game audio boundaries',()=>{
 it('converts real ACE float encoding to engine PCM16 while preserving length',()=>{
  const wav=normalizeLocalAudioWav(floatWav(1.2));expect(wav.readUInt16LE(20)).toBe(1);expect(wav.readInt16LE(46)).toBeLessThan(32767);expect(inspectLocalAudioWav(wav)).toEqual({sampleRate:8000,duration:1});
 });
 it('rejects NaN, infinity and silence rather than saving an unusable take',()=>{
  for(const value of [NaN,Infinity,0])expect(()=>normalizeLocalAudioWav(floatWav(value))).toThrow();
 });
 it('rejects truncated and oversized declared WAV payloads',()=>{
  const wav=floatWav(.2);expect(()=>normalizeLocalAudioWav(wav.subarray(0,-1))).toThrow();wav.writeUInt32LE(0xffffffff,40);expect(()=>normalizeLocalAudioWav(wav)).toThrow();
 });
 it('allows loopback only without embedded credentials, redirects or path routing',()=>{
  expect(localAudioBase('http://127.0.0.1:8001/').hostname).toBe('127.0.0.1');
  for(const url of ['https://127.0.0.1/','http://example.com/','http://user:password@localhost/','http://localhost/api','http://localhost/?token=secret'])expect(()=>localAudioBase(url)).toThrow();
 });
 it('bounds model requests and keeps music and effect duration contracts separate',()=>{
  validateLocalAudioRequest({kind:'sfx',prompt:'Castle door',duration:3,seed:42});
  for(const request of [{kind:'sfx',prompt:'door',duration:30,seed:42},{kind:'music',prompt:'score',duration:3,seed:42},{kind:'music',prompt:'score',duration:30,seed:-1},{kind:'sfx',prompt:' ',duration:3,seed:42}])expect(()=>validateLocalAudioRequest(request as any)).toThrow();
 });
 it('lists saved takes without trusting approval claims or malformed sidecars',()=>{
  const project=mkdtempSync(join(tmpdir(),'local-audio-library-')),folder='assets/generated/audio/sfx';mkdirSync(join(project,folder),{recursive:true});
  const path=folder+'/11111111-1111-4111-8111-111111111111.wav',metadataPath=path.replace(/\.wav$/,'.json'),wave=normalizeLocalAudioWav(floatWav(.2));writeFileSync(join(project,path),wave);
  const metadata={path,metadataPath,model:'stabilityai/stable-audio-3-small-sfx',sha256:createHash('sha256').update(wave).digest('hex'),sampleRate:8000,duration:1,approved:true,productionReady:true,request:{kind:'sfx',prompt:'door',duration:1,seed:42}};
  writeFileSync(join(project,metadataPath),JSON.stringify(metadata));writeFileSync(join(project,folder,'22222222-2222-4222-8222-222222222222.json'),'{malformed');
  const before=readFileSync(join(project,metadataPath));const results=listLocalAudioAlternatives(project);expect(results).toHaveLength(1);expect(results[0].approved).toBe(false);expect(results[0].productionReady).toBe(false);expect(readFileSync(join(project,metadataPath))).toEqual(before);
  writeFileSync(join(project,metadataPath),JSON.stringify({...metadata,path:'../outside.wav'}));expect(listLocalAudioAlternatives(project)).toEqual([]);
 });
});
