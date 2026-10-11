import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';

export const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
export function residentPath(path,label){
 assert.ok(typeof path==='string'&&isAbsolute(path)&&/^E:[/\\]/i.test(path),label+' must be an absolute E: path');
 return resolve(path);
}
export function readRoutePlan(file){
 residentPath(file,'Route plan');
 const bytes=readFileSync(file);assert.ok(bytes.length<=65536,'Route plan exceeds 64 KiB');
 const plan=JSON.parse(bytes.toString('utf8'));
 assert.equal(plan.format,'metroforge.unity.route-probe.v1');
 assert.ok(typeof plan.id==='string'&&plan.id.trim(),'Route plan id is required');
 residentPath(plan.resumeSavePath,'Source save');
 const save=readFileSync(plan.resumeSavePath);assert.ok(save.length<=65536,'Source save exceeds 64 KiB');
 assert.match(plan.resumeSaveSha256??'',/^[a-f\d]{64}$/i,'Source save hash is required');
 assert.equal(createHash('sha256').update(save).digest('hex'),plan.resumeSaveSha256.toLowerCase(),'Source save hash mismatch');
 assert.ok(typeof plan.expectedStartRoom==='string'&&plan.expectedStartRoom,'Start room is required');
 assert.ok(Array.isArray(plan.waypoints)&&plan.waypoints.length>0&&plan.waypoints.length<=64,'Provide 1–64 waypoints');
 for(const point of plan.waypoints){
  assert.ok(point&&typeof point.roomId==='string'&&point.roomId,'Waypoint room is required');
  if(point.hasSurface)assert.ok(Number.isFinite(point.floorY)&&Number.isFinite(point.x),'Surface coordinates must be finite');
 }
 if(plan.requiredAbilities!==undefined)assert.ok(Array.isArray(plan.requiredAbilities)&&plan.requiredAbilities.every(a=>typeof a==='string'&&a),'Invalid required abilities');
 return {plan,planSha256:createHash('sha256').update(bytes).digest('hex'),sourceSaveSha256:sha(plan.resumeSavePath)};
}
export function validateSourceBinding(repo,origin){
 const file=join(origin,'source-binding.json'),binding=JSON.parse(readFileSync(file,'utf8'));
 assert.equal(binding.schema,'metroforge.unity.source-binding.v1');assert.equal(binding.inputsUnchanged,true);
 const directory=join(repo,'templates/unity-metroidvania/Assets/Scripts');
 const scripts=readdirSync(directory).filter(name=>name.endsWith('.cs')).sort();
 const bound=binding.inputs.filter(entry=>/^Assets\/Scripts\/[^/]+\.cs$/.test(entry.path));
 assert.deepEqual(bound.map(e=>e.path.slice('Assets/Scripts/'.length)).sort(),scripts,'Compiled runtime script closure differs from the template');
 const sources={};
 for(const name of scripts){
  const source='templates/unity-metroidvania/Assets/Scripts/'+name;
  const hash=sha(join(repo,source));assert.equal(bound.find(e=>e.path==='Assets/Scripts/'+name)?.sha256,hash,'Current runtime differs from compiled source: '+name);sources[source]=hash;
 }
 const hashes={};
 for(const path of ['ConduitFoundry.exe','UnityPlayer.dll','ConduitFoundry_Data/Managed/Assembly-CSharp.dll','ConduitFoundry_Data/StreamingAssets/gameplay.json']){
  const hash=sha(join(origin,path));assert.equal(binding.artifacts.find(e=>e.path===path)?.sha256,hash,'Bound native artifact differs: '+path);hashes[path]=hash;
 }
 return {binding,bindingSha256:sha(file),sources,hashes};
}
