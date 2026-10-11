import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {readRoutePlan,sha,validateSourceBinding} from './unity-route-probe.mjs';
const root=join(process.env.TEMP??'E:/MetroForgeData/Temp','unity-route-probe-tests-'+randomUUID());
mkdirSync(root,{recursive:true});
function fixture(name){
 const dir=join(root,name),repo=join(dir,'repo'),origin=join(dir,'native'),scripts=join(repo,'templates/unity-metroidvania/Assets/Scripts');
 mkdirSync(scripts,{recursive:true});mkdirSync(join(origin,'ConduitFoundry_Data/Managed'),{recursive:true});mkdirSync(join(origin,'ConduitFoundry_Data/StreamingAssets'),{recursive:true});
 const names=['GameBootstrap.cs','AcceptanceDriver.cs','NpcDialogueUI.cs','RegionRouteProbeDriver.cs'];
 const inputs=names.map(n=>{writeFileSync(join(scripts,n),'runtime '+n);return {path:'Assets/Scripts/'+n,sha256:sha(join(scripts,n))};});
 const artifacts=['ConduitFoundry.exe','UnityPlayer.dll','ConduitFoundry_Data/Managed/Assembly-CSharp.dll','ConduitFoundry_Data/StreamingAssets/gameplay.json'].map(p=>{writeFileSync(join(origin,p),'artifact '+p);return {path:p,sha256:sha(join(origin,p))};});
 const binding={schema:'metroforge.unity.source-binding.v1',inputsUnchanged:true,inputs,artifacts};
 const update=()=>writeFileSync(join(origin,'source-binding.json'),JSON.stringify(binding));update();
 return {dir,repo,origin,scripts,binding,update};
}
test('full closure accepts an exact bound runtime and artifacts',()=>{const f=fixture('exact');assert.equal(Object.keys(validateSourceBinding(f.repo,f.origin).sources).length,4);});
test('rejects drift in a runtime file omitted by the previous six-file guard',()=>{const f=fixture('late-drift');writeFileSync(join(f.scripts,'NpcDialogueUI.cs'),'modified');assert.throws(()=>validateSourceBinding(f.repo,f.origin),/NpcDialogueUI/);});
test('rejects a missing compiled runtime file',()=>{const f=fixture('missing');f.binding.inputs.pop();f.update();assert.throws(()=>validateSourceBinding(f.repo,f.origin),/closure differs/);});
test('rejects extra diagnostic runtime in the native build',()=>{const f=fixture('extra');f.binding.inputs.push({path:'Assets/Scripts/SurfaceRouteAuditDriver.cs',sha256:'unused'});f.update();assert.throws(()=>validateSourceBinding(f.repo,f.origin),/closure differs/);});
test('rejects modified native assembly bytes',()=>{const f=fixture('assembly');writeFileSync(join(f.origin,'ConduitFoundry_Data/Managed/Assembly-CSharp.dll'),'modified');assert.throws(()=>validateSourceBinding(f.repo,f.origin),/Bound native artifact differs/);});
test('rejects a build with changed inputs',()=>{const f=fixture('inputs');f.binding.inputsUnchanged=false;f.update();assert.throws(()=>validateSourceBinding(f.repo,f.origin));});
function planFixture(name){const dir=join(root,name);mkdirSync(dir);const save=join(dir,'earned.json');writeFileSync(save,'{"roomId":"author_room"}');const file=join(dir,'plan.json');const plan={format:'metroforge.unity.route-probe.v1',id:'author-region',resumeSavePath:save,resumeSaveSha256:sha(save),expectedStartRoom:'author_room',waypoints:[{roomId:'branch',hasSurface:true,x:100,floorY:200}]};const update=()=>writeFileSync(file,JSON.stringify(plan));update();return {file,save,plan,update};}
test('valid configurable plan binds unchanged source bytes',()=>{const f=planFixture('valid-plan');const before=readFileSync(f.save);assert.equal(readRoutePlan(f.file).sourceSaveSha256,sha(f.save));assert.deepEqual(readFileSync(f.save),before);});
test('rejects mismatched saved progression bytes',()=>{const f=planFixture('hash');writeFileSync(f.save,'changed');assert.throws(()=>readRoutePlan(f.file),/Source save hash mismatch/);});
test('rejects empty waypoint sets',()=>{const f=planFixture('empty');f.plan.waypoints=[];f.update();assert.throws(()=>readRoutePlan(f.file),/waypoints/);});
test('rejects nonnumeric surface coordinates',()=>{const f=planFixture('surface');f.plan.waypoints[0].x='100';f.update();assert.throws(()=>readRoutePlan(f.file),/finite/);});
test('rejects a plan on another volume before reading it',()=>{assert.throws(()=>readRoutePlan('C:/unowned/plan.json'),/absolute E:/);});
